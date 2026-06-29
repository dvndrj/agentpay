import {
  IsString,
  IsOptional,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// ── Agent Metadata (signed by Smart Account) ────────────────────

class AgentMetadataDto {
  /** Human-readable agent name */
  @IsString()
  name!: string;

  /** Agent description / service offering summary */
  @IsString()
  @IsOptional()
  description?: string;

  /** Optional URL for agent endpoint or OpenAPI spec */
  @IsString()
  @IsOptional()
  endpointUrl?: string;

  /** Email or other contact */
  @IsString()
  @IsOptional()
  contactEmail?: string;

  /** Arbitrary key-value metadata */
  @IsOptional()
  extras?: Record<string, unknown>;
}

// ── Register Agent Request ──────────────────────────────────────

export class RegisterAgentDto {
  /** Smart account address (0x...) that will own the handle */
  @IsString()
  smartAccount!: string;

  /** EIP-712 signature over { smartAccount, metadataHash } */
  @IsString()
  signature!: string;

  /** Agent metadata (stored off-chain, hash on-chain) */
  @ValidateNested()
  @Type(() => AgentMetadataDto)
  metadata!: AgentMetadataDto;

  @IsOptional()
  @IsString()
  metadataHash?: string;
}

// ── Registration Response ───────────────────────────────────────

export interface RegisterAgentResponse {
  /** The numeric handle (ERC-721 token ID) */
  handle: string;
  /** The smart account bound to this handle */
  smartAccount: string;
}

// ── Agent Info Response ─────────────────────────────────────────

export interface AgentInfoResponse {
  handle: string;
  smartAccount: string;
  metadata: Record<string, unknown>;
  metadataHash: string;
  trustScore: number;
  registeredAt: string;
}

// ── Chain Configuration ─────────────────────────────────────────

export interface ChainConfig {
  rpcUrl: string;
  identityRegistryAddress: string;
  chainId: number;
}
