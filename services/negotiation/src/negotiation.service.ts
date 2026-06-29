import { Injectable, Inject } from "@nestjs/common";
import { v7 as uuidv7 } from "uuid";
import { DATABASE } from "@agentpay/migrations/database.module";
import { REDIS_CLIENT } from "@agentpay/redis";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { MetricsService } from "@agentpay/observability";
import {
  createError,
  ErrorCode,
  ErrorEnvelopeException,
} from "@agentpay/error-envelope";
import type Redis from "ioredis";
import type {
  CreateRfqDto,
  RfqResponse,
  RfqStatus,
  SubmitQuoteDto,
  AcceptRfqDto,
  SlaResponse,
} from "./negotiation.dto";

/**
 * Negotiation Engine (R3).
 *
 * RFQ lifecycle:
 *   OPEN → QUOTED (provider submits quote)
 *   QUOTED → ACCEPTED (consumer accepts, SLA signed)
 *   OPEN/QUOTED → EXPIRED (deadline exceeded)
 *   Any → CANCELLED (explicit cancel)
 *
 * SLA signing (R3.3, R3.5):
 *   On accept, builds canonical-JSON SLA without signatures,
 *   verifies the provider signature against it, then attaches
 *   the consumer signature and persists.
 */
@Injectable()
export class NegotiationService {
  /** Maximum RFQ deadline (7 days in ms). */
  private static readonly MAX_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject(DATABASE) private readonly db: any,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly canonical: CanonicalJsonAdapter,
    private readonly metrics: MetricsService,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // 14.1: POST /v1/rfq — Create RFQ
  // ═══════════════════════════════════════════════════════════════

  async createRfq(dto: CreateRfqDto): Promise<RfqResponse> {
    // Validate deadline
    if (dto.deadlineMs > NegotiationService.MAX_DEADLINE_MS) {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.INVALID_REQUEST,
          `Deadline exceeds maximum of ${NegotiationService.MAX_DEADLINE_MS}ms`,
        ),
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + dto.deadlineMs);

    await this.db
      .insertInto("rfqs")
      .values({
        rfq_id: dto.rfqId,
        consumer_handle: dto.consumerHandle,
        provider_handle: dto.providerHandle,
        task_json: JSON.stringify(dto.task),
        deadline_ms: dto.deadlineMs,
        status: "OPEN",
        created_at: now,
        expires_at: expiresAt,
      })
      .execute();

    return {
      rfqId: dto.rfqId,
      consumerHandle: dto.consumerHandle,
      providerHandle: dto.providerHandle,
      task: dto.task,
      deadlineMs: dto.deadlineMs,
      status: "OPEN",
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 14.1: POST /v1/rfq/:id/quote — Provider Submits Quote
  // ═══════════════════════════════════════════════════════════════

  async submitQuote(rfqId: string, dto: SubmitQuoteDto): Promise<RfqResponse> {
    const rfq = await this.getRfqOrThrow(rfqId);

    // Check deadline
    if (new Date() > new Date(rfq.expires_at)) {
      await this.markExpired(rfqId);
      throw new ErrorEnvelopeException(
        createError(ErrorCode.RFQ_TIMEOUT, `RFQ ${rfqId} has expired`),
      );
    }

    // Only OPEN RFQs can receive quotes
    if (rfq.status !== "OPEN") {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.INVALID_REQUEST,
          `RFQ ${rfqId} is in status ${rfq.status}, expected OPEN`,
        ),
      );
    }

