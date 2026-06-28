# Requirements Document

## Introduction

AgentPay is a financial operating system for the autonomous agent economy. The platform bridges off-chain agent workflows (MCP, A2A) with on-chain financial primitives, enabling sub-cent micropayments that traditional rails cannot economically support. AgentPay provides a six-layer protocol (Identity, Discovery, Negotiation, Settlement, Verification, Reputation), an infrastructure-level Policy Engine that enforces spending guardrails outside the agent's control, a RAILS clearing framework (obligations, evidence envelopes, finality rules), and Glass Box auditability for EU AI Act compliance.

Scope note: this document captures requirements for the full six-layer vision. Requirements 1, 4, 7, 8, 11, and 12 correspond to the MVP roadmap (Tasks 1–3). Remaining requirements describe post-MVP capabilities and may be deferred during design and task planning.

## Glossary

- **AgentPay_Platform**: The complete system providing identity, discovery, negotiation, settlement, verification, and reputation services for autonomous agents.
- **Agent**: An autonomous software actor that consumes or provides services on the AgentPay_Platform.
- **Identity_Registry**: ERC-8004 compliant on-chain service that issues ERC-721 handles representing persistent agent identities.
- **Discovery_Service**: Registry that indexes agent capability descriptors (OpenAPI schemas) and answers semantic search queries via pgvector embeddings.
- **Negotiation_Engine**: Off-chain service that brokers Request-for-Quote exchanges and produces signed Service Level Agreements between agents.
- **SLA**: Service Level Agreement, a signed structure specifying price, latency bound, success criteria, and expiry for an agent-to-agent service.
- **Settlement_Service**: HTTP 402 (x402) gateway that converts machine-readable charge headers into USDC transfers on Base L2.
- **Verification_Mesh**: Service that validates execution evidence (log attestations or TEE attestations) before releasing funds from escrow.
- **Reputation_Service**: Service that records success and failure outcomes per agent and computes a numeric trust score.
- **Policy_Engine**: Infrastructure-level component that atomically evaluates balance, per-transaction cap, daily cap, and signature checks for every payment request, outside the agent's control plane.
- **Escrow_Vault**: On-chain smart contract on Base L2 that holds USDC against an Obligation_Object until release conditions are met.
- **Smart_Account**: ERC-4337 account abstraction wallet operated by an Agent, optionally controlled via session keys.
- **Session_Key**: A scoped signing key delegated to an Agent with a fixed validity window and spending bounds.
- **RAILS_Ledger**: Real-Time Agent Integrity and Ledger Settlement service that records Obligation_Objects, Evidence_Envelopes, and finality state transitions.
- **Obligation_Object**: A signed data structure that represents an Agent's commitment to pay a counterparty under specified conditions.
- **Evidence_Envelope**: A hash-anchored data structure that bundles execution artifacts (request, response, logs, attestation) for a single transaction.
- **Finality_State**: The lifecycle state of an Obligation_Object, one of {DRAFT, PROVISIONAL, FINAL, REVERSED}.
- **Audit_Logger**: Service that persists immutable, timestamped records of agent inputs, reasoning steps, outputs, and policy decisions.
- **AgentPay_SDK**: TypeScript and Python client libraries that expose AgentPay capabilities to developer code.
- **Trust_Score**: An integer in the range 0–100 maintained by the Reputation_Service for each registered Agent.
- **USDC**: USD Coin, the ERC-20 stablecoin used as the unit of settlement on Base L2.
- **Base_L2**: The Base Layer 2 EVM-compatible blockchain used for on-chain settlement.

## Requirements

### Requirement 1: Agent Identity Registration

**User Story:** As an agent operator, I want to register my agent with a persistent on-chain identity, so that counterparties can recognize and transact with the agent across sessions.

#### Acceptance Criteria

1. WHEN an operator submits an agent registration request with a valid Smart_Account address, THE Identity_Registry SHALL mint an ERC-721 handle conforming to ERC-8004 and return the handle identifier.
2. WHEN an agent is registered, THE Reputation_Service SHALL initialize the agent's Trust_Score to 35.
3. WHEN a duplicate registration is submitted for an existing Smart_Account address, THE Identity_Registry SHALL return the existing handle identifier without minting a new token.
4. IF a registration request omits a valid Smart_Account signature, THEN THE Identity_Registry SHALL reject the request with a structured error identifying the missing field.
5. WHEN a handle is transferred to a new Smart_Account address, THE Identity_Registry SHALL preserve the handle's historical Trust_Score and audit records.

