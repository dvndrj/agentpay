import {
  IsString,
  IsUUID,
  IsIn,
  IsOptional,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// ── x402 Charge (parsed from header) ────────────────────────────

class X402ChargeDto {
  @IsString()
  amount!: string;

  @IsIn(["USDC"])
  asset!: "USDC";

  @IsString()
  recipient!: string;

  @IsIn(["base-mainnet", "base-sepolia"])
  network!: "base-mainnet" | "base-sepolia";

  @IsString()
  nonce!: string;
}

// ── Settle Request (POST /v1/settle) ────────────────────────────

export class SettleRequestDto {
  @ValidateNested()
  @Type(() => X402ChargeDto)
  charge!: X402ChargeDto;

  @IsString()
  smartAccount!: string;

  @IsUUID("7")
  slaId!: string;

  @IsUUID("7")
  sessionKeyId!: string;

  @IsString()
  sessionKeySignature!: string;

  @IsOptional()
  @IsIn([1])
  schemaVersion?: number;
}

// ── Settle Response (x402 receipt) ──────────────────────────────

export interface SettleResponse {
  /** On-chain transaction hash (escrow lock) */
  txHash: string;
  /** UUIDv7 obligation identifier in RAILS_Ledger */
  obligationId: string;
  /** UUIDv7 policy decision identifier from Policy_Engine */
  policyDecisionId: string;
}

// ── Chain Configuration ─────────────────────────────────────────

export interface ChainConfig {
  /** Base L2 RPC URL */
  rpcUrl: string;
  /** EscrowVault contract address */
  escrowVaultAddress: string;
  /** USDC token contract address on Base L2 */
  usdcAddress: string;
  /** Chain ID (8453 for Base mainnet, 84532 for Base Sepolia) */
  chainId: number;
}
