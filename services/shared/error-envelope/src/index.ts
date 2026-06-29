import { v7 as uuidv7 } from "uuid";

/**
 * Well-known structured error codes used across all AgentPay services.
 * The Policy_Engine error codes are defined separately in design.md §Error Handling.
 */
export const ErrorCode = {
  // ── General ──
  INVALID_REQUEST: "invalid_request",
  INTERNAL_ERROR: "internal_error",
  NOT_FOUND: "not_found",

  // ── Policy_Engine (7.1–7.6, 13.4) ──
  PER_TRANSACTION_CAP_EXCEEDED: "per_transaction_cap_exceeded",
  DAILY_CAP_EXCEEDED: "daily_cap_exceeded",
  INSUFFICIENT_BALANCE: "insufficient_balance",
  SIGNATURE_INVALID: "signature_invalid",
  KEY_EXPIRED: "key_expired",
  KEY_BOUNDS_EXCEEDED: "key_bounds_exceeded",
  OVERSIGHT_REJECTED: "oversight_rejected",
  INVALID_PAYMENT_REQUEST: "invalid_payment_request",

  // ── Settlement_Service ──
  UNSUPPORTED_ASSET: "unsupported_asset",
  UNSUPPORTED_NETWORK: "unsupported_network",
  X402_PARSE_ERROR: "x402_parse_error",
  CHAIN_REVERT: "chain_revert",
  CHAIN_TIMEOUT: "chain_timeout",
  POLICY_DENIED: "policy_denied",
  POLICY_UNAVAILABLE: "policy_unavailable",

  // ── RAILS_Ledger ──
  INVALID_FINALITY_TRANSITION: "invalid_finality_transition",
  OBLIGATION_NOT_FOUND: "obligation_not_found",
  DUPLICATE_OBLIGATION: "duplicate_obligation",

  // ── Audit_Logger ──
  IMMUTABLE_RECORD: "immutable_record",
  INTERVENTION_PENDING: "intervention_pending",

  // ── Identity_Registry ──
  SIGNATURE_MISSING: "signature_missing",
  HANDLE_NOT_FOUND: "handle_not_found",

  // ── Negotiation_Engine ──
  RFQ_TIMEOUT: "rfq_timeout",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Structured error envelope returned by every AgentPay API.
 *
 * Corresponds to design.md §Error Handling:
 * ```
 * {
 *   "code": "snake_case_identifier",
 *   "message": "human-readable explanation",
 *   "details": { ... optional, code-specific fields ... },
 *   "request_id": "UUIDv7",
 *   "policy_decision_id": "UUIDv7 | null"
 * }
 * ```
 */
export interface ErrorEnvelope {
  /** Machine-readable error code (see ErrorCode) */
  code: ErrorCodeValue;
  /** Human-readable explanation */
  message: string;
  /** Optional code-specific fields (e.g. field path, revert reason) */
  details?: Record<string, unknown>;
  /** UUIDv7 of the originating request */
  requestId: string;
  /** UUIDv7 of the policy decision, if one was reached before the error */
  policyDecisionId: string | null;
}

/**
 * Create a structured error envelope.
 *
 * @param code    - Machine-readable error code from ErrorCode
 * @param message - Human-readable explanation
 * @param details - Optional code-specific fields
 * @param requestId - UUIDv7 of the request (generated if omitted)
 * @param policyDecisionId - Policy decision id if applicable
 */
export function createError(
  code: ErrorCodeValue,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string,
  policyDecisionId: string | null = null,
): ErrorEnvelope {
  return {
    code,
    message,
    details,
    requestId: requestId ?? uuidv7(),
    policyDecisionId,
  };
}

/**
 * NestJS exception filter that converts ErrorEnvelope into an HTTP response.
 *
 * Usage:
 * ```ts
 * throw new ErrorEnvelopeException(createError(ErrorCode.INSUFFICIENT_BALANCE, "..."));
 * ```
 */
import { HttpException, HttpStatus } from "@nestjs/common";

const CODE_TO_HTTP: Record<string, HttpStatus> = {
  [ErrorCode.PER_TRANSACTION_CAP_EXCEEDED]: HttpStatus.PAYMENT_REQUIRED,
  [ErrorCode.DAILY_CAP_EXCEEDED]: HttpStatus.PAYMENT_REQUIRED,
  [ErrorCode.INSUFFICIENT_BALANCE]: HttpStatus.PAYMENT_REQUIRED,
  [ErrorCode.SIGNATURE_INVALID]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.KEY_EXPIRED]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.KEY_BOUNDS_EXCEEDED]: HttpStatus.PAYMENT_REQUIRED,
  [ErrorCode.OVERSIGHT_REJECTED]: HttpStatus.FORBIDDEN,
  [ErrorCode.INVALID_PAYMENT_REQUEST]: HttpStatus.BAD_REQUEST,
  [ErrorCode.UNSUPPORTED_ASSET]: HttpStatus.BAD_REQUEST,
  [ErrorCode.UNSUPPORTED_NETWORK]: HttpStatus.BAD_REQUEST,
  [ErrorCode.X402_PARSE_ERROR]: HttpStatus.BAD_REQUEST,
  [ErrorCode.CHAIN_REVERT]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.CHAIN_TIMEOUT]: HttpStatus.GATEWAY_TIMEOUT,
  [ErrorCode.POLICY_DENIED]: HttpStatus.PAYMENT_REQUIRED,
  [ErrorCode.POLICY_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  [ErrorCode.INVALID_FINALITY_TRANSITION]: HttpStatus.CONFLICT,
  [ErrorCode.OBLIGATION_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.DUPLICATE_OBLIGATION]: HttpStatus.CONFLICT,
  [ErrorCode.IMMUTABLE_RECORD]: HttpStatus.METHOD_NOT_ALLOWED,
  [ErrorCode.INTERVENTION_PENDING]: HttpStatus.LOCKED,
  [ErrorCode.SIGNATURE_MISSING]: HttpStatus.BAD_REQUEST,
  [ErrorCode.HANDLE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.RFQ_TIMEOUT]: HttpStatus.GATEWAY_TIMEOUT,
  [ErrorCode.INVALID_REQUEST]: HttpStatus.BAD_REQUEST,
  [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
};

export class ErrorEnvelopeException extends HttpException {
  public readonly envelope: ErrorEnvelope;

  constructor(envelope: ErrorEnvelope) {
    const status = CODE_TO_HTTP[envelope.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    super(envelope, status);
    this.envelope = envelope;
  }
}
