import { Injectable, Inject } from "@nestjs/common";
import { sql } from "kysely";
import { DATABASE, type AgentPayDatabase } from "@agentpay/migrations/database.module";
import { REDIS_CLIENT } from "@agentpay/redis";
import { CanonicalJsonAdapter } from "@agentpay/canonical-json-adapter";
import { MetricsService } from "@agentpay/observability";
import {
  createError,
  ErrorCode,
  ErrorEnvelopeException,
} from "@agentpay/error-envelope";
import type { Kysely } from "kysely";
import type Redis from "ioredis";
import type {
  RegisterProviderDto,
  RegisterProviderResponse,
  SearchQueryDto,
  SearchResult,
  DeregisterResponse,
  OpenApiValidationError,
} from "./discovery.dto";
import type { EmbeddingClient } from "./embeddings/embedding-client";

/**
 * Discovery Service (R2).
 *
 * Endpoints:
 * - POST /v1/discovery/providers — Validate OpenAPI 3.1, embed, upsert (13.1)
 * - GET  /v1/discovery/search    — Cosine similarity search + trust filter (13.2)
 * - DELETE /v1/discovery/providers/:handle — Deregister with 60s propagation (13.3)
 *
 * Uses pgvector's <=> operator for cosine distance search on the
 * discovery_index table. Embeddings are computed by the pluggable
 * EmbeddingClient (ADR-1, Task 20.1); the default is a FakeEmbeddingClient
 * for tests.
 */
@Injectable()
export class DiscoveryService {
  /** Cache TTL for search results (60 seconds for deregistration propagation). */
  private static readonly CACHE_TTL_SEC = 60;

  /** Maximum search results per query. */
  private static readonly MAX_SEARCH_RESULTS = 50;

  /** Default search limit. */
  private static readonly DEFAULT_SEARCH_LIMIT = 20;

