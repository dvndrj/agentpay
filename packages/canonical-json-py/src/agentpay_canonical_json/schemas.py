"""
Canonical schema descriptors for AgentPay records.

Field lists mirror the data models in
`.kiro/specs/agentpay-platform/design.md` (Data Models section). Any
change to that document must be reflected here and in the TypeScript
sibling package (`@agentpay/canonical-json`) to preserve cross-language
round-trip parity (R12.6, T1.4 golden vectors).
"""

from .schema import (
    ArrayKind,
    EnumKind,
    ObjectKind,
    ObjectSchema,
    always_nullable,
    field,
    nullable_when,
    optional,
)

# Enum kinds
NETWORK_KIND = EnumKind(values=("base-mainnet", "base-sepolia"))
FINALITY_KIND = EnumKind(values=("DRAFT", "PROVISIONAL", "FINAL", "REVERSED"))
SESSION_STATUS_KIND = EnumKind(values=("ACTIVE", "REVOKED", "EXPIRED"))
SUCCESS_CRITERIA_KIND = EnumKind(values=("log_attestation", "tee_attestation"))
AUDIT_EVENT_KIND = EnumKind(
    values=(
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
    )
)

# Obligation_Object (design.md > Data Models > Obligation_Object)
ObligationObjectSchema = ObjectSchema(
    name="ObligationObject",
    fields={
        "obligation_id": field("uuid"),
        "sla_id": field("uuid"),
        "consumer_handle": field("string"),
        "provider_handle": field("string"),
        "consumer_smart_account": field("address"),
        "provider_smart_account": field("address"),
        "amount_usdc": field("integer-string"),
        "asset": field(EnumKind(values=("USDC",))),
        "network": field(NETWORK_KIND),
        "nonce": field("string"),
        "finality_state": field(FINALITY_KIND),
        "policy_decision_id": field("uuid"),
        "created_at": field("rfc3339-z"),
        # tx_hash is null in DRAFT and populated from PROVISIONAL onward
        "tx_hash": nullable_when("tx-hash", lambda parent: parent.get("finality_state") == "DRAFT"),
        # evidence_hash is null until verification produces an envelope
        "evidence_hash": nullable_when(
            "hex",
            lambda parent: parent.get("finality_state") in ("DRAFT", "PROVISIONAL"),
        ),
        "schema_version": field("integer"),
    },
)

# Log attestation sub-record nested inside EvidenceEnvelope
LogAttestationSchema = ObjectSchema(
    name="LogAttestation",
    fields={
        "log_digest": field("hex"),
        "signer_handle": field("string"),
        "signature": field("hex"),
    },
)

# TEE attestation sub-record nested inside EvidenceEnvelope
TeeAttestationSchema = ObjectSchema(
    name="TeeAttestation",
    fields={
        "quote": field("base64"),
        "measurement": field("hex"),
        "signer_root": field("string"),
    },
)

# Evidence_Envelope (design.md > Data Models > Evidence_Envelope)
EvidenceEnvelopeSchema = ObjectSchema(
    name="EvidenceEnvelope",
    fields={
        "envelope_id": field("uuid"),
        "obligation_id": field("uuid"),
        "sla_id": field("uuid"),
        "request_hash": field("hex"),
        "response_hash": field("hex"),
        "log_attestation": always_nullable(ObjectKind(schema=LogAttestationSchema)),
        "tee_attestation": always_nullable(ObjectKind(schema=TeeAttestationSchema)),
        "observed_latency_ms": field("integer"),
        "produced_at": field("rfc3339-z"),
        "prev_hash": field("hex"),
        "envelope_hash": field("hex"),
        "schema_version": field("integer"),
    },
)

# SLA (design.md > Data Models > SLA)
SLASchema = ObjectSchema(
    name="SLA",
    fields={
        "sla_id": field("uuid"),
        "consumer_handle": field("string"),
        "provider_handle": field("string"),
        "task": field(
            ObjectKind(
                schema=ObjectSchema(
                    name="SLATask",
                    fields={
                        "description": field("string"),
                        "inputs_schema_hash": field("hex"),
                        "outputs_schema_hash": field("hex"),
                    },
                )
            )
        ),
        "price_usdc_micro": field("integer-string"),
        "latency_bound_ms": field("integer"),
        "success_criteria": field(SUCCESS_CRITERIA_KIND),
        "expiry": field("rfc3339-z"),
        "consumer_signature": field("hex"),
        "provider_signature": field("hex"),
        "schema_version": field("integer"),
    },
)

