/**
 * RAILS_Ledger types used by the Settlement Service.
 *
 * These mirror the DTOs defined in services/rails-ledger/src/rails-ledger.dto.ts
 * without importing them directly (services communicate via HTTP, not DI).
 */

export interface CreateObligationDto {
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
  policyDecisionId: string;
  schemaVersion?: number;
}

export type FinalityState = "DRAFT" | "PROVISIONAL" | "FINAL" | "REVERSED";

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
  finalityState: FinalityState;
  policyDecisionId: string;
  txHash: string | null;
  evidenceHash: string | null;
  createdAt: string;
  schemaVersion: number;
}
