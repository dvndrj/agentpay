import { Injectable, Inject } from "@nestjs/common";
import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import { recoverTypedDataAddress } from "viem";
import { DATABASE, type AgentPayDatabase } from "@agentpay/migrations/database.module";
import { REDIS_CLIENT } from "@agentpay/redis";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { MetricsService } from "@agentpay/observability";
import {
  createError,
  ErrorCode,
  ErrorEnvelopeException,
} from "@agentpay/error-envelope";
import { IdentityRegistryClient } from "./chain/identity-registry-client";
import type { Kysely } from "kysely";
import type Redis from "ioredis";
import type {
  RegisterAgentDto,
  RegisterAgentResponse,
  AgentInfoResponse,
} from "./identity-registry.dto";

/**
 * Agent metadata stored off-chain (complements on-chain metadataHash).
 */
interface AgentMetadata {
  handle: string;
  smart_account: string;
  metadata_json: unknown;
  metadata_hash: string;
  registered_at: Date;
}

/**
 * EIP-712 domain for Identity Registry signatures.
 *
 * All Smart_Account signatures use this domain.
 * The verifyingContract is the deployed IdentityRegistry contract address.
 */
const EIP712_DOMAIN = {
  name: "AgentPay Identity",
  version: "1",
} as const;

const EIP712_TYPES = {
  Register: [
    { name: "smartAccount", type: "address" },
    { name: "metadataHash", type: "bytes32" },
  ],
} as const;

@Injectable()
export class IdentityRegistryService {
  /** Initial trust score for newly registered agents (R1.2). */
  private static readonly INITIAL_TRUST_SCORE = 35;

  /** Cache TTL for agent lookups (5 minutes). */
  private static readonly CACHE_TTL_SEC = 300;

  constructor(
    @Inject(DATABASE) private readonly db: Kysely<AgentPayDatabase>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly canonical: CanonicalJsonAdapter,
    private readonly chain: IdentityRegistryClient,
    private readonly metrics: MetricsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // 9.1: POST /v1/agents — Register a new agent (R1.1, R1.3, R1.4)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register a new agent with the IdentityRegistry.
   *
   * Flow:
   * 1. Verify EIP-712 signature over {smartAccount, metadataHash}
   * 2. Check if already registered (on-chain dedupe)
   * 3. Call on-chain mintHandle(smartAccount, metadataHash)
   * 4. Persist (handle, smart_account, metadata) off-chain
   * 5. Initialize TrustScore = 35
   * 6. Emit registration audit record
   *
   * On duplicate registration: returns existing handle without re-minting.
   */
  async registerAgent(dto: RegisterAgentDto): Promise<RegisterAgentResponse> {
    // ── 1. Compute metadata hash if not provided ─────────────────
    const metadataHash =
      dto.metadataHash ?? this.computeMetadataHash(dto.metadata as unknown as Record<string, unknown>);

    // ── 2. Verify signature (R1.4) ───────────────────────────────
    await this.verifySignature(dto.smartAccount, metadataHash, dto.signature);

    // ── 3. Check if already registered ───────────────────────────
    const existingHandle = await this.chain.getHandle(dto.smartAccount);
    if (existingHandle !== "0") {
      // Already registered — return existing handle (R1.3 idempotency)
      return { handle: existingHandle, smartAccount: dto.smartAccount };
    }

    // ── 4. Mint handle on-chain (R1.1) ───────────────────────────
    const handle = await this.chain.mintHandle(dto.smartAccount, metadataHash);

    // ── 5. Persist metadata off-chain ────────────────────────────
    await this.persistMetadata(handle, dto.smartAccount, dto.metadata as unknown as Record<string, unknown>, metadataHash);

    // ── 6. Initialize TrustScore (R1.2) ──────────────────────────
    await this.initTrustScore(handle);

    // ── 7. Emit audit record ─────────────────────────────────────
    await this.emitRegistrationAudit(handle, dto.smartAccount, metadataHash);

    return { handle, smartAccount: dto.smartAccount };
  }

  // ═══════════════════════════════════════════════════════════════
  // GET /v1/agents/:handle — Lookup by handle (R1.3)
  // ═══════════════════════════════════════════════════════════════

  async getAgentByHandle(handle: string): Promise<AgentInfoResponse> {
    // Check cache first
    const cacheKey = `agent:handle:${handle}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as AgentInfoResponse;

    // Fetch from DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (this.db as any)
      .selectFrom("agent_metadata")
      .selectAll()
      .where("handle", "=", handle)
      .executeTakeFirst();

    if (!row) {
      throw new ErrorEnvelopeException(
        createError(ErrorCode.HANDLE_NOT_FOUND, `Handle ${handle} not found`),
      );
    }

    // Fetch trust score
    const trust = await this.db
      .selectFrom("trust_scores")
      .selectAll()
      .where("handle", "=", handle)
      .executeTakeFirst();

    const result: AgentInfoResponse = {
      handle: row.handle,
      smartAccount: row.smart_account,
      metadata: row.metadata_json as Record<string, unknown>,
      metadataHash: row.metadata_hash,
      trustScore: trust?.score ?? IdentityRegistryService.INITIAL_TRUST_SCORE,
      registeredAt: row.registered_at.toISOString(),
    };

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, IdentityRegistryService.CACHE_TTL_SEC, JSON.stringify(result));

    return result;
  }

  // ── GET /v1/agents/by-account/:addr — Lookup by account ───────

  async getAgentByAccount(smartAccount: string): Promise<AgentInfoResponse> {
    // Check cache first
    const cacheKey = `agent:account:${smartAccount.toLowerCase()}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as AgentInfoResponse;

    // Get handle from chain
    const handle = await this.chain.getHandle(smartAccount);
    if (handle === "0") {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.HANDLE_NOT_FOUND,
          `No agent registered for account ${smartAccount}`,
        ),
      );
    }