### Requirement 2: Agent Capability Discovery

**User Story:** As a consuming agent, I want to discover provider agents by capability description, so that I can select counterparties that match my task.

#### Acceptance Criteria

1. WHEN a provider agent submits an OpenAPI schema to the Discovery_Service, THE Discovery_Service SHALL compute an embedding vector and index the schema in pgvector keyed by the agent's handle.
2. WHEN a consumer submits a natural language capability query, THE Discovery_Service SHALL return up to 50 candidate agent handles ranked by cosine similarity to the query embedding.
3. WHERE a consumer specifies a minimum Trust_Score filter, THE Discovery_Service SHALL exclude candidates whose Trust_Score is below the specified value.
4. IF a submitted OpenAPI schema fails OpenAPI 3.1 validation, THEN THE Discovery_Service SHALL reject the submission with an error listing each validation failure.
5. WHEN a provider deregisters or its handle is revoked, THE Discovery_Service SHALL remove the corresponding index entry within 60 seconds.

### Requirement 3: Service Negotiation and SLA Formation

**User Story:** As a consuming agent, I want to negotiate price and service terms before execution, so that both parties have a signed agreement.

#### Acceptance Criteria

1. WHEN a consumer submits a Request-for-Quote referencing a provider handle and task specification, THE Negotiation_Engine SHALL forward the request to the provider and await a quote response.
2. WHEN the provider returns a quote containing price, latency bound, and expiry, THE Negotiation_Engine SHALL present the quote to the consumer for acceptance.
3. WHEN the consumer accepts a quote, THE Negotiation_Engine SHALL produce an SLA signed by both parties and return the SLA identifier.
4. IF a quote response is not received within the consumer-specified deadline, THEN THE Negotiation_Engine SHALL return a timeout error and cancel the pending RFQ.
5. IF either party's signature fails verification, THEN THE Negotiation_Engine SHALL reject the SLA and emit an audit event.

### Requirement 4: x402 Settlement of USDC Payments on Base L2

**User Story:** As a consuming agent, I want to settle API charges via the x402 protocol in USDC on Base L2, so that machine-to-machine payments execute without per-transaction fiat fees.

#### Acceptance Criteria

1. WHEN a provider responds with HTTP 402 and an x402 payment requirement header, THE Settlement_Service SHALL parse the header into a structured charge request including amount, asset, recipient, and network.
2. WHEN a parsed charge request is approved by the Policy_Engine, THE Settlement_Service SHALL transfer the specified USDC amount on Base_L2 from the consumer's Smart_Account to the Escrow_Vault associated with the SLA.
3. WHEN settlement completes on Base_L2, THE Settlement_Service SHALL return an x402 payment receipt containing the transaction hash and Obligation_Object identifier.
4. IF the charge request specifies an asset other than USDC or a network other than Base_L2, THEN THE Settlement_Service SHALL reject the request with an unsupported-asset error.
5. IF the on-chain transfer reverts, THEN THE Settlement_Service SHALL transition the Obligation_Object to REVERSED and return the revert reason in the receipt.

### Requirement 5: Verification of Service Delivery

**User Story:** As a paying agent, I want service delivery verified before funds are released, so that I do not pay for unfulfilled work.

#### Acceptance Criteria

1. WHEN a provider submits an Evidence_Envelope referencing an Obligation_Object, THE Verification_Mesh SHALL validate the envelope's signature, hash chain, and SLA conformance.
2. WHERE the SLA requires TEE attestation, THE Verification_Mesh SHALL verify the attestation against the configured attestation root and reject envelopes whose quote fails verification.
3. WHEN verification succeeds, THE Verification_Mesh SHALL emit a performance verdict of PASS to the RAILS_Ledger.
4. IF an Evidence_Envelope cannot be verified before the SLA expiry, THEN THE Verification_Mesh SHALL emit a performance verdict of FAIL and trigger refund from the Escrow_Vault.
5. WHEN a performance verdict is emitted, THE Audit_Logger SHALL record the verdict, the verifier identity, and the envelope hash.