# Policy (design.md > Data Models > Policy)
PolicySchema = ObjectSchema(
    name="Policy",
    fields={
        "smart_account": field("address"),
        "per_tx_cap_usdc_micro": field("integer-string"),
        "daily_cap_usdc_micro": field("integer-string"),
        "rolling_24h_spend_usdc_micro": field("integer-string"),
        "updated_at": field("rfc3339-z"),
        "schema_version": field("integer"),
    },
)

# Session_Key (design.md > Data Models > Session_Key)
SessionKeySchema = ObjectSchema(
    name="SessionKey",
    fields={
        "key_id": field("uuid"),
        "smart_account": field("address"),
        "public_key": field("hex"),
        "not_before": field("rfc3339-z"),
        "not_after": field("rfc3339-z"),
        "bounds": field(
            ObjectKind(
                schema=ObjectSchema(
                    name="SessionKeyBounds",
                    fields={
                        "per_tx_cap_usdc_micro": field("integer-string"),
                        "cumulative_cap_usdc_micro": field("integer-string"),
                        # null encodes "unrestricted"
                        "allowed_recipients": always_nullable(ArrayKind(element="address")),
                    },
                )
            )
        ),
        "status": field(SESSION_STATUS_KIND),
        "issued_at": field("rfc3339-z"),
        # revoked_at is null until the key transitions to REVOKED
        "revoked_at": nullable_when("rfc3339-z", lambda parent: parent.get("status") != "REVOKED"),
        "schema_version": field("integer"),
    },
)

# Audit_Record (design.md > Data Models > Audit_Record)
AuditRecordSchema = ObjectSchema(
    name="AuditRecord",
    fields={
        "record_id": field("uuid"),
        "handle": field("string"),
        "event_type": field(AUDIT_EVENT_KIND),
        # payload shape is event-specific; we accept any nested object
        "payload": field(ObjectKind(schema=ObjectSchema(name="AuditPayload", fields={}, closed=False))),
        "payload_hash": field("hex"),
        "prev_hash": field("hex"),
        "record_hash": field("hex"),
        "actor": field("string"),
        "timestamp": field("rfc3339-z"),
        "schema_version": field("integer"),
    },
)

# Trust_Score (design.md > Data Models > Trust_Score)
TrustScoreSchema = ObjectSchema(
    name="TrustScore",
    fields={
        "handle": field("string"),
        "score": field("integer"),
        "pass_count": field("integer"),
        "fail_count": field("integer"),
        "stake_usdc_micro": field("integer-string"),
        "updated_at": field("rfc3339-z"),
        "schema_version": field("integer"),
    },
)

# Payment_Request (design.md > Data Models > Payment_Request)
PaymentRequestSchema = ObjectSchema(
    name="PaymentRequest",
    fields={
        "smart_account": field("address"),
        "sla_id": field("uuid"),
        "charge": field(
            ObjectKind(
                schema=ObjectSchema(
                    name="PaymentRequestCharge",
                    fields={
                        "amount_usdc_micro": field("integer-string"),
                        "asset": field(EnumKind(values=("USDC",))),
                        "network": field(NETWORK_KIND),
                        "recipient": field("address"),
                        "nonce": field("string"),
                    },
                )
            )
        ),
        "session_key_id": field("uuid"),
        "session_key_signature": field("hex"),
        "request_id": field("uuid"),
        "submitted_at": field("rfc3339-z"),
        "schema_version": field("integer"),
        # policy_decision_id is recorded once the engine evaluates the request
        "policy_decision_id": optional("uuid"),
    },
)

# Registry of all schemas
Schemas = {
    "ObligationObject": ObligationObjectSchema,
    "EvidenceEnvelope": EvidenceEnvelopeSchema,
    "SLA": SLASchema,
    "Policy": PolicySchema,
    "SessionKey": SessionKeySchema,
    "AuditRecord": AuditRecordSchema,
    "TrustScore": TrustScoreSchema,
    "PaymentRequest": PaymentRequestSchema,
}
