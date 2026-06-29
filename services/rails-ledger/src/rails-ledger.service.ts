import { Injectable, Inject } from "@nestjs/common";
import { DATABASE, type AgentPayDatabase } from "@agentpay/migrations/database.module";
import { createError, ErrorCode, ErrorEnvelopeException } from "@agentpay/error-envelope";
import type { Kysely } from "kysely";
import type {
  CreateObligationDto,
  MarkProvisionalDto,
  SubmitVerdictDto,
  ObligationResponse,
  FinalityState,
} from "./rails-ledger.dto";

/**
 * Valid state transitions per design.md §RAILS_Ledger:
 *
 *   DRAFT      → PROVISIONAL  (on tx_confirmed)
 *   PROVISIONAL → FINAL        (on perf=PASS)
 *   PROVISIONAL → REVERSED     (on perf=FAIL or settlement_revert)
 */
const VALID_TRANSITIONS: Record<FinalityState, readonly FinalityState[]> = {
  DRAFT: ["PROVISIONAL"],
  PROVISIONAL: ["FINAL", "REVERSED"],
  FINAL: [],
  REVERSED: [],
};

@Injectable()
export class RailsLedgerService {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<AgentPayDatabase>,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // 7.1: Obligation Creation
  // ═══════════════════════════════════════════════════════════════

  async createObligation(dto: CreateObligationDto): Promise<ObligationResponse> {
    const now = new Date();

    // Idempotency: if obligation already exists, return it (duplicate key → replay)
    const existing = await this.db
      .selectFrom("obligations")
      .selectAll()
      .where("obligation_id", "=", dto.obligationId)
      .executeTakeFirst();

    if (existing) {
      return this.toResponse(existing);
    }

    await this.db
      .insertInto("obligations")
      .values({
        obligation_id: dto.obligationId,
        sla_id: dto.slaId,
        consumer_smart_account: dto.consumerSmartAccount,
        provider_smart_account: dto.providerSmartAccount,
        amount_usdc_micro: dto.amountUsdcMicro,
        finality_state: "DRAFT",
        policy_decision_id: dto.policyDecisionId,
        created_at: now,
      })
      .execute();

    return this.getObligation(dto.obligationId);
  }

  // ═══════════════════════════════════════════════════════════════
  // 7.2: Finality State Machine
  // ═══════════════════════════════════════════════════════════════

  async markProvisional(
    obligationId: string,
    dto: MarkProvisionalDto,
  ): Promise<ObligationResponse> {
    return this.transition(obligationId, "PROVISIONAL", () => ({
      tx_hash: dto.txHash,
    }));
  }

  async submitVerdict(
    obligationId: string,
    dto: SubmitVerdictDto,
  ): Promise<ObligationResponse> {
    const target: FinalityState = dto.performance === "PASS" ? "FINAL" : "REVERSED";

    const result = await this.transition(obligationId, target, () => ({
      evidence_hash: dto.evidenceHash,
      // In MVP: stage the transition in DB; on-chain release/refund
      // is deferred to Task 18.1.
    }));

    // 7.3: Terminal-state event emission
    // In MVP, we emit via Kafka. The obligation.transitions topic
    // carries the event; Audit_Logger consumes it.
    // TODO: publish to Kafka obligation.transitions topic

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // Query
  // ═══════════════════════════════════════════════════════════════

  async getObligation(obligationId: string): Promise<ObligationResponse> {
    const row = await this.db
      .selectFrom("obligations")
      .selectAll()
      .where("obligation_id", "=", obligationId)
      .executeTakeFirst();

    if (!row) {
      throw new ErrorEnvelopeException(
        createError(ErrorCode.OBLIGATION_NOT_FOUND, `Obligation ${obligationId} not found`),
      );
    }

    return this.toResponse(row);
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute a state transition with guard checks.
   *
   * 1. Fetch the obligation (must exist)
   * 2. Validate the transition against VALID_TRANSITIONS
   * 3. Apply the update with caller-provided extra columns
   */
  private async transition(
    obligationId: string,
    target: FinalityState,
    extraColumns: () => Record<string, string>,
  ): Promise<ObligationResponse> {
    const row = await this.db
      .selectFrom("obligations")
      .selectAll()
      .where("obligation_id", "=", obligationId)
      .executeTakeFirst();

    if (!row) {
      throw new ErrorEnvelopeException(
        createError(ErrorCode.OBLIGATION_NOT_FOUND, `Obligation ${obligationId} not found`),
      );
    }

    const current = row.finality_state as FinalityState;
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.INVALID_FINALITY_TRANSITION,
          `Cannot transition from ${current} to ${target}`,
          { obligationId, current, target },
        ),
      );
    }

    const extra = extraColumns();
    await this.db
      .updateTable("obligations")
      .set({
        finality_state: target,
        ...extra,
      })
      .where("obligation_id", "=", obligationId)
      .execute();

    return this.getObligation(obligationId);
  }

  private toResponse(row: Record<string, unknown>): ObligationResponse {
    return {
      obligationId: row.obligation_id as string,
      slaId: row.sla_id as string,
      consumerHandle: "", // not in MVP obligation table; added post-MVP
      providerHandle: "", // not in MVP obligation table
      consumerSmartAccount: row.consumer_smart_account as string,
      providerSmartAccount: row.provider_smart_account as string,
      amountUsdcMicro: row.amount_usdc_micro as string,
      asset: "USDC",
      network: "base-sepolia", // from env/config in production
      nonce: "", // not persisted separately in MVP
      finalityState: row.finality_state as FinalityState,
      policyDecisionId: row.policy_decision_id as string,
      txHash: (row.tx_hash as string) ?? null,
      evidenceHash: (row.evidence_hash as string) ?? null,
      createdAt: (row.created_at as Date).toISOString(),
      schemaVersion: 1,
    };
  }
}
