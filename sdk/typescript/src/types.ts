/**
 * AgentPay SDK — public types (R11).
 */

// ── Client Configuration ────────────────────────────────────────

export interface AgentPayConfig {
  /** Base URL of the AgentPay API gateway (e.g. "https://api.agentpay.xyz") */
  baseUrl: string;
  /** Optional API key for authenticated endpoints */
  apiKey?: string;
  /** Optional custom fetch implementation (for testing) */
  fetch?: typeof fetch;
}

// ── Registration ────────────────────────────────────────────────

export interface AgentMetadata {
  /** Human-readable agent name */
  name: string;
  /** Agent description */
  description?: string;
  /** Optional endpoint URL */
  endpointUrl?: string;
  /** Contact email */
  contactEmail?: string;
  /** Arbitrary extra key-value pairs */
  extras?: Record<string, unknown>;
}

export interface RegisterAgentRequest {
  smartAccount: `0x${string}`;
  signature: `0x${string}`;
  metadata: AgentMetadata;
  metadataHash?: `0x${string}`;
}

export interface RegisterAgentResponse {
  handle: string;
  smartAccount: string;
}

// ── x402 Payment ────────────────────────────────────────────────

export interface ChargeRequest {
  amount: string;
  asset: "USDC";
  recipient: `0x${string}`;
  network: "base-mainnet" | "base-sepolia";
  nonce: string;
}

export interface SettleResponse {
  txHash: `0x${string}`;
  obligationId: string;
  policyDecisionId: string;
}

export interface SessionKey {
  keyId: string;
  /** Private key for signing (hex-encoded, never sent over the wire) */
  privateKey: `0x${string}`;
}

// ── Obligations ─────────────────────────────────────────────────

export interface ObligationResponse {
  obligationId: string;
  slaId: string;
  consumerHandle: string;
  providerHandle: string;
  consumerSmartAccount: string;
  providerSmartAccount: string;
  amountUsdcMicro: string;
  asset: "USDC";
  network: "base-mainnet" | "base-sepolia";
  nonce: string;
  finalityState: "DRAFT" | "PROVISIONAL" | "FINAL" | "REVERSED";
  policyDecisionId: string;
  txHash: string | null;
  evidenceHash: string | null;
  createdAt: string;
}

// ── Policy ──────────────────────────────────────────────────────

export interface PolicyConfig {
  perTxCapUsdcMicro: string;
  dailyCapUsdcMicro: string;
}

export interface PolicyResponse {
  smartAccount: string;
  perTxCapUsdcMicro: string;
  dailyCapUsdcMicro: string;
  rolling24hSpendUsdcMicro: string;
  remainingDailyUsdcMicro: string;
  updatedAt: string;
}

// ── Session Keys ────────────────────────────────────────────────

export interface IssueSessionKeyRequest {
  keyId: string;
  smartAccount: string;
  publicKey: string;
  notBefore: string;
  notAfter: string;
  bounds: {
    perTxCapUsdcMicro: string;
    cumulativeCapUsdcMicro: string;
    allowedRecipients?: string[];
  };
}

export interface SessionKeyResponse {
  keyId: string;
  smartAccount: string;
  publicKey: string;
  notBefore: string;
  notAfter: string;
  bounds: {
    perTxCapUsdcMicro: string;
    cumulativeCapUsdcMicro: string;
    allowedRecipients?: string[];
  };
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  issuedAt: string;
  revokedAt: string | null;
}

// ── Discovery (MVP stub) ────────────────────────────────────────

export interface AgentDiscoveryResult {
  handle: string;
  metadata: AgentMetadata;
  trustScore: number;
}

// ── Negotiation (MVP stub) ──────────────────────────────────────

export interface SLA {
  slaId: string;
  consumerHandle: string;
  providerHandle: string;
  terms: Record<string, unknown>;
  expiresAt: string;
}

// ── Errors ──────────────────────────────────────────────────────

export interface AgentPayError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
  policyDecisionId: string | null;
}
