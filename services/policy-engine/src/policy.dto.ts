import {
  IsString,
  IsIn,
  IsUUID,
  IsOptional,
  IsDateString,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// ── PaymentRequest (Policy_Engine input) ────────────────────────

class ChargeDto {
  @IsString()
  amountUsdcMicro!: string;

  @IsIn(["USDC"])
  asset!: "USDC";

  @IsIn(["base-mainnet", "base-sepolia"])
  network!: "base-mainnet" | "base-sepolia";

  @IsString()
  recipient!: string;

  @IsString()
  nonce!: string;
}

export class PaymentRequestDto {
  @IsString()
  smartAccount!: string;

  @IsUUID("7")
  slaId!: string;

  @ValidateNested()
  @Type(() => ChargeDto)
  charge!: ChargeDto;

  @IsUUID("7")
  sessionKeyId!: string;

  @IsString()
  sessionKeySignature!: string;

  @IsUUID("7")
  requestId!: string;

  @IsDateString()
  submittedAt!: string;

  @IsOptional()
  @IsIn([1])
  schemaVersion?: number;
}

// ── Decision (Policy_Engine output) ─────────────────────────────

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

// ── Policy CRUD ─────────────────────────────────────────────────

export class UpdatePolicyDto {
  @IsString()
  perTxCapUsdcMicro!: string;

  @IsString()
  dailyCapUsdcMicro!: string;
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

export class IssueSessionKeyDto {
  @IsUUID("7")
  keyId!: string;

  @IsString()
  smartAccount!: string;

  @IsString()
  publicKey!: string;

  @IsDateString()
  notBefore!: string;

  @IsDateString()
  notAfter!: string;

  @ValidateNested()
  @Type(() => SessionKeyBoundsDto)
  bounds!: SessionKeyBoundsDto;
}

class SessionKeyBoundsDto {
  @IsString()
  perTxCapUsdcMicro!: string;

  @IsString()
  cumulativeCapUsdcMicro!: string;

  @IsOptional()
  allowedRecipients?: string[] | null;
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
    allowedRecipients: string[] | null;
  };
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  issuedAt: string;
  revokedAt: string | null;
}
