/**
 * Canonical schema descriptors for AgentPay records.
 *
 * Field lists mirror the data models in
 * `.kiro/specs/agentpay-platform/design.md` (Data Models section). Any
 * change to that document must be reflected here and in the Python
 * sibling package (`agentpay_canonical_json`) to preserve cross-language
 * round-trip parity (R12.6, T1.4 golden vectors).
 */

import {
  alwaysNullable,
  field,
  nullableWhen,
  optional,
  type FieldKind,
  type ObjectSchema,
} from '../schema.js';

const NETWORK_KIND: FieldKind = { enum: ['base-mainnet', 'base-sepolia'] };
const FINALITY_KIND: FieldKind = { enum: ['DRAFT', 'PROVISIONAL', 'FINAL', 'REVERSED'] };
const SESSION_STATUS_KIND: FieldKind = { enum: ['ACTIVE', 'REVOKED', 'EXPIRED'] };
const SUCCESS_CRITERIA_KIND: FieldKind = { enum: ['log_attestation', 'tee_attestation'] };
const AUDIT_EVENT_KIND: FieldKind = {
  enum: [
    'agent_input',
    'agent_reasoning',
    'agent_output',
    'policy_decision',
    'finality_transition',
    'oversight_pause',
    'oversight_decision',
    'registration',
    'settlement_attempt',
    'policy_update',
  ],
};

/** Obligation_Object (design.md > Data Models > Obligation_Object). */
export const ObligationObjectSchema: ObjectSchema = {
  name: 'ObligationObject',
  fields: {
    obligation_id: field('uuid'),
    sla_id: field('uuid'),
    consumer_handle: field('string'),
    provider_handle: field('string'),
    consumer_smart_account: field('address'),
    provider_smart_account: field('address'),
    amount_usdc: field('integer-string'),
    asset: field({ enum: ['USDC'] }),
    network: field(NETWORK_KIND),
    nonce: field('string'),
    finality_state: field(FINALITY_KIND),
    policy_decision_id: field('uuid'),
    created_at: field('rfc3339-z'),
    // tx_hash is null in DRAFT and populated from PROVISIONAL onward.
    tx_hash: nullableWhen('tx-hash', (parent) => parent.finality_state === 'DRAFT'),
    // evidence_hash is null until verification produces an envelope; it
    // is populated when the obligation reaches FINAL or REVERSED.
    evidence_hash: nullableWhen(
      'hex',
      (parent) =>
        parent.finality_state === 'DRAFT' || parent.finality_state === 'PROVISIONAL',
    ),
    schema_version: field('integer'),
  },
};

/** Log attestation sub-record nested inside EvidenceEnvelope. */
const LogAttestationSchema: ObjectSchema = {
  name: 'LogAttestation',
  fields: {
    log_digest: field('hex'),
    signer_handle: field('string'),
    signature: field('hex'),
  },
};

/** TEE attestation sub-record nested inside EvidenceEnvelope. */
const TeeAttestationSchema: ObjectSchema = {
  name: 'TeeAttestation',
  fields: {
    quote: field('base64'),
    measurement: field('hex'),
    signer_root: field('string'),
  },
};

/**
 * Evidence_Envelope (design.md > Data Models > Evidence_Envelope).
 *
 * At least one of `log_attestation` or `tee_attestation` must be
 * non-null; the schema permits null in either slot via the nullable
 * predicate, and the cross-field "at least one" rule is enforced
 * separately by `validateEvidenceEnvelope` below.
 */
export const EvidenceEnvelopeSchema: ObjectSchema = {
  name: 'EvidenceEnvelope',
  fields: {
    envelope_id: field('uuid'),
    obligation_id: field('uuid'),
    sla_id: field('uuid'),
    request_hash: field('hex'),
    response_hash: field('hex'),
    log_attestation: alwaysNullable({ object: LogAttestationSchema }),
    tee_attestation: alwaysNullable({ object: TeeAttestationSchema }),
    observed_latency_ms: field('integer'),
    produced_at: field('rfc3339-z'),
    prev_hash: field('hex'),
    envelope_hash: field('hex'),
    schema_version: field('integer'),
  },
};

