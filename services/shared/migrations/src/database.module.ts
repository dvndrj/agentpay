/**
 * Shared Kysely database module (injectable) for all AgentPay NestJS services.
 *
 * Each service imports this module and uses `Kysely<ServiceDatabase>` where
 * `ServiceDatabase` extends the base tables with service-specific ones.
 */

import { Global, Module } from "@nestjs/common";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

/** Token for NestJS DI. */
export const DATABASE = Symbol("DATABASE");

/**
 * Base database interface — tables shared by all services.
 * Extend this per-service to add service-specific tables.
 */
export interface AgentPayDatabase {
  policies: {
    smart_account: string;
    per_tx_cap_usdc_micro: string;
    daily_cap_usdc_micro: string;
    updated_at: Date;
  };
  session_keys: {
    key_id: string;
    smart_account: string;
    public_key: string;
    not_before: Date;
    not_after: Date;
    bounds_json: unknown;
    status: string;
    issued_at: Date;
    revoked_at: Date | null;
  };
  obligations: {
    obligation_id: string;
    sla_id: string;
    consumer_smart_account: string;
    provider_smart_account: string;
    amount_usdc_micro: string;
    finality_state: string;
    policy_decision_id: string;
    tx_hash: string | null;
    evidence_hash: string | null;
    created_at: Date;
  };
  audit_records: {
    record_id: string;
    handle: string;
    event_type: string;
    payload_json: unknown;
    payload_hash: string;
    prev_hash: string;
    record_hash: string;
    actor: string;
    timestamp: Date;
  };
  idempotency_keys: {
    caller: string;
    key: string;
    response_json: unknown;
    expires_at: Date;
  };
  policy_spend_events: {
    id: string;
    smart_account: string;
    amount_usdc_micro: string;
    evaluated_at: Date;
  };
  trust_scores: {
    handle: string;
    score: number;
    pass_count: number;
    fail_count: number;
    stake_usdc_micro: string;
    updated_at: Date;
  };
  agent_metadata: {
    handle: string;
    smart_account: string;
    metadata_json: unknown;
    metadata_hash: string;
    registered_at: Date;
  };
  discovery_index: {
    handle: string;
    vec: unknown; // pgvector vector(384)
    trust_score: number;
    last_updated: Date;
  };
  oversight_rejections: {
    sla_id: string;
    reviewer: string;
    decided_at: Date;
  };
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: () => {
        const dbUrl = process.env.DATABASE_URL;
        if (!dbUrl) {
          throw new Error("DATABASE_URL is required");
        }
        return new Kysely<AgentPayDatabase>({
          dialect: new PostgresDialect({
            pool: new Pool({ connectionString: dbUrl, max: 10 }),
          }),
        });
      },
    },
    {
      provide: "DATABASE_URL_CHECK",
      useValue: process.env.DATABASE_URL ?? null,
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
