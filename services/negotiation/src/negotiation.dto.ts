import {
  IsString,
  IsUUID,
  IsInt,
  IsIn,
  IsObject,
  IsOptional,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

// ── Task Description (part of SLA) ──────────────────────────────

class TaskDto {
  @IsString()
  description!: string;

  @IsString()
  @IsOptional()
  inputs_schema_hash?: string;

  @IsString()
  @IsOptional()
  outputs_schema_hash?: string;
}

// ── Create RFQ (14.1) ───────────────────────────────────────────

export class CreateRfqDto {
  @IsUUID("7")
  rfqId!: string;

  @IsString()
  consumerHandle!: string;

  @IsString()
  providerHandle!: string;

  @ValidateNested()
  @Type(() => TaskDto)
  task!: TaskDto;

  /** Deadline in milliseconds from now */
  @IsInt()
  @Min(1)
  deadlineMs!: number;
}

export type RfqStatus = "OPEN" | "QUOTED" | "ACCEPTED" | "CANCELLED" | "EXPIRED";

export interface RfqResponse {
  rfqId: string;
  consumerHandle: string;
  providerHandle: string;
  task: TaskDto;
  deadlineMs: number;
  status: RfqStatus;
  createdAt: string;
  expiresAt: string;
}

// ── Submit Quote (14.1) ─────────────────────────────────────────

export class SubmitQuoteDto {
  @IsString()
  providerHandle!: string;

  @IsString()
  priceUsdcMicro!: string;

  @IsInt()
  @Min(1)
  latencyBoundMs!: number;

  @IsIn(["log_attestation", "tee_attestation"])
  successCriteria!: "log_attestation" | "tee_attestation";

  /** EIP-712 signature over the canonical SLA (provider side) */
  @IsString()
  providerSignature!: string;
}

// ── Accept RFQ (14.1 / 14.2) ────────────────────────────────────

export class AcceptRfqDto {
  @IsString()
  consumerHandle!: string;

  /** EIP-712 signature over the canonical SLA (consumer side) */
  @IsString()
  consumerSignature!: string;
}

// ── SLA Response (14.2) ─────────────────────────────────────────

export interface SlaResponse {
  slaId: string;
  rfqId: string;
  consumerHandle: string;
  providerHandle: string;
  task: Record<string, unknown>;
  priceUsdcMicro: string;
  latencyBoundMs: number;
  successCriteria: "log_attestation" | "tee_attestation";
  expiry: string;
  consumerSignature: string;
  providerSignature: string;
  schemaVersion: number;
  createdAt: string;
}