/** SLA (design.md > Data Models > SLA). */
export const SLASchema: ObjectSchema = {
  name: 'SLA',
  fields: {
    sla_id: field('uuid'),
    consumer_handle: field('string'),
    provider_handle: field('string'),
    task: field({
      object: {
        name: 'SLATask',
        fields: {
          description: field('string'),
          inputs_schema_hash: field('hex'),
          outputs_schema_hash: field('hex'),
        },
      },
    }),
    price_usdc_micro: field('integer-string'),
    latency_bound_ms: field('integer'),
    success_criteria: field(SUCCESS_CRITERIA_KIND),
    expiry: field('rfc3339-z'),
    consumer_signature: field('hex'),
    provider_signature: field('hex'),
    schema_version: field('integer'),
  },
};

/** Policy (design.md > Data Models > Policy). */
export const PolicySchema: ObjectSchema = {
  name: 'Policy',
  fields: {
    smart_account: field('address'),
    per_tx_cap_usdc_micro: field('integer-string'),
    daily_cap_usdc_micro: field('integer-string'),
    rolling_24h_spend_usdc_micro: field('integer-string'),
    updated_at: field('rfc3339-z'),
    schema_version: field('integer'),
  },
};

/** Session_Key (design.md > Data Models > Session_Key). */
export const SessionKeySchema: ObjectSchema = {
  name: 'SessionKey',
  fields: {
    key_id: field('uuid'),
    smart_account: field('address'),
    public_key: field('hex'),
    not_before: field('rfc3339-z'),
    not_after: field('rfc3339-z'),
    bounds: field({
      object: {
        name: 'SessionKeyBounds',
        fields: {
          per_tx_cap_usdc_micro: field('integer-string'),
          cumulative_cap_usdc_micro: field('integer-string'),
          // null encodes "unrestricted"; an empty array would mean "no
          // recipients allowed" which is a distinct (and useless) state.
          allowed_recipients: alwaysNullable({ array: 'address' }),
        },
      },
    }),
    status: field(SESSION_STATUS_KIND),
    issued_at: field('rfc3339-z'),
    // revoked_at is null until the key transitions to REVOKED, then is a
    // timestamp. The predicate enforces that null is only valid while
    // status is not REVOKED.
    revoked_at: nullableWhen('rfc3339-z', (parent) => parent.status !== 'REVOKED'),
    schema_version: field('integer'),
  },
};

/** Audit_Record (design.md > Data Models > Audit_Record). */
export const AuditRecordSchema: ObjectSchema = {
  name: 'AuditRecord',
  fields: {
    record_id: field('uuid'),
    handle: field('string'),
    event_type: field(AUDIT_EVENT_KIND),
    // payload shape is event-specific; we accept any nested object and
    // defer payload validation to the event-type handler.
    payload: field({ object: { name: 'AuditPayload', fields: {}, closed: false } }),
    payload_hash: field('hex'),
    prev_hash: field('hex'),
    record_hash: field('hex'),
    actor: field('string'),
    timestamp: field('rfc3339-z'),
    schema_version: field('integer'),
  },
};

/** Trust_Score (design.md > Data Models > Trust_Score). */
export const TrustScoreSchema: ObjectSchema = {
  name: 'TrustScore',
  fields: {
    handle: field('string'),
    score: field('integer'),
    pass_count: field('integer'),
    fail_count: field('integer'),
    stake_usdc_micro: field('integer-string'),
    updated_at: field('rfc3339-z'),
    schema_version: field('integer'),
  },
};

/** Payment_Request (design.md > Data Models > Payment_Request). */
export const PaymentRequestSchema: ObjectSchema = {
  name: 'PaymentRequest',
  fields: {
    smart_account: field('address'),
    sla_id: field('uuid'),
    charge: field({
      object: {
        name: 'PaymentRequestCharge',
        fields: {
          amount_usdc_micro: field('integer-string'),
          asset: field({ enum: ['USDC'] }),
          network: field(NETWORK_KIND),
          recipient: field('address'),
          nonce: field('string'),
        },
      },
    }),
    session_key_id: field('uuid'),
    session_key_signature: field('hex'),
    request_id: field('uuid'),
    submitted_at: field('rfc3339-z'),
    schema_version: field('integer'),
    // policy_decision_id is recorded once the engine evaluates the
    // request; the request as submitted does not include it.
    policy_decision_id: optional('uuid'),
  },
};

/** Registry of all schemas keyed by canonical name. */
export const Schemas = {
  ObligationObject: ObligationObjectSchema,
  EvidenceEnvelope: EvidenceEnvelopeSchema,
  SLA: SLASchema,
  Policy: PolicySchema,
  SessionKey: SessionKeySchema,
  AuditRecord: AuditRecordSchema,
  TrustScore: TrustScoreSchema,
  PaymentRequest: PaymentRequestSchema,
} as const;

export type SchemaName = keyof typeof Schemas;
