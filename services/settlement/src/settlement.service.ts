import { Injectable, Inject } from "@nestjs/common";
import { v7 as uuidv7 } from "uuid";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { MetricsService } from "@agentpay/observability";
import {
  createError,
  ErrorCode,
  ErrorEnvelopeException,
} from "@agentpay/error-envelope";
import { parseX402, type ChargeRequest } from "./x402";
import { EscrowClient, EscrowRevertError, EscrowTimeoutError } from "./chain/escrow-client";
import type { SettleRequestDto, SettleResponse } from "./settlement.dto";
import type {
  PaymentRequestDto,
  PolicyDecision,
} from "./policy-engine.types";
import type {
  CreateObligationDto,
  ObligationResponse,
} from "./rails-ledger.types";

/**
 * Settlement Service orchestrates the x402 payment flow (R4).
 *
 * Flow per design.md §Settlement_Service:
 * 1. Parse x402 charge header from request
 * 2. Validate asset (USDC only) and network (base-mainnet / base-sepolia)
 * 3. Call Policy_Engine.evaluate (atomic four-check gate)
 * 4. On APPROVED: create DRAFT obligation in RAILS_Ledger
 * 5. Submit EscrowVault.lock() on-chain via viem
 * 6. Return x402 receipt { tx_hash, obligation_id, policy_decision_id }
 *
 * On DENIED: wrap Policy error in `policy_denied` and return to caller.
 * On chain revert: transition obligation to REVERSED and return `chain_revert`.
 * On chain timeout: return `chain_timeout`, keep obligation in DRAFT.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly http: HttpService,
    private readonly canonical: CanonicalJsonAdapter,
    private readonly escrow: EscrowClient,
    private readonly metrics: MetricsService,
    @Inject("POLICY_ENGINE_URL") private readonly policyEngineUrl: string,
    @Inject("RAILS_LEDGER_URL") private readonly railsLedgerUrl: string,
  ) {}

  /**
   * Process a settlement request through the full x402 flow.
   *
   * @param dto - The settlement request containing charge header fields
   * @param requestId - UUIDv7 for tracing (from RequestIdMiddleware)
   * @returns The x402 receipt with txHash, obligationId, policyDecisionId
   */
  async settle(dto: SettleRequestDto, requestId: string): Promise<SettleResponse> {
    const startedAt = Date.now();

    // ── 1. Validate asset and network (R4.4) ────────────────────
    this.validateAsset(dto.charge);
    this.validateNetwork(dto.charge);

    // ── 2. Build Policy_Engine PaymentRequest ────────────────────
    const paymentRequest: PaymentRequestDto = {
      smartAccount: dto.smartAccount,
      slaId: dto.slaId,
      charge: {
        amountUsdcMicro: dto.charge.amount,
        asset: dto.charge.asset,
        network: dto.charge.network,
        recipient: dto.charge.recipient,
        nonce: dto.charge.nonce,
      },
      sessionKeyId: dto.sessionKeyId,
      sessionKeySignature: dto.sessionKeySignature,
      requestId,
      submittedAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    // ── 3. Call Policy_Engine.evaluate (R7) ────────────────────
    let decision: PolicyDecision;
    try {
      const response = await firstValueFrom(
        this.http.post<PolicyDecision>(
          `${this.policyEngineUrl}/v1/policy/evaluate`,
          paymentRequest,
        ),
      );
      decision = response.data;
    } catch (err) {
      this.recordLatency(startedAt, "POLICY_UNAVAILABLE");
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.POLICY_UNAVAILABLE,
          "Policy_Engine is unreachable",
          { inner: this.extractErrorMessage(err) },
          requestId,
        ),
      );
    }

    // ── 4. On DENIED: wrap and return (R4.4) ───────────────────
    if (decision.verdict === "DENIED") {
      this.recordLatency(startedAt, decision.reasonCode ?? "POLICY_DENIED");
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.POLICY_DENIED,
          decision.reasonMessage ?? "Payment denied by Policy_Engine",
          {
            policyDecisionId: decision.policyDecisionId,
            reasonCode: decision.reasonCode,
          },
          requestId,
          decision.policyDecisionId,
        ),
      );
    }

    // ── 5. Create DRAFT obligation in RAILS_Ledger (R9.1) ──────
    const obligationId = uuidv7();
    const createObligation: CreateObligationDto = {
      obligationId,
      slaId: dto.slaId,
      consumerHandle: dto.smartAccount, // In MVP, handle == smartAccount
      providerHandle: dto.charge.recipient,
      consumerSmartAccount: dto.smartAccount,
      providerSmartAccount: dto.charge.recipient,
      amountUsdcMicro: dto.charge.amount,
      asset: dto.charge.asset,
      network: dto.charge.network,
      nonce: dto.charge.nonce,
      policyDecisionId: decision.policyDecisionId,
      schemaVersion: 1,
    };

    let obligation: ObligationResponse;
    try {
      const response = await firstValueFrom(
        this.http.post<ObligationResponse>(
          `${this.railsLedgerUrl}/v1/rails/obligations`,
          createObligation,
        ),
      );
      obligation = response.data;
    } catch (err) {
      this.recordLatency(startedAt, "RAILS_UNAVAILABLE");
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.INTERNAL_ERROR,
          "RAILS_Ledger is unreachable",
          { inner: this.extractErrorMessage(err) },
          requestId,
          decision.policyDecisionId,
        ),
      );
    }

    // ── 6. Submit EscrowVault.lock() on-chain (R4.2) ────────────
    let txHash: string;
    try {
      txHash = await this.escrow.lock(
        obligationId,
        dto.smartAccount,
        dto.charge.recipient,
        dto.charge.amount,
      );
    } catch (err) {
      // ── 6a. Chain revert → transition to REVERSED (R4.5) ───
      const revertReason = this.extractErrorMessage(err);

      try {
        await firstValueFrom(
          this.http.post(
            `${this.railsLedgerUrl}/v1/rails/obligations/${obligationId}/verdict`,
            { performance: "FAIL", evidenceHash: revertReason },
          ),
        );
      } catch {
        // Best effort — obligation may already be in the right state
      }

      this.recordLatency(startedAt, "CHAIN_REVERT");
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.CHAIN_REVERT,
          `EscrowVault.lock() reverted: ${revertReason}`,
          { revertReason, obligationId },
          requestId,
          decision.policyDecisionId,
        ),
      );
    }

    // ── 7. Return x402 receipt (R4.3) ──────────────────────────
    this.recordLatency(startedAt, "SUCCESS");
    return {
      txHash,
      obligationId,
      policyDecisionId: decision.policyDecisionId,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Validate the asset field (R4.4).
   * Only "USDC" is supported in MVP.
   */
  private validateAsset(charge: ChargeRequest): void {
    if (charge.asset !== "USDC") {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.UNSUPPORTED_ASSET,
          `Unsupported asset: ${charge.asset}. Only USDC is supported.`,
          { asset: charge.asset },
        ),
      );
    }
  }

  /**
   * Validate the network field (R4.4).
   * Only "base-mainnet" and "base-sepolia" are supported.
   */
  private validateNetwork(charge: ChargeRequest): void {
    if (!["base-mainnet", "base-sepolia"].includes(charge.network)) {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.UNSUPPORTED_NETWORK,
          `Unsupported network: ${charge.network}. Use base-mainnet or base-sepolia.`,
          { network: charge.network },
        ),
      );
    }
  }

  /**
   * Record settlement latency metric.
   */
  private recordLatency(startedAt: number, reasonCode: string): void {
    const latencySec = (Date.now() - startedAt) / 1000;
    this.metrics.settlementLatencySeconds.observe(
      { network: reasonCode },
      latencySec,
    );
  }

  /**
   * Extract a human-readable error message from any thrown value.
   */
  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message: unknown }).message);
    }
    return "Unknown error";
  }
}