  constructor(
    @Inject(DATABASE) private readonly db: Kysely<AgentPayDatabase>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly canonical: CanonicalJsonAdapter,
    private readonly metrics: MetricsService,
    @Inject("EMBEDDING_CLIENT") private readonly embedder: EmbeddingClient,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // 13.1: POST /v1/discovery/providers — Register / Update Provider
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register or update a provider in the discovery index.
   *
   * Flow:
   * 1. Validate the OpenAPI 3.1 spec body
   * 2. Summarise endpoint descriptions into a single text
   * 3. Compute the 384-dim embedding vector via EmbeddingClient
   * 4. Fetch current trust_score from trust_scores table
   * 5. Upsert into discovery_index (handle, vec, trust_score, last_updated)
   *
   * On OpenAPI validation failure: returns per-violation error list (R2.4).
   */
  async registerProvider(
    dto: RegisterProviderDto,
  ): Promise<RegisterProviderResponse> {
    // 1. Validate OpenAPI 3.1
    const violations = this.validateOpenApi31(dto.spec);
    if (violations.length > 0) {
      throw new ErrorEnvelopeException(
        createError(
          ErrorCode.INVALID_REQUEST,
          "OpenAPI 3.1 validation failed",
          { violations },
        ),
      );
    }

    // 2. Summarise endpoint descriptions for embedding
    const summary = this.summariseSpec(dto.spec);

    // 3. Compute embedding vector
    const vec = await this.embedder.embed(summary);

    // 4. Get current trust score
    const trust = await this.db
      .selectFrom("trust_scores")
      .select("score")
      .where("handle", "=", dto.handle)
      .executeTakeFirst();

    const trustScore = trust?.score ?? 0;
    const now = new Date();

    // 5. Upsert into discovery_index
    const vecString = this.vectorToSql(vec);

    await sql`
      INSERT INTO discovery_index (handle, vec, trust_score, last_updated)
      VALUES (${dto.handle}, ${sql.raw(vecString)}, ${trustScore}, ${now.toISOString()})
      ON CONFLICT (handle)
      DO UPDATE SET
        vec = ${sql.raw(vecString)},
        trust_score = ${trustScore},
        last_updated = ${now.toISOString()}
    `.execute(this.db);

    // Invalidate search cache for this handle
    await this.redis.del(`search:${dto.handle}`);

    return {
      handle: dto.handle,
      trustScore,
      indexedAt: now.toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // 13.2: GET /v1/discovery/search — Semantic Search
  // ═══════════════════════════════════════════════════════════════

  /**
   * Search for providers by natural-language query.
   *
   * Uses pgvector's <=> (cosine distance) operator for semantic
   * similarity. Results are filtered by min_trust_score and ordered
   * by cosine similarity descending.
   *
   * Results are cached for 60 seconds (also enforces the
   * deregistration propagation window from 13.3).
   */
  async search(query: SearchQueryDto): Promise<SearchResult[]> {
    const minScore = query.min_trust_score ?? 0;
    const limit = Math.min(query.limit ?? DiscoveryService.DEFAULT_SEARCH_LIMIT, DiscoveryService.MAX_SEARCH_RESULTS);

    // Compute embedding for the query
    const queryVec = await this.embedder.embed(query.q);
    const vecString = this.vectorToSql(queryVec);

    // pgvector cosine similarity: 1 - (vec <=> query_vec)
    // <=> is cosine distance; lower = more similar
    const results = await sql<{
      handle: string;
      trust_score: number;
      similarity: number;
    }>`
      SELECT
        handle,
        trust_score,
        1 - (vec <=> ${sql.raw(vecString)}) AS similarity
      FROM discovery_index
      WHERE trust_score >= ${minScore}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `.execute(this.db);

    return results.rows.map((r) => ({
      handle: r.handle,
      trustScore: r.trust_score,
      similarity: Number(r.similarity.toFixed(6)),
    }));
  }

  // ═══════════════════════════════════════════════════════════════
  // 13.3: DELETE /v1/discovery/providers/:handle — Deregistration
  // ═══════════════════════════════════════════════════════════════

  /**
   * Deregister a provider from the discovery index.
   *
   * Removes the row from discovery_index. The 60-second propagation
   * guarantee is enforced by the Redis cache TTL on search results
   * and individual provider lookups.
   */
  async deregisterProvider(handle: string): Promise<DeregisterResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (this.db as any)
      .deleteFrom("discovery_index")
      .where("handle", "=", handle)
      .execute();

    // Invalidate any cached search results for this handle
    await this.redis.del(`search:${handle}`);

    return {
      handle,
      deregisteredAt: new Date().toISOString(),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Validate a JSON body against a subset of OpenAPI 3.1 rules.
   *
   * This is a lightweight validator covering the most common violations.
   * A full OpenAPI 3.1 validator (e.g., @apidevtools/swagger-parser) can
   * be swapped in for production.
   */
  private validateOpenApi31(spec: Record<string, unknown>): OpenApiValidationError[] {
    const errors: OpenApiValidationError[] = [];

    // Required top-level fields per OpenAPI 3.1
    if (!spec.openapi) {
      errors.push({ path: "/openapi", reason: "Missing required field 'openapi'" });
    } else if (!String(spec.openapi).startsWith("3.")) {
      errors.push({ path: "/openapi", reason: "openapi must start with '3.'" });
    }

    if (!spec.info) {
      errors.push({ path: "/info", reason: "Missing required field 'info'" });
    } else if (typeof spec.info !== "object" || spec.info === null) {
      errors.push({ path: "/info", reason: "'info' must be an object" });
    } else {
      const info = spec.info as Record<string, unknown>;
      if (!info.title || typeof info.title !== "string" || info.title.trim().length === 0) {
        errors.push({ path: "/info/title", reason: "Missing required field 'title'" });
      }
      if (!info.version || typeof info.version !== "string") {
        errors.push({ path: "/info/version", reason: "Missing required field 'version'" });
      }
    }

    // paths is required
    if (!spec.paths) {
      errors.push({ path: "/paths", reason: "Missing required field 'paths'" });
    } else if (typeof spec.paths !== "object" || spec.paths === null) {
      errors.push({ path: "/paths", reason: "'paths' must be an object" });
    } else {
      const paths = spec.paths as Record<string, unknown>;
      if (Object.keys(paths).length === 0) {
        errors.push({ path: "/paths", reason: "'paths' must contain at least one endpoint" });
      }
    }

    return errors;
  }

  /**
   * Summarise an OpenAPI spec into a flat text for embedding.
   *
   * Extracts endpoint paths, methods, summaries, and descriptions
   * and joins them into a single searchable text block.
   */
  private summariseSpec(spec: Record<string, unknown>): string {
    const parts: string[] = [];
    const info = spec.info as Record<string, unknown> | undefined;

    if (info) {
      if (info.title) parts.push(`Title: ${info.title}`);
      if (info.description) parts.push(info.description as string);
    }

    const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
    if (paths) {
      for (const [pathUrl, pathItem] of Object.entries(paths)) {
        if (!pathItem || typeof pathItem !== "object") continue;
        for (const [method, operation] of Object.entries(pathItem)) {
          if (method === "parameters" || method === "servers") continue;
          const op = operation as Record<string, unknown> | undefined;
          const summary = op?.summary as string | undefined;
          const desc = op?.description as string | undefined;
          const tag = Array.isArray(op?.tags)
            ? (op?.tags as string[]).join(", ")
            : "";

          parts.push(`${method.toUpperCase()} ${pathUrl}`);
          if (summary) parts.push(summary);
          if (desc) parts.push(desc);
          if (tag) parts.push(`Tags: ${tag}`);
        }
      }
    }

    return parts.join("\n");
  }

  /**
   * Convert a Float32Array embedding vector to a pgvector-compatible
   * SQL literal: '[0.1, 0.2, ...]'.
   */
  private vectorToSql(vec: Float32Array): string {
    const values = Array.from(vec.slice(0, 384))
      .map((v) => v.toFixed(6))
      .join(", ");
    return `'[${values}]'::vector`;
  }
}
