import {
  IsString,
  IsObject,
  IsOptional,
  IsInt,
  Min,
  Max,
} from "class-validator";

// ── Provider Registration (13.1) ────────────────────────────────

/**
 * Validated OpenAPI 3.1 document that a provider submits for discovery indexing.
 *
 * The `spec` field must be a valid OpenAPI 3.1 JSON body.
 * Validation errors are returned as a list of per-violation messages.
 */
export class RegisterProviderDto {
  @IsString()
  handle!: string;

  @IsObject()
  spec!: Record<string, unknown>;
}

export interface RegisterProviderResponse {
  handle: string;
  trustScore: number;
  indexedAt: string;
}

// ── Search (13.2) ───────────────────────────────────────────────

export interface SearchQueryDto {
  /** Natural-language query string to embed and search against */
  q: string;
  /** Minimum trust score filter (default: 0) */
  min_trust_score?: number;
  /** Maximum number of results (default: 20, max: 50) */
  limit?: number;
}

export interface SearchResult {
  handle: string;
  trustScore: number;
  /** Cosine similarity score (higher = more relevant) */
  similarity: number;
}

// ── Deregistration (13.3) ───────────────────────────────────────

export interface DeregisterResponse {
  handle: string;
  deregisteredAt: string;
}

// ── OpenAPI 3.1 Validation Error ─────────────────────────────────

export interface OpenApiValidationError {
  /** JSON pointer to the violating location in the spec */
  path: string;
  /** Human-readable reason for the violation */
  reason: string;
}
