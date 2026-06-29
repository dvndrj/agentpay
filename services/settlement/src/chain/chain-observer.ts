import { Injectable, Inject } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { MetricsService } from "@agentpay/observability";
import { EscrowClient } from "./escrow-client";
import type { Hash } from "viem";

/**
 * Job data enqueued for tx confirmation watching.
 */
export interface WatchTxJob {
  obligationId: string;
  txHash: Hash;
  submittedAt: string;
}

/**
 * Chain Observer — monitors submitted transactions for confirmation
 * and advances obligation state from DRAFT → PROVISIONAL (R4.3).
 *
 * Also handles chain failures (R4.5):
 * - On revert: transitions obligation to REVERSED via RAILS_Ledger
 * - On timeout: keeps obligation in DRAFT, emits chain_timeout
 *
 * Uses EscrowClient to wait for k=3 confirmations on Base L2.
 * On success, calls RAILS_Ledger.markProvisional(tx_hash).
 */
@Injectable()
export class ChainObserver {
  /** Number of confirmations required for Base L2 finality */
  private static readonly REQUIRED_CONFIRMATIONS = 3;

  /** Maximum time to wait for confirmations (2 minutes) */
  private static readonly CONFIRMATION_TIMEOUT_MS = 120_000;

  constructor(
    private readonly escrow: EscrowClient,
    private readonly http: HttpService,
    private readonly metrics: MetricsService,
    @Inject("RAILS_LEDGER_URL") private readonly railsLedgerUrl: string,
  ) {}

  /**
   * Watch a submitted transaction for confirmations.
   *
   * This is the entry point for the BullMQ worker (Task 8.3).
   *
   * On k=3 confirmations:
   *   Calls RAILS_Ledger.markProvisional(txHash) → transitions DRAFT to PROVISIONAL
   *
   * On revert:
   *   Calls RAILS_Ledger.submitVerdict(FAIL) → transitions to REVERSED
   *   Emits chain_revert metric
   *
   * On timeout:
   *   Keeps obligation in DRAFT (no state change)
   *   Emits chain_timeout metric — the caller can retry or escalate
   *
   * On reorg (block depth < k):
   *   Re-throws so the BullMQ worker re-queues the job
   */
  async watchTransaction(job: WatchTxJob): Promise<{
    obligationId: string;
    txHash: string;
    result: "provisional" | "reverted" | "timeout";
  }> {
    const { obligationId, txHash } = job;

    try {
      // ── Wait for k confirmations ──────────────────────────────
      const receipt = await this.escrow.waitForConfirmations(
        txHash,
        ChainObserver.REQUIRED_CONFIRMATIONS,
        ChainObserver.CONFIRMATION_TIMEOUT_MS,
      );

      if (receipt.status === "reverted") {
        // ── Chain revert → transition to REVERSED (R4.5) ────────
        await this.markReversed(obligationId, txHash);
        this.metrics.obligationStateTransitionsTotal.inc({
          from: "DRAFT",
          to: "REVERSED",
        });
        return { obligationId, txHash, result: "reverted" };
      }

      // ── k confirmations → transition to PROVISIONAL (R4.3) ────
      await this.markProvisional(obligationId, txHash);
      this.metrics.obligationStateTransitionsTotal.inc({
        from: "DRAFT",
        to: "PROVISIONAL",
      });
      return { obligationId, txHash, result: "provisional" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // ── Timeout → keep DRAFT (R4.5) ──────────────────────────
      if (message.includes("timed out") || message.includes("timeout")) {
        this.metrics.obligationStateTransitionsTotal.inc({
          from: "DRAFT",
          to: "DRAFT", // unchanged
        });
        return { obligationId, txHash, result: "timeout" };
      }

      // ── Unknown error → re-throw for BullMQ retry ────────────
      throw err;
    }
  }

  /**
   * Call RAILS_Ledger.markProvisional to advance DRAFT → PROVISIONAL.
   */
  private async markProvisional(obligationId: string, txHash: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.railsLedgerUrl}/v1/rails/obligations/${obligationId}/provisional`,
        { txHash },
      ),
    );
  }

  /**
   * Call RAILS_Ledger.submitVerdict(FAIL) to advance DRAFT → REVERSED.
   */
  private async markReversed(obligationId: string, txHash: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${this.railsLedgerUrl}/v1/rails/obligations/${obligationId}/verdict`,
        {
          performance: "FAIL",
          evidenceHash: `chain-revert:${txHash}`,
        },
      ),
    );
  }
}