### Requirement 6: Reputation Tracking and Staking

**User Story:** As an agent operator, I want my agent's reliability tracked over time, so that counterparties can price risk and reward consistent performance.

#### Acceptance Criteria

1. WHEN a performance verdict of PASS is recorded against an agent, THE Reputation_Service SHALL increase the agent's Trust_Score by a configured increment, capped at 100.
2. WHEN a performance verdict of FAIL is recorded against an agent, THE Reputation_Service SHALL decrease the agent's Trust_Score by a configured decrement, floored at 0.
3. WHERE an agent has staked USDC against its handle, THE Reputation_Service SHALL slash a configured fraction of the stake on each FAIL verdict and transfer the slashed amount to the counterparty's Smart_Account.
4. WHEN an operator queries an agent's reputation by handle, THE Reputation_Service SHALL return the current Trust_Score, total transaction count, and success rate.
5. IF a stake withdrawal request is submitted while open Obligation_Objects reference the stake, THEN THE Reputation_Service SHALL reject the withdrawal with a pending-obligations error.

### Requirement 7: Infrastructure-Level Spending Guardrails

**User Story:** As an agent operator, I want spending limits enforced outside the agent's control plane, so that prompt injection cannot override my financial safeguards.

#### Acceptance Criteria

1. THE Policy_Engine SHALL evaluate every payment request before the request reaches Base_L2.
2. WHEN a payment request would exceed the configured per-transaction cap for the requesting Smart_Account, THE Policy_Engine SHALL reject the request with a structured per_transaction_cap_exceeded error.
3. WHEN a payment request would cause the rolling 24-hour spend for the requesting Smart_Account to exceed the configured daily cap, THE Policy_Engine SHALL reject the request with a structured daily_cap_exceeded error.
4. IF the Smart_Account's available USDC balance is less than the requested amount plus estimated gas, THEN THE Policy_Engine SHALL reject the request with a structured insufficient_balance error.
5. IF the Session_Key signature on a payment request fails verification or the key is expired, THEN THE Policy_Engine SHALL reject the request with a structured signature_invalid error.
6. THE Policy_Engine SHALL evaluate balance check, per-transaction cap check, daily cap check, and signature check as a single atomic decision, such that no payment proceeds when any check fails.

### Requirement 8: Policy Configuration and Limit Management

**User Story:** As an agent operator, I want to configure spending policies per agent, so that I can match risk tolerance to each agent's role.

#### Acceptance Criteria

1. WHEN an operator submits a policy update for a Smart_Account containing per-transaction cap and daily cap values, THE Policy_Engine SHALL persist the new policy and apply it to all subsequent payment requests.
2. IF a policy update specifies a daily cap less than the rolling 24-hour spend already accrued, THEN THE Policy_Engine SHALL persist the new cap and reject all further payments until the rolling window drops below the new cap.
3. WHEN a policy update is persisted, THE Audit_Logger SHALL record the previous values, new values, and operator identity.
4. WHEN an operator queries the current policy for a Smart_Account, THE Policy_Engine SHALL return the per-transaction cap, daily cap, rolling 24-hour spend, and remaining daily allowance.

### Requirement 9: RAILS Clearing and Finality

**User Story:** As an agent operator, I want payments to progress through documented finality states, so that I can reconcile obligations against execution evidence.

#### Acceptance Criteria

1. WHEN a payment request is approved by the Policy_Engine, THE RAILS_Ledger SHALL create an Obligation_Object in Finality_State DRAFT.
2. WHEN settlement on Base_L2 confirms, THE RAILS_Ledger SHALL transition the Obligation_Object from DRAFT to PROVISIONAL.
3. WHEN both a PASS performance verdict and a PASS policy verdict are recorded for an Obligation_Object, THE RAILS_Ledger SHALL transition the object from PROVISIONAL to FINAL and release funds from the Escrow_Vault to the provider.
4. IF a FAIL performance verdict is recorded for an Obligation_Object in PROVISIONAL state, THEN THE RAILS_Ledger SHALL transition the object to REVERSED and return funds from the Escrow_Vault to the consumer's Smart_Account.
5. WHEN an Obligation_Object enters FINAL or REVERSED state, THE RAILS_Ledger SHALL emit a terminal-state event to the Audit_Logger.