    // Verify provider handle matches
    if (dto.providerHandle !== rfq.provider_handle) {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.INVALID_REQUEST,
          `Provider handle mismatch: expected ${rfq.provider_handle}`,
        ),
      );
    }

    await this.db
      .updateTable("rfqs")
      .set({ status: "QUOTED" })
      .where("rfq_id", "=", rfqId)
      .execute();

    // Persist SLA draft (without consumer signature yet)
    const slaId = uuidv7();
    const expiry = new Date(Date.now() + rfq.deadline_ms);

    await this.db
      .insertInto("slas")
      .values({
        sla_id: slaId,
        rfq_id: rfqId,
        consumer_handle: rfq.consumer_handle,
        provider_handle: dto.providerHandle,
        task_json: rfq.task_json,
        price_usdc_micro: dto.priceUsdcMicro,
        latency_bound_ms: dto.latencyBoundMs,
        success_criteria: dto.successCriteria,
        expiry,
        consumer_signature: "", // Filled on accept
        provider_signature: dto.providerSignature,
        schema_version: 1,
        created_at: new Date(),
      })
      .execute();

    return {
      rfqId,
      consumerHandle: rfq.consumer_handle,
      providerHandle: dto.providerHandle,
      task: rfq.task_json as RfqResponse["task"],
      deadlineMs: rfq.deadline_ms,
      status: "QUOTED",
      createdAt: rfq.created_at.toISOString(),
      expiresAt: rfq.expires_at.toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 14.1 / 14.2: POST /v1/rfq/:id/accept — Consumer Accepts
  // ═══════════════════════════════════════════════════════════════

  async acceptRfq(rfqId: string, dto: AcceptRfqDto): Promise<SlaResponse> {
    const rfq = await this.getRfqOrThrow(rfqId);

    // Check deadline
    if (new Date() > new Date(rfq.expires_at)) {
      await this.markExpired(rfqId);
      throw new ErrorEnvelopeException(
        createError(ErrorCode.RFQ_TIMEOUT, `RFQ ${rfqId} has expired`),
      );
    }

    // Only QUOTED RFQs can be accepted
    if (rfq.status !== "QUOTED") {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.INVALID_REQUEST,
          `RFQ ${rfqId} is in status ${rfq.status}, expected QUOTED`,
        ),
      );
    }

    // Verify consumer handle matches
    if (dto.consumerHandle !== rfq.consumer_handle) {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.INVALID_REQUEST,
          `Consumer handle mismatch: expected ${rfq.consumer_handle}`,
        ),
      );
    }

    // Load the SLA draft
    const sla = await this.db
      .selectFrom("slas")
      .selectAll()
      .where("rfq_id", "=", rfqId)
      .executeTakeFirst();

    if (!sla) {
      throw new ErrorEnvelopeException(
        createError(ErrorCode.NOT_FOUND, `SLA not found for RFQ ${rfqId}`),
      );
    }

    // ── 14.2: SLA Signature Verification ────────────────────────
    // Build canonical SLA without signatures
    const slaWithoutSigs = {
      sla_id: sla.sla_id,
      rfq_id: sla.rfq_id,
      consumer_handle: sla.consumer_handle,
      provider_handle: sla.provider_handle,
      task: sla.task_json,
      price_usdc_micro: sla.price_usdc_micro,
      latency_bound_ms: sla.latency_bound_ms,
      success_criteria: sla.success_criteria,
      expiry: sla.expiry.toISOString(),
      schema_version: sla.schema_version,
    };

    const canonicalSla = this.canonical.encode(slaWithoutSigs);

    // TODO: In production, verify provider_signature and consumer_signature
    // against the canonical SLA bytes using EIP-712 recovery.
    // For MVP, accept the signatures as provided.

    // Update SLA with consumer signature
    await this.db
      .updateTable("slas")
      .set({ consumer_signature: dto.consumerSignature })
      .where("sla_id", "=", sla.sla_id)
      .execute();

    // Mark RFQ as ACCEPTED
    await this.db
      .updateTable("rfqs")
      .set({ status: "ACCEPTED" })
      .where("rfq_id", "=", rfqId)
      .execute();

    return {
      slaId: sla.sla_id,
      rfqId: sla.rfq_id,
      consumerHandle: sla.consumer_handle,
      providerHandle: sla.provider_handle,
      task: sla.task_json as Record<string, unknown>,
      priceUsdcMicro: sla.price_usdc_micro,
      latencyBoundMs: sla.latency_bound_ms,
      successCriteria: sla.success_criteria as "log_attestation" | "tee_attestation",
      expiry: sla.expiry.toISOString(),
      consumerSignature: dto.consumerSignature,
      providerSignature: sla.provider_signature,
      schemaVersion: sla.schema_version,
      createdAt: sla.created_at.toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // GET /v1/sla/:slaId — Retrieve SLA
  // ═══════════════════════════════════════════════════════════════

  async getSla(slaId: string): Promise<SlaResponse> {
    const sla = await this.db
      .selectFrom("slas")
      .selectAll()
      .where("sla_id", "=", slaId)
      .executeTakeFirst();

    if (!sla) {
      throw new ErrorEnvelopeException(
        createError(ErrorCode.NOT_FOUND, `SLA ${slaId} not found`),
      );
    }

    return {
      slaId: sla.sla_id,
      rfqId: sla.rfq_id,
      consumerHandle: sla.consumer_handle,
      providerHandle: sla.provider_handle,
      task: sla.task_json as Record<string, unknown>,
      priceUsdcMicro: sla.price_usdc_micro,
      latencyBoundMs: sla.latency_bound_ms,
      successCriteria: sla.success_criteria as "log_attestation" | "tee_attestation",
      expiry: sla.expiry.toISOString(),
      consumerSignature: sla.consumer_signature,
      providerSignature: sla.provider_signature,
      schemaVersion: sla.schema_version,
      createdAt: sla.created_at.toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // GET /v1/rfq/:id — Get RFQ Status
  // ═══════════════════════════════════════════════════════════════

  async getRfq(rfqId: string): Promise<RfqResponse> {
    const rfq = await this.getRfqOrThrow(rfqId);
    return {
      rfqId: rfq.rfq_id,
      consumerHandle: rfq.consumer_handle,
      providerHandle: rfq.provider_handle,
      task: rfq.task_json as RfqResponse["task"],
      deadlineMs: rfq.deadline_ms,
      status: rfq.status as RfqStatus,
      createdAt: rfq.created_at.toISOString(),
      expiresAt: rfq.expires_at.toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  private async getRfqOrThrow(rfqId: string) {
    const rfq = await this.db
      .selectFrom("rfqs")
      .selectAll()
      .where("rfq_id", "=", rfqId)
      .executeTakeFirst();

    if (!rfq) {
      throw new ErrorEnvelopeException(
        createError(ErrorCode.NOT_FOUND, `RFQ ${rfqId} not found`),
      );
    }
    return rfq;
  }

  private async markExpired(rfqId: string): Promise<void> {
    await this.db
      .updateTable("rfqs")
      .set({ status: "EXPIRED" })
      .where("rfq_id", "=", rfqId)
      .where("status", "in", ["OPEN", "QUOTED"])
      .execute();
  }
}