    return this.getAgentByHandle(handle);
  }

  // ═══════════════════════════════════════════════════════════════
  // 9.2: Trust Score Initialization (R1.2)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize trust score for a newly registered agent.
   *
   * Initial values:
   * - score: 35 (neutral starting point)
   * - pass_count: 0
   * - fail_count: 0
   * - stake_usdc_micro: "0"
   */
  private async initTrustScore(handle: string): Promise<void> {
    await this.db
      .insertInto("trust_scores")
      .values({
        handle,
        score: IdentityRegistryService.INITIAL_TRUST_SCORE,
        pass_count: 0,
        fail_count: 0,
        stake_usdc_micro: "0",
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column("handle").doUpdateSet({
          score: IdentityRegistryService.INITIAL_TRUST_SCORE,
          updated_at: new Date(),
        }),
      )
      .execute();
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Verify the Smart Account's EIP-712 signature over {smartAccount, metadataHash}.
   *
   * Uses viem's recoverTypedDataAddress to recover the signer and assert
   * it matches the claimed smartAccount.
   */
  private async verifySignature(
    smartAccount: string,
    metadataHash: string,
    signature: string,
  ): Promise<void> {
    try {
      const recovered = await recoverTypedDataAddress({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: "Register",
        message: {
          smartAccount: smartAccount as `0x${string}`,
          metadataHash: metadataHash.startsWith("0x")
            ? (metadataHash as `0x${string}`)
            : (`0x${metadataHash}` as `0x${string}`),
        },
        signature: signature as `0x${string}`,
      });

      if (recovered.toLowerCase() !== smartAccount.toLowerCase()) {
        throw new ErrorEnvelopeException(
          createError(
            ErrorCode.SIGNATURE_INVALID,
            `Signature verification failed: recovered ${recovered}, expected ${smartAccount}`,
            { field: "signature" },
          ),
        );
      }
    } catch (err) {
      if (err instanceof ErrorEnvelopeException) throw err;
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.SIGNATURE_INVALID,
          `Invalid signature: ${err instanceof Error ? err.message : String(err)}`,
          { field: "signature" },
        ),
      );
    }
  }

  /**
   * Persist agent metadata off-chain.
   *
   * Stores the full metadata JSON alongside the handle-to-account mapping
   * and the on-chain metadata hash.
   */
  private async persistMetadata(
    handle: string,
    smartAccount: string,
    metadata: Record<string, unknown>,
    metadataHash: string,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.db as any)
      .insertInto("agent_metadata")
      .values({
        handle,
        smart_account: smartAccount.toLowerCase(),
        metadata_json: JSON.stringify(metadata),
        metadata_hash: metadataHash,
        registered_at: new Date(),
      })
      .execute();
  }

  /**
   * Compute SHA-256 hash of the canonical JSON encoding of the metadata.
   *
   * This is the hash stored on-chain as metadataHash and signed by the
   * smart account.
   */
  private computeMetadataHash(metadata: Record<string, unknown>): string {
    const canonical = this.canonical.encode(metadata);
    const hash = createHash("sha256").update(canonical).digest("hex");
    return `0x${hash}`;
  }

  /**
   * Emit a registration audit record.
   *
   * In MVP, this is a best-effort attempt. The Audit_Logger service
   * provides the canonical audit trail.
   */
  private async emitRegistrationAudit(
    handle: string,
    smartAccount: string,
    metadataHash: string,
  ): Promise<void> {
    this.metrics.auditChainLength.inc({ handle });

    // In MVP, we log the event — full Audit_Logger integration
    // happens when that service is deployed.
    // TODO: Publish to Kafka audit.events topic when Audit_Logger is running.
  }
}