### Requirement 10: Glass Box Audit Logging and Human Oversight

**User Story:** As a compliance officer, I want every agent decision and policy action recorded immutably with intervention points, so that the platform satisfies EU AI Act traceability and oversight obligations.

#### Acceptance Criteria

1. WHEN any of {agent input, reasoning step, agent output, policy decision, finality transition} occurs for an agent flagged as high-risk, THE Audit_Logger SHALL persist a timestamped, hash-chained record within 5 seconds of the event.
2. THE Audit_Logger SHALL reject deletion or mutation of any persisted record and SHALL return an immutable-record error on such attempts.
3. WHEN an operator requests an audit export for an agent over a specified time range, THE Audit_Logger SHALL return all records for the agent in that range ordered by timestamp.
4. WHERE an agent is configured with a human-oversight intervention point at a specific reasoning step, THE Audit_Logger SHALL pause execution and notify the configured human reviewer until the reviewer issues an approve or reject decision.
5. IF a human reviewer issues a reject decision at an intervention point, THEN THE Policy_Engine SHALL block all pending payment requests for the associated SLA.

### Requirement 11: AgentPay SDK for TypeScript and Python

**User Story:** As a developer, I want a small client library that exposes AgentPay primitives, so that I can integrate payments into an agent in minutes.

#### Acceptance Criteria

1. THE AgentPay_SDK SHALL provide TypeScript and Python packages that expose, at minimum, the operations {register_agent, discover_agents, request_quote, pay, get_obligation, set_policy}.
2. WHEN an SDK consumer invokes pay with an x402-compatible HTTP response, THE AgentPay_SDK SHALL submit the corresponding payment request to the Settlement_Service and return the resulting x402 receipt.
3. WHEN an SDK operation receives a structured error from the Policy_Engine, THE AgentPay_SDK SHALL surface the error code and message to the caller without retrying the underlying request.
4. THE AgentPay_SDK SHALL pin exact versions of its blockchain and cryptographic dependencies and SHALL emit a warning when invoked against an unsupported AgentPay_Platform API version.

### Requirement 12: Obligation and Evidence Serialization Formats

**User Story:** As an integration engineer, I want canonical serialization formats for obligations and evidence, so that records can be signed, transmitted, and re-parsed without ambiguity.

#### Acceptance Criteria

1. THE RAILS_Ledger SHALL define a canonical JSON serialization for Obligation_Object and Evidence_Envelope including all fields required for signature verification.
2. THE RAILS_Ledger SHALL provide a parser that converts canonical JSON into an Obligation_Object or Evidence_Envelope and a pretty printer that converts the in-memory object back to canonical JSON.
3. FOR ALL valid Obligation_Object instances, parsing then printing then parsing SHALL produce an instance equal to the original under structural equality (round-trip property).
4. FOR ALL valid Evidence_Envelope instances, parsing then printing then parsing SHALL produce an instance equal to the original under structural equality (round-trip property).
5. IF input JSON violates the canonical schema, THEN THE parser SHALL reject the input with a descriptive error identifying the violating field and reason.
6. WHEN an Obligation_Object or Evidence_Envelope is re-serialized, THE pretty printer SHALL produce a byte-identical output for two structurally equal inputs (deterministic serialization).

### Requirement 13: Session Key Issuance and Revocation

**User Story:** As an agent operator, I want to issue scoped session keys to my agent, so that the agent can sign payments without holding my root key.

#### Acceptance Criteria

1. WHEN an operator issues a Session_Key with a validity window and spending bounds, THE Policy_Engine SHALL persist the key metadata and accept signatures from the key during the validity window.
2. WHEN a Session_Key reaches its expiry timestamp, THE Policy_Engine SHALL reject subsequent payment requests signed by that key with a key_expired error.
3. WHEN an operator revokes a Session_Key, THE Policy_Engine SHALL reject all subsequent payment requests signed by that key within 10 seconds of the revocation.
4. WHERE a payment request signed by a Session_Key would exceed the spending bounds attached to that key, THE Policy_Engine SHALL reject the request with a key_bounds_exceeded error.
