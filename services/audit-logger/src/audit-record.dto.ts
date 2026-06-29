import { IsString, IsIn, IsObject, IsOptional, IsDateString } from "class-validator";

/**
 * Event types per design.md §Audit_Record data model.
 */
export const AUDIT_EVENT_TYPES = [
  "agent_input",
  "agent_reasoning",
  "agent_output",
  "policy_decision",
  "finality_transition",
  "oversight_pause",
  "oversight_decision",
  "registration",
  "settlement_attempt",
  "policy_update",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/**
 * Body for POST /v1/audit/append.
 * Matches the AuditRecord model from design.md.
 */
export class AppendAuditEventDto {
  @IsString()
  recordId!: string;

  @IsString()
  handle!: string;

  @IsIn(AUDIT_EVENT_TYPES)
  eventType!: AuditEventType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  @IsOptional()
  actor?: string;

  @IsDateString()
  @IsOptional()
  timestamp?: string;
}

/**
 * Query params for GET /v1/audit/export.
 */
export class ExportAuditQueryDto {
  @IsString()
  handle!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
