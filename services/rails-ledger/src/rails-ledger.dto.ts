import { IsString, IsUUID, IsIn, IsOptional } from "class-validator";

// ── Obligation Creation ─────────────────────────────────────────

export class CreateObligationDto {
  @IsUUID("7")
  obligationId!: string;

  @IsUUID("7")
  slaId!: string;

  @IsString()
  consumerHandle!: string;

  @IsString()
  providerHandle!: string;

  @IsString()
  consumerSmartAccount!: string;

  @IsString()
  providerSmartAccount!: string;

  @IsString()
  amountUsdcMicro!: string;

  @IsIn(["USDC"])
  asset!: "USDC";

  @IsIn(["base-mainnet", "base-sepolia"])
  network!: "base-mainnet" | "base-sepolia";

  @IsString()
  nonce!: string;

  @IsUUID("7")
  policyDecisionId!: string;

  @IsOptional()
  @IsIn([1])
  schemaVersion?: number;
}

// ── Provisional Transition ──────────────────────────────────────

export class MarkProvisionalDto {
  @IsString()
  txHash!: string;
}

// ── Verdict ─────────────────────────────────────────────────────

export class SubmitVerdictDto {
  @IsIn(["PASS", "FAIL"])
  performance!: "PASS" | "FAIL";

  @IsString()
  evidenceHash!: string;
}

// ── Obligation Response ─────────────────────────────────────────

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
