/**
 * Policy_Engine types used by the Settlement Service.
 *
 * These mirror the DTOs defined in services/policy-engine/src/policy.dto.ts
 * without importing them directly (services communicate via HTTP, not DI).
 */

export interface PaymentRequestDto {
  smartAccount: string;
  slaId: string;
  charge: {
    amountUsdcMicro: string;
    asset: "USDC";
    network: "base-mainnet" | "base-sepolia";
    recipient: string;
    nonce: string;
  };
  sessionKeyId: string;
  sessionKeySignature: string;
  requestId: string;
  submittedAt: string;
  schemaVersion?: number;
}

export type PolicyVerdict = "APPROVED" | "DENIED";

export type PolicyErrorCode =
  | "per_transaction_cap_exceeded"
  | "daily_cap_exceeded"
  | "insufficient_balance"
  | "signature_invalid"
  | "key_expired"
  | "key_bounds_exceeded"
  | "oversight_rejected";

export interface PolicyDecision {
  verdict: PolicyVerdict;
  policyDecisionId: string;
  reasonCode: PolicyErrorCode | null;
  reasonMessage: string | null;
  evaluatedAt: string;
  inputsHash: string;
}
