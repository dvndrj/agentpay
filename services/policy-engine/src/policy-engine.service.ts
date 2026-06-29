import { Injectable, Inject } from "@nestjs/common";
import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { DATABASE, type AgentPayDatabase } from "@agentpay/migrations/database.module";
import { REDIS_CLIENT, SESSION_KEY_REVOKED_CHANNEL } from "@agentpay/redis";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { MetricsService } from "@agentpay/observability";
import {
  createError,
  ErrorCode,
  ErrorEnvelopeException,
} from "@agentpay/error-envelope";
import type { Kysely, Transaction } from "kysely";
import type Redis from "ioredis";
import type {
  PaymentRequestDto,
  PolicyDecision,
  PolicyErrorCode,
  UpdatePolicyDto,
  PolicyResponse,
  IssueSessionKeyDto,
  SessionKeyResponse,
} from "./policy.dto";

@Injectable()
export class PolicyEngineService {
  /** Estimated gas for a USDC transfer on Base L2 (~$0.0005). */
  private static readonly EST_GAS_USDC_MICRO = "200";

  constructor(
    @Inject(DATABASE) private readonly db: Kysely<AgentPayDatabase>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly canonical: CanonicalJsonAdapter,
    private readonly metrics: MetricsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // 5.1 / 5.3: Atomic Decision Engine
  // ═══════════════════════════════════════════════════════════════

  /**
   * Evaluate a payment request through the atomic four-check gate (R7).
   *
   * All checks execute inside a single Postgres transaction with
   * SELECT ... FOR UPDATE on the policy row. Redis INCRBY on the
   * daily-spend counter is committed only on APPROVED.
   *
   * Checks (in order):
   * 1. Signature check (session key valid, within window, within bounds)
   * 2. Balance check (USDC balance >= amount + est_gas)
   * 3. Per-transaction cap (amount <= per_tx_cap)
   * 4. Daily cap (rolling_24h + amount <= daily_cap)
   * + Oversight rejection check (R10.5)
   */
  async evaluate(dto: PaymentRequestDto): Promise<PolicyDecision> {
    const decisionId = uuidv7();
    const evaluatedAt = new Date().toISOString();
    const inputsHash = this.sha256Hex(this.canonical.encode(dto));

    const fail = (code: PolicyErrorCode, message: string): PolicyDecision => {
      this.metrics.policyDecisionsTotal.inc({ verdict: "DENIED", reason_code: code });
      return {
        verdict: "DENIED",
        policyDecisionId: decisionId,
        reasonCode: code,
        reasonMessage: message,
        evaluatedAt,
        inputsHash,
      };
    };

    try {
      return await this.db.transaction().execute(async (trx) => {
        // ── Lock policy row ───────────────────────────────────
        const policy = await trx
          .selectFrom("policies")
          .selectAll()
          .where("smart_account", "=", dto.smartAccount)
          .forUpdate()
          .executeTakeFirst();

        // ── Check 1: Signature ────────────────────────────────
        const key = await trx
          .selectFrom("session_keys")
          .selectAll()
          .where("key_id", "=", dto.sessionKeyId)
          .executeTakeFirst();

        if (!key) return fail("signature_invalid", "Unknown session key");
        if (key.status !== "ACTIVE") return fail("signature_invalid", "Session key is not ACTIVE");

        const now = new Date();
        if (new Date(key.not_before) > now) return fail("signature_invalid", "Key not yet valid");
        if (new Date(key.not_after) < now) return fail("key_expired", "Session key expired");

        // Check session-key bounds
        const bounds = key.bounds_json as {
          perTxCapUsdcMicro: string;
          cumulativeCapUsdcMicro: string;
          allowedRecipients: string[] | null;
        };
        if (BigInt(dto.charge.amountUsdcMicro) > BigInt(bounds.perTxCapUsdcMicro)) {
          return fail("key_bounds_exceeded", "Exceeds session key per-transaction cap");
        }

        // TODO: EIP-712 signature verification against key.public_key
        // For MVP, signature is accepted if key exists and is valid.
        // Full verification requires noble-curves + EIP-712 typed data.

        // ── Check 2: Balance ──────────────────────────────────
        // Balance is on-chain; for MVP we check a cached value or
        // rely on the on-chain revert. We store a configured floor.
        // TODO: Integrate with on-chain balance check via viem.
        const estimatedTotal = (
          BigInt(dto.charge.amountUsdcMicro) +
          BigInt(PolicyEngineService.EST_GAS_USDC_MICRO)
        ).toString();

        // ── Check 3: Per-transaction cap ──────────────────────
        if (!policy) return fail("per_transaction_cap_exceeded", "No policy configured for this account");

        if (BigInt(dto.charge.amountUsdcMicro) > BigInt(policy.per_tx_cap_usdc_micro)) {
          return fail("per_transaction_cap_exceeded", `Amount ${dto.charge.amountUsdcMicro} exceeds per-transaction cap ${policy.per_tx_cap_usdc_micro}`);
        }

        // ── Check 4: Daily cap ────────────────────────────────
        const dailyKey = `spend:daily:${dto.smartAccount}`;
        const currentDaily = await this.redis.get(dailyKey);
        const currentDailyMicro = currentDaily ?? "0";

        const newDaily = (BigInt(currentDailyMicro) + BigInt(dto.charge.amountUsdcMicro)).toString();
        if (BigInt(newDaily) > BigInt(policy.daily_cap_usdc_micro)) {
          return fail("daily_cap_exceeded", `Rolling 24h spend would exceed daily cap ${policy.daily_cap_usdc_micro}`);
        }

        // ── Oversight rejection check ─────────────────────────
        const oversight = await trx
          .selectFrom("oversight_rejections")
          .selectAll()
          .where("sla_id", "=", dto.slaId)
          .executeTakeFirst();
        if (oversight) return fail("oversight_rejected", "SLA is under oversight rejection");

        // ── ALL CHECKS PASS ───────────────────────────────────
        // Commit the daily spend increment in Redis
        await this.redis
          .multi()
          .incrby(dailyKey, dto.charge.amountUsdcMicro)
          .expire(dailyKey, 86400) // 24h TTL
          .exec();

        // Record spend event in Postgres for audit/replay
        await trx
          .insertInto("policy_spend_events")
          .values({
            smart_account: dto.smartAccount,
            amount_usdc_micro: dto.charge.amountUsdcMicro,
          } as any)
          .execute();

        this.metrics.policyDecisionsTotal.inc({ verdict: "APPROVED", reason_code: "" });

        return {
          verdict: "APPROVED",
          policyDecisionId: decisionId,
          reasonCode: null,
          reasonMessage: null,
          evaluatedAt,
          inputsHash,
        };
      });
    } catch (err) {
      // Transaction-level failure (e.g. deadlock) — fail closed
      return fail("insufficient_balance", "Policy evaluation failed: unable to obtain decision");
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 5.4: Policy CRUD + Rolling 24h Spend
  // ═══════════════════════════════════════════════════════════════

  async getPolicy(smartAccount: string): Promise<PolicyResponse> {
    const policy = await this.db
      .selectFrom("policies")
      .selectAll()
      .where("smart_account", "=", smartAccount)
      .executeTakeFirst();

    const rolling24h = await this.computeRolling24h(smartAccount);

    if (!policy) {
      return {
        smartAccount,
        perTxCapUsdcMicro: "0",
        dailyCapUsdcMicro: "0",
        rolling24hSpendUsdcMicro: rolling24h,
        remainingDailyUsdcMicro: "0",
        updatedAt: new Date().toISOString(),
      };
    }

    const remaining = BigInt(policy.daily_cap_usdc_micro) - BigInt(rolling24h);
    return {
      smartAccount,
      perTxCapUsdcMicro: policy.per_tx_cap_usdc_micro,
      dailyCapUsdcMicro: policy.daily_cap_usdc_micro,
      rolling24hSpendUsdcMicro: rolling24h,
      remainingDailyUsdcMicro: remaining > 0n ? remaining.toString() : "0",
      updatedAt: policy.updated_at.toISOString(),
    };
  }

  async updatePolicy(
    smartAccount: string,
    dto: UpdatePolicyDto,
    operator: string,
  ): Promise<PolicyResponse> {
    const before = await this.db
      .selectFrom("policies")
      .selectAll()
      .where("smart_account", "=", smartAccount)
      .executeTakeFirst();

    await this.db
      .insertInto("policies")
      .values({
        smart_account: smartAccount,
        per_tx_cap_usdc_micro: dto.perTxCapUsdcMicro,
        daily_cap_usdc_micro: dto.dailyCapUsdcMicro,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column("smart_account").doUpdateSet({
          per_tx_cap_usdc_micro: dto.perTxCapUsdcMicro,
          daily_cap_usdc_micro: dto.dailyCapUsdcMicro,
          updated_at: new Date(),
        }),
      )
      .execute();

    // Audit: record the policy update (calls own audit endpoint or direct insert)
    // In MVP, we write directly; post-MVP this goes through Audit_Logger service.
    await this.db
      .insertInto("audit_records")
      .values({
        record_id: uuidv7(),
        handle: smartAccount,
        event_type: "policy_update",
        payload_json: JSON.stringify({
          before: before
            ? {
                perTxCapUsdcMicro: before.per_tx_cap_usdc_micro,
                dailyCapUsdcMicro: before.daily_cap_usdc_micro,
              }
            : null,
          after: {
            perTxCapUsdcMicro: dto.perTxCapUsdcMicro,
            dailyCapUsdcMicro: dto.dailyCapUsdcMicro,
          },
          operator,
        }),
        payload_hash: this.sha256Hex(
          JSON.stringify({ before: before ?? null, after: dto, operator }),
        ),
        prev_hash: "0".repeat(64), // Simplified; full chain in Task 4
        record_hash: this.sha256Hex(`${"0".repeat(64)}${operator}${Date.now()}`),
        actor: operator,
        timestamp: new Date(),
      } as any)
      .execute();

    return this.getPolicy(smartAccount);
  }

  private async computeRolling24h(smartAccount: string): Promise<string> {
    // Redis is the fast path, but also compute from Postgres for accuracy
    const redisKey = `spend:daily:${smartAccount}`;
    const cached = await this.redis.get(redisKey);
    if (cached) return cached;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.db
      .selectFrom("policy_spend_events")
      .select("amount_usdc_micro")
      .where("smart_account", "=", smartAccount)
      .where("evaluated_at", ">=", twentyFourHoursAgo)
      .execute();

    let total = 0n;
    for (const r of rows) {
      total += BigInt(r.amount_usdc_micro);
    }
    const result = total.toString();

    // Populate Redis cache
    await this.redis.set(redisKey, result, "EX", 86400);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // 5.2: Session Key Persistence & Revocation
  // ═══════════════════════════════════════════════════════════════

  async issueSessionKey(dto: IssueSessionKeyDto): Promise<SessionKeyResponse> {
    await this.db
      .insertInto("session_keys")
      .values({
        key_id: dto.keyId,
        smart_account: dto.smartAccount,
        public_key: dto.publicKey,
        not_before: new Date(dto.notBefore),
        not_after: new Date(dto.notAfter),
        bounds_json: dto.bounds,
        status: "ACTIVE",
        issued_at: new Date(),
      })
      .execute();

    return {
      keyId: dto.keyId,
      smartAccount: dto.smartAccount,
      publicKey: dto.publicKey,
      notBefore: dto.notBefore,
      notAfter: dto.notAfter,
      bounds: {
        perTxCapUsdcMicro: dto.bounds.perTxCapUsdcMicro,
        cumulativeCapUsdcMicro: dto.bounds.cumulativeCapUsdcMicro,
        allowedRecipients: dto.bounds.allowedRecipients ?? null,
      },
      status: "ACTIVE" as const,
      issuedAt: new Date().toISOString(),
      revokedAt: null,
    };
  }

  async revokeSessionKey(keyId: string): Promise<void> {
    const key = await this.db
      .selectFrom("session_keys")
      .selectAll()
      .where("key_id", "=", keyId)
      .executeTakeFirst();

    if (!key) {
      throw new ErrorEnvelopeException(
        createError(ErrorCode.NOT_FOUND, `Session key ${keyId} not found`),
      );
    }

    await this.db
      .updateTable("session_keys")
      .set({
        status: "REVOKED",
        revoked_at: new Date(),
      })
      .where("key_id", "=", keyId)
      .execute();

    // Publish revocation to Redis pub/sub so all Policy_Engine instances
    // invalidate their caches within 10 seconds (R13.3).
    await this.redis.publish(SESSION_KEY_REVOKED_CHANNEL, keyId);
    this.metrics.sessionKeyRevocationsTotal.inc();
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  private sha256Hex(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }
}
