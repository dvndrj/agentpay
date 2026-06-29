import { Injectable, Inject } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DATABASE, type AgentPayDatabase } from "@agentpay/migrations/database.module";
import { REDIS_CLIENT } from "@agentpay/redis";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import {
  createError,
  ErrorCode,
  ErrorEnvelopeException,
} from "@agentpay/error-envelope";
import type { Kysely } from "kysely";
import type Redis from "ioredis";
import type { AppendAuditEventDto, ExportAuditQueryDto } from "./audit-record.dto";

/** Genesis prev_hash: 64 hex zeros (R10.1). */
const GENESIS_PREV_HASH = "0".repeat(64);

/** Redis key prefix for audit chain head per handle. */
const HEAD_KEY_PREFIX = "audit:head:";

interface AuditRecordRow {
  record_id: string;
  handle: string;
  event_type: string;
  payload_json: unknown;
  payload_hash: string;
  prev_hash: string;
  record_hash: string;
  actor: string;
  timestamp: Date;
}

@Injectable()
export class AuditLoggerService {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<AgentPayDatabase>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly canonical: CanonicalJsonAdapter,
  ) {}

  /**
   * Append an audit event to the hash-chained log (R10.1).
   *
   * Algorithm:
   * 1. Canonical-encode the payload and compute `payload_hash = sha256(canonical(payload))`
   * 2. Fetch `prev_hash` from Redis head cache per handle (fallback: latest row in Postgres)
   * 3. Compute `record_hash = sha256(prev_hash || payload_hash || timestamp || actor)`
   * 4. Persist the row
   * 5. Advance Redis head cache
   */
  async append(dto: AppendAuditEventDto): Promise<{ recordId: string; recordHash: string }> {
    const actor = dto.actor ?? "system";
    const timestamp = dto.timestamp ?? new Date().toISOString();

    // 1. Compute payload hash
    const payloadHash = this.sha256Hex(this.canonical.encode(dto.payload));

    // 2. Get previous hash
    const prevHash = await this.getChainHead(dto.handle);

    // 3. Compute record hash
    const recordHash = this.sha256Hex(
      `${prevHash}${payloadHash}${timestamp}${actor}`,
    );

    // 4. Persist
    try {
      await this.db
        .insertInto("audit_records")
        .values({
          record_id: dto.recordId,
          handle: dto.handle,
          event_type: dto.eventType,
          payload_json: JSON.stringify(dto.payload),
          payload_hash: payloadHash,
          prev_hash: prevHash,
          record_hash: recordHash,
          actor,
          timestamp: new Date(timestamp),
        })
        .execute();
    } catch (err: unknown) {
      // Postgres RULE blocks UPDATE/DELETE but INSERT should succeed.
      // On duplicate key, return structured error.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate key") || msg.includes("unique")) {
        throw new ErrorEnvelopeException(
          createError(ErrorCode.DUPLICATE_OBLIGATION, "Audit record with this ID already exists", {
            recordId: dto.recordId,
          }),
        );
      }
      throw err;
    }

    // 5. Advance Redis head
    await this.redis.set(
      `${HEAD_KEY_PREFIX}${dto.handle}`,
      recordHash,
      "EX",
      86400, // 24h TTL, fallback to Postgres on miss
    );

    return { recordId: dto.recordId, recordHash };
  }

  /**
   * Return the head (latest record_hash) for a handle (R10.1).
   * Checks Redis first, falls back to the latest row in Postgres.
   */
  async getHead(handle: string): Promise<{ recordHash: string }> {
    const hash = await this.getChainHead(handle);
    return { recordHash: hash };
  }

  /**
   * Export audit records for a handle within a time range (R10.3).
   */
  async exportRecords(query: ExportAuditQueryDto) {
    const rows = await this.db
      .selectFrom("audit_records")
      .selectAll()
      .where("handle", "=", query.handle)
      .where("timestamp", ">=", new Date(query.from))
      .where("timestamp", "<=", new Date(query.to))
      .orderBy("timestamp", "asc")
      .execute();

    return rows.map((r: AuditRecordRow) => ({
      recordId: r.record_id,
      handle: r.handle,
      eventType: r.event_type,
      payload: r.payload_json,
      payloadHash: r.payload_hash,
      prevHash: r.prev_hash,
      recordHash: r.record_hash,
      actor: r.actor,
      timestamp: r.timestamp.toISOString(),
    }));
  }

  // ── Private helpers ───────────────────────────────────────────

  private sha256Hex(input: string): string {
    return createHash("sha256").update(input).digest("hex");
  }

  /**
   * Fetch the chain head for a handle: Redis cache → Postgres fallback.
   * Returns genesis hash (64 zeros) if no records exist.
   */
  private async getChainHead(handle: string): Promise<string> {
    const redisKey = `${HEAD_KEY_PREFIX}${handle}`;
    const cached = await this.redis.get(redisKey);
    if (cached) return cached;

    const row = await this.db
      .selectFrom("audit_records")
      .select("record_hash")
      .where("handle", "=", handle)
      .orderBy("timestamp", "desc")
      .limit(1)
      .executeTakeFirst();

    const hash = (row as { record_hash: string } | undefined)?.record_hash ?? GENESIS_PREV_HASH;

    // Populate cache
    await this.redis.set(redisKey, hash, "EX", 86400);
    return hash;
  }
}
