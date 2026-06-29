import { sql, type Kysely } from "kysely";

/**
 * AgentPay PostgreSQL schema — initial migration.
 *
 * Creates all tables required for MVP (R1, R4, R7, R8, R9 partial, R10 partial, R13)
 * plus the post-MVP discovery_index table (guarded by pgvector extension check).
 *
 * Tables:
 *   policies            — per-account spending policy (R8)
 *   session_keys        — scoped signing keys with validity windows (R13)
 *   obligations         — RAILS_Ledger obligation records (R9)
 *   audit_records       — append-only hash-chained audit log (R10)
 *   idempotency_keys    — write-idempotency cache (24h TTL)
 *   policy_spend_events — rolling 24h spend tracking (R8)
 *   discovery_index     — pgvector semantic search index (R2, post-MVP)
 *   oversight_rejections— SLA-level oversight reject flags (R10, post-MVP)
 *   trust_scores         — reputation Trust_Score (R1.2, R6)
 */

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Extension: pgvector (optional, post-MVP) ──────────────────
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  // ── policies ──────────────────────────────────────────────────
  await db.schema
    .createTable("policies")
    .addColumn("smart_account", "varchar(42)", (col) => col.primaryKey())
    .addColumn("per_tx_cap_usdc_micro", "varchar(78)", (col) => col.notNull())
    .addColumn("daily_cap_usdc_micro", "varchar(78)", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // ── session_keys ──────────────────────────────────────────────
  await db.schema
    .createTable("session_keys")
    .addColumn("key_id", "uuid", (col) => col.primaryKey())
    .addColumn("smart_account", "varchar(42)", (col) => col.notNull())
    .addColumn("public_key", "varchar(132)", (col) => col.notNull())
    .addColumn("not_before", "timestamptz", (col) => col.notNull())
    .addColumn("not_after", "timestamptz", (col) => col.notNull())
    .addColumn("bounds_json", "jsonb", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) => col.notNull().defaultTo("ACTIVE"))
    .addColumn("issued_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("revoked_at", "timestamptz")
    .execute();

  await db.schema
    .createIndex("idx_session_keys_smart_account")
    .on("session_keys")
    .column("smart_account")
    .execute();
  await db.schema
    .createIndex("idx_session_keys_status")
    .on("session_keys")
    .column("status")
    .execute();

  // ── obligations ───────────────────────────────────────────────
  await db.schema
    .createTable("obligations")
    .addColumn("obligation_id", "uuid", (col) => col.primaryKey())
    .addColumn("sla_id", "uuid", (col) => col.notNull())
    .addColumn("consumer_smart_account", "varchar(42)", (col) => col.notNull())
    .addColumn("provider_smart_account", "varchar(42)", (col) => col.notNull())
    .addColumn("amount_usdc_micro", "varchar(78)", (col) => col.notNull())
    .addColumn("finality_state", "varchar(20)", (col) =>
      col.notNull().defaultTo("DRAFT"))
    .addColumn("policy_decision_id", "uuid", (col) => col.notNull())
    .addColumn("tx_hash", "varchar(66)")
    .addColumn("evidence_hash", "varchar(66)")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_obligations_sla_id")
    .on("obligations")
    .column("sla_id")
    .execute();
  await db.schema
    .createIndex("idx_obligations_state")
    .on("obligations")
    .column("finality_state")
    .execute();

  // ── audit_records ─────────────────────────────────────────────
  await db.schema
    .createTable("audit_records")
    .addColumn("record_id", "uuid", (col) => col.primaryKey())
    .addColumn("handle", "varchar(78)", (col) => col.notNull())
    .addColumn("event_type", "varchar(30)", (col) => col.notNull())
    .addColumn("payload_json", "jsonb", (col) => col.notNull())
    .addColumn("payload_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("prev_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("record_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("actor", "varchar(78)", (col) => col.notNull())
    .addColumn("timestamp", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_audit_records_handle_ts")
    .on("audit_records")
    .columns(["handle", "timestamp"])
    .execute();
  await db.schema
    .createIndex("idx_audit_records_handle_hash")
    .on("audit_records")
    .columns(["handle", "record_hash"])
    .execute();

  // Audit records are immutable — no UPDATE or DELETE allowed (R10.2)
  await sql`
    CREATE OR REPLACE RULE audit_records_no_mutate AS
    ON UPDATE TO audit_records
    DO INSTEAD NOTHING
  `.execute(db);
  await sql`
    CREATE OR REPLACE RULE audit_records_no_delete AS
    ON DELETE TO audit_records
    DO INSTEAD NOTHING
  `.execute(db);

  // ── idempotency_keys ──────────────────────────────────────────
  await db.schema
    .createTable("idempotency_keys")
    .addColumn("caller", "varchar(78)", (col) => col.notNull())
    .addColumn("key", "varchar(256)", (col) => col.notNull())
    .addColumn("response_json", "jsonb", (col) => col.notNull())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addPrimaryKeyConstraint("pk_idempotency_keys", ["caller", "key"])
    .execute();

  await db.schema
    .createIndex("idx_idempotency_keys_expires")
    .on("idempotency_keys")
    .column("expires_at")
    .execute();

  // ── policy_spend_events ───────────────────────────────────────
  await db.schema
    .createTable("policy_spend_events")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("smart_account", "varchar(42)", (col) => col.notNull())
    .addColumn("amount_usdc_micro", "varchar(78)", (col) => col.notNull())
    .addColumn("evaluated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_policy_spend_events_window")
    .on("policy_spend_events")
    .columns(["smart_account", "evaluated_at"])
    .execute();

  // ── discovery_index (post-MVP, pgvector) ──────────────────────
  await db.schema
    .createTable("discovery_index")
    .addColumn("handle", "varchar(78)", (col) => col.primaryKey())
    .addColumn("vec", sql`vector(384)`, (col) => col.notNull())
    .addColumn("trust_score", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_updated", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`))
    .execute();

  // ── oversight_rejections (post-MVP, R10.5) ────────────────────
  await db.schema
    .createTable("oversight_rejections")
    .addColumn("sla_id", "uuid", (col) => col.primaryKey())
    .addColumn("reviewer", "varchar(78)", (col) => col.notNull())
    .addColumn("decided_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`))
    .execute();

  // ── trust_scores (R1.2, R6) ───────────────────────────────────
  await db.schema
    .createTable("trust_scores")
    .addColumn("handle", "varchar(78)", (col) => col.primaryKey())
    .addColumn("score", "integer", (col) => col.notNull().defaultTo(35))
    .addColumn("pass_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("fail_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("stake_usdc_micro", "varchar(78)", (col) => col.notNull().defaultTo("0"))
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`))
    .execute();

  // ── agent_metadata (R1.1) ─────────────────────────────────────
  await db.schema
    .createTable("agent_metadata")
    .addColumn("handle", "varchar(78)", (col) => col.primaryKey())
    .addColumn("smart_account", "varchar(42)", (col) => col.notNull())
    .addColumn("metadata_json", "jsonb", (col) => col.notNull())
    .addColumn("metadata_hash", "varchar(66)", (col) => col.notNull())
    .addColumn("registered_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("idx_agent_metadata_smart_account")
    .on("agent_metadata")
    .column("smart_account")
    .execute();

  // ── rfqs (R3, post-MVP) ───────────────────────────────────────
  await db.schema
    .createTable("rfqs")
    .addColumn("rfq_id", "uuid", (col) => col.primaryKey())
    .addColumn("consumer_handle", "varchar(78)", (col) => col.notNull())
    .addColumn("provider_handle", "varchar(78)", (col) => col.notNull())
    .addColumn("task_json", "jsonb", (col) => col.notNull())
    .addColumn("deadline_ms", "integer", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) =>
      col.notNull().defaultTo("OPEN"))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_rfqs_consumer")
    .on("rfqs")
    .column("consumer_handle")
    .execute();

  // ── slas (R3, post-MVP) ───────────────────────────────────────
  await db.schema
    .createTable("slas")
    .addColumn("sla_id", "uuid", (col) => col.primaryKey())
    .addColumn("rfq_id", "uuid", (col) => col.notNull())
    .addColumn("consumer_handle", "varchar(78)", (col) => col.notNull())
    .addColumn("provider_handle", "varchar(78)", (col) => col.notNull())
    .addColumn("task_json", "jsonb", (col) => col.notNull())
    .addColumn("price_usdc_micro", "varchar(78)", (col) => col.notNull())
    .addColumn("latency_bound_ms", "integer", (col) => col.notNull())
    .addColumn("success_criteria", "varchar(30)", (col) => col.notNull())
    .addColumn("expiry", "timestamptz", (col) => col.notNull())
    .addColumn("consumer_signature", "varchar(132)", (col) => col.notNull())
    .addColumn("provider_signature", "varchar(132)", (col) => col.notNull())
    .addColumn("schema_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop in reverse dependency order
  await db.schema.dropTable("slas").ifExists().execute();
  await db.schema.dropTable("rfqs").ifExists().execute();
  await db.schema.dropTable("agent_metadata").ifExists().execute();
  await db.schema.dropTable("trust_scores").ifExists().execute();
  await db.schema.dropTable("oversight_rejections").ifExists().execute();
  await db.schema.dropTable("discovery_index").ifExists().execute();
  await db.schema.dropTable("policy_spend_events").ifExists().execute();
  await db.schema.dropTable("idempotency_keys").ifExists().execute();

  await sql`DROP RULE IF EXISTS audit_records_no_delete ON audit_records`.execute(db);
  await sql`DROP RULE IF EXISTS audit_records_no_mutate ON audit_records`.execute(db);
  await db.schema.dropTable("audit_records").ifExists().execute();

  await db.schema.dropTable("obligations").ifExists().execute();
  await db.schema.dropTable("session_keys").ifExists().execute();
  await db.schema.dropTable("policies").ifExists().execute();
}
