# Implementation Plan: AgentPay Platform

## Overview

This plan turns the six-layer AgentPay design into an incrementally testable build. It follows an MVP-first slice (R1, R4, R7, R8, R9 partial, R10 partial, R11, R12, R13) before introducing post-MVP services (R2, R3, R5, R6, plus FINAL/REVERSED finality and oversight intervention).

Sequencing principle: every signed record depends on canonical JSON, so canonical JSON ships first with its property tests (P22, P23). On-chain primitives come next so off-chain services have something to settle against. Then Audit_Logger and Policy_Engine give services the audit chain and the atomic guardrail they all call into. RAILS_Ledger and Settlement_Service follow, then Identity_Registry and the SDKs complete the MVP. Post-MVP services (Discovery, Negotiation, Verification, full Reputation, handle transfer, FINAL/REVERSED finality, oversight intervention) layer on top behind the same Policy and RAILS contracts.

Property tests (PBTs) are placed as sibling sub-tasks to the implementations they validate. Each correctness property P1-P25 from the design document has exactly one dedicated PBT sub-task tagged with the verbatim property body and the library (`fast-check`, `hypothesis`, or `forge`), running at least 100 iterations. Forge fuzz and invariant tests additionally cover the on-chain sub-cases of P7, P11, and P18. Optional sub-tasks (tests, polish, post-MVP nice-to-haves) are marked with `*` on the checkbox.

## Monorepo layout established by these tasks

```
agentpay/
├── pnpm-workspace.yaml
├── package.json
├── pyproject.toml                      # uv workspace root
├── foundry.toml
├── docker-compose.test.yml
├── packages/
│   ├── canonical-json-ts/              # @agentpay/canonical-json
│   └── canonical-json-py/              # agentpay_canonical_json
├── contracts/                          # Solidity 0.8.24, Foundry
│   ├── src/{EscrowVault,IdentityRegistry,StakeVault}.sol
│   ├── test/                           # forge unit + fuzz + invariant
│   └── script/Deploy.s.sol             # CREATE2 deterministic deploy
├── services/
│   ├── shared/                         # NestJS shared libs (error envelope, idempotency, kafka, redis)
│   ├── audit-logger/
│   ├── policy-engine/
│   ├── rails-ledger/
│   ├── settlement/
│   ├── identity-registry/
│   ├── discovery/
│   ├── negotiation/
│   ├── verification/
│   └── reputation/
├── sdk/
│   ├── typescript/                     # @agentpay/sdk
│   └── python/                         # agentpay_sdk
└── tests/
    └── e2e/                            # cross-service jest scenarios
```

## Tasks

- [x] 1. Bootstrap monorepo and canonical JSON packages
  - [x] 1.1 Initialise pnpm workspace, uv Python workspace, and Foundry project
    - Create `pnpm-workspace.yaml`, root `package.json` with `pnpm@9` and `typescript@5`, `tsconfig.base.json` with `strict: true`, ESLint + Prettier config
    - Create `pyproject.toml` defining a uv workspace with members `packages/canonical-json-py`, `sdk/python`
    - Run `forge init --no-commit contracts/` and pin `foundry.toml` to Solidity 0.8.24 with `optimizer = true`, `runs = 200`, `fuzz_runs = 256`, `invariant_runs = 64`
    - Add `.gitignore`, `.editorconfig`, root `README.md` describing the workspace layout
    - _Requirements: 11.4_
  - [x] 1.2 Implement `@agentpay/canonical-json` (TypeScript)
    - Create `packages/canonical-json-ts/` with `tsup` build, exports `encode(value): string`, `decode(text): unknown`, `hash(value): Uint8Array`
    - Sort object keys lexicographically by UTF-8 code point, NFC-normalise strings before escaping, emit large numbers as JSON strings, no insignificant whitespace, no trailing newline, allow `null` only where schema permits via a `nullable` predicate hook
    - Add schema descriptors for `ObligationObject`, `EvidenceEnvelope`, `SLA`, `Policy`, `SessionKey`, `AuditRecord`, `TrustScore`, `PaymentRequest`
    - Throw `CanonicalJsonError` with `path` and `reason` on schema violations
    - _Requirements: 12.1, 12.2, 12.5, 12.6_
  - [x] 1.3 Implement `agentpay_canonical_json` (Python)
    - Create `packages/canonical-json-py/` with `pyproject.toml`, expose `encode(value) -> bytes`, `decode(data) -> Any`, `hash(value) -> bytes`
    - Mirror the TS rules (RFC 8785 JCS + the four tightenings) using `unicodedata.normalize("NFC", ...)` and `decimal.Decimal` for large numerics held as strings
    - Add the same schema descriptors and raise `CanonicalJsonError` with `path` and `reason`
    - _Requirements: 12.1, 12.2, 12.5, 12.6_
  - [x] 1.4 Cross-language interop golden vectors
    - Create `packages/canonical-json-ts/test/golden/` and `packages/canonical-json-py/tests/golden/` sharing the same JSON input fixtures and expected byte output
    - Add a fixture for each schema covering NFC vs NFD, key collation edge cases, integer boundary values, nested objects, and `null` placement
    - _Requirements: 12.6_
  - [ ]\* 1.5 Property test P22 round-trip for Obligation and Evidence (TypeScript, fast-check)
    - **Property 22: Canonical JSON round-trip for Obligation and Evidence.** For any valid `ObligationObject` instance `x`, `parse(print(parse(print(x)))) == parse(print(x))` under structural equality. The same property holds for any valid `EvidenceEnvelope` instance.
    - Tag test with `// Feature: agentpay-platform, Property 22: ...`
    - Define `genObligationObject` and `genEvidenceEnvelope` arbitraries; run with `numRuns: 100` minimum
    - _Requirements: 12.3, 12.4_
  - [ ]\* 1.6 Property test P23 deterministic serialization (TypeScript, fast-check)
    - **Property 23: Canonical JSON deterministic serialization.** For any two in-memory values `a` and `b` of the same canonical schema such that `a == b` under structural equality, `print(a)` and `print(b)` produce byte-identical output.
    - Tag test with `// Feature: agentpay-platform, Property 23: ...`
    - Generate two structurally equal values via independent key-order/whitespace perturbations of the same payload; assert byte equality
    - _Requirements: 12.6_
  - [ ]\* 1.7 Edge case unit tests for canonical JSON parser
    - Cover R12.5 violations: unknown field, wrong type, missing required field, non-NFC string, unsorted keys, invalid hex, invalid RFC3339 timestamp without `Z`
    - Each case asserts `CanonicalJsonError.path` and `reason` content
    - _Requirements: 12.5_
  - [ ]\* 1.8 Python canonical JSON golden parity test (pytest)
    - Load shared golden fixtures, assert `encode` produces bytes equal to the TS-generated expected output, assert `decode(encode(x)) == x`
    - _Requirements: 12.1, 12.2, 12.6_

- [x] 2. On-chain contracts on Base L2 (Solidity 0.8.24, Foundry)
  - [x] 2.1 Shared contract interfaces and roles
    - Create `contracts/src/interfaces/` with `IEscrowVault`, `IIdentityRegistry`, `IStakeVault`
    - Add `contracts/src/Roles.sol` defining `RAILS_SETTLER_ROLE` and `REPUTATION_SETTLER_ROLE` constants used by all vault contracts
    - Add OpenZeppelin dependencies: `@openzeppelin/contracts@5` via `forge install`, lockfile committed under `lib/`
    - _Requirements: 4.2, 6.3, 9.3, 9.4_
  - [x] 2.2 Implement Escrow_Vault contract
    - `lock(bytes32 obligationId, address payer, address payee, uint256 amount)` pulls USDC via `safeTransferFrom`
    - `release(bytes32 obligationId)` and `refund(bytes32 obligationId)` callable only by `RAILS_SETTLER_ROLE`; both check `state == LOCKED`
    - Storage: `mapping(bytes32 => Escrow{ payer, payee, amount, state })`; state enum `{ NONE, LOCKED, RELEASED, REFUNDED }`
    - Apply OpenZeppelin `ReentrancyGuard` on every external state-changing function; emit `Locked`, `Released`, `Refunded` events
    - _Requirements: 4.2, 9.3, 9.4_
  - [x]\* 2.3 Forge fuzz + invariant test for Escrow_Vault (P7 on-chain sub-case, P18 on-chain sub-case)
    - **Property 7 (on-chain sub-case): Approved charge produces an escrow lock with conserved amount.** After `lock(id, P, Q, A)` succeeds, `escrows[id].amount == A`, payer is `P`, payee is `Q`, and total USDC balance across `(payer + vault)` is unchanged.
    - **Property 18 (on-chain sub-case): RAILS finality state machine.** No path moves `state` outside `{ NONE -> LOCKED -> {RELEASED, REFUNDED} }`; any second call to `release` or `refund` reverts.
    - Foundry invariant suite with handler contract; tag tests with `// Feature: agentpay-platform, Property 7/18 (on-chain): ...`; `--fuzz-runs 256`, `--invariant-runs 64`
    - _Requirements: 4.2, 4.5, 9.3, 9.4_
  - [x] 2.4 Implement Identity_Registry contract (ERC-8004 over ERC-721)
    - Inherit OpenZeppelin `ERC721` and `AccessControl`; `mintHandle(address smartAccount, bytes32 metadataHash) returns (uint256 tokenId)` reverts if `accountToHandle[smartAccount] != 0` and returns the existing tokenId via a separate `handleOf(address)` view
    - `transferHandle(uint256 tokenId, address newSmartAccount)` updates the `accountToHandle` index and emits `HandleTransferred`
    - Emit `HandleMinted(tokenId, smartAccount, metadataHash)` and `HandleTransferred(tokenId, oldAccount, newAccount)`
    - _Requirements: 1.1, 1.3, 1.5_
  - [x]\* 2.5 Forge fuzz test for Identity_Registry idempotent mint (P1 on-chain sub-case)
    - **Property 1 (on-chain sub-case): Registration is idempotent.** For any address `a`, after the first call to `mintHandle(a, m)`, every subsequent `mintHandle(a, m')` reverts with `HandleAlreadyExists` and `handleOf(a)` is unchanged; ERC-721 `balanceOf(a) == 1`
    - Tag test with `// Feature: agentpay-platform, Property 1 (on-chain): ...`; `--fuzz-runs 256`
    - _Requirements: 1.1, 1.3_
  - [x] 2.6 Implement Stake_Vault contract
    - `stake(uint256 handle, uint256 amount)` pulls USDC via `safeTransferFrom`
    - `requestWithdraw(uint256 handle, uint256 amount)` reverts when `openObligationCount[handle] > 0`
    - `slash(uint256 handle, uint256 amount, address payee)` callable only by `REPUTATION_SETTLER_ROLE`; transfers `amount` to `payee` and decrements `stakeOf[handle]`
    - `incrementOpenObligations(uint256)` / `decrementOpenObligations(uint256)` gated by `RAILS_SETTLER_ROLE`
    - _Requirements: 6.3, 6.5_
  - [x]\* 2.7 Forge fuzz test for Stake_Vault slash conservation (P11 on-chain)
    - **Property 11: Slashing conserves USDC across stake and counterparty.** For any FAIL verdict against handle `h` with stake `S`, counterparty `C`, and slash fraction `phi in [0, 1]`, after `slash(h, floor(S * phi), C)`: new stake is `S - floor(S * phi)`, counterparty `C` USDC balance increases by exactly `floor(S * phi)`, total USDC across stake vault and counterparty is unchanged by the slash transfer.
    - Tag test with `// Feature: agentpay-platform, Property 11: ...`; `--fuzz-runs 256`; assert across the full `(S, phi)` lattice including `S = 0`, `phi = 0`, `phi = 1`
    - _Requirements: 6.3_
  - [x]\* 2.8 Forge invariant test for Stake_Vault withdrawal lock (P13 on-chain sub-case)
    - **Property 13 (on-chain sub-case): Stake withdrawal is blocked while obligations are open.** Under any sequence of `incrementOpenObligations` / `decrementOpenObligations` / `requestWithdraw` calls, `requestWithdraw` reverts whenever `openObligationCount[handle] > 0` and stake balance is unchanged.
    - Tag test with `// Feature: agentpay-platform, Property 13 (on-chain): ...`; handler-based invariant suite
    - _Requirements: 6.5_
  - [x] 2.9 Deterministic CREATE2 deployment script
    - `script/Deploy.s.sol` deploys `IdentityRegistry`, `EscrowVault`, `StakeVault` via `CREATE2` with a configured salt sourced from env
    - Produce identical addresses on Base mainnet and Base Sepolia given the same salt and bytecode; emit deployment artifact JSON to `contracts/deployments/{network}.json`
    - _Requirements: 1.1, 4.2, 6.3_
  - [x]\* 2.10 Gas optimisation pass for Escrow_Vault and Stake_Vault
    - Profile `lock`, `release`, `refund`, `stake`, `slash` with `forge snapshot`; remove redundant SLOADs; commit a `gas-snapshot` baseline
    - _Requirements: 4.2, 6.3_

- [x] 3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)
  - [ ] 3.1 Bootstrap NestJS workspace and shared libraries
    - Create `services/shared/` with `error-envelope` module (returns `{code, message, details, request_id, policy_decision_id}`), `idempotency` interceptor that stores `(caller_principal, Idempotency-Key) -> response` for 24h in Postgres, `request-id` middleware, `canonical-json` adapter wrapping `@agentpay/canonical-json`
    - Create one NestJS app shell per service under `services/{audit-logger,policy-engine,rails-ledger,settlement,identity-registry,discovery,negotiation,verification,reputation}/` using `@nestjs/cli` defaults
    - _Requirements: 7.1, 11.3_
  - [~] 3.2 PostgreSQL schema and migrations
    - Use `kysely` migrations under `services/shared/migrations/`
    - Tables: `policies(smart_account PK, per_tx_cap_usdc_micro, daily_cap_usdc_micro, updated_at)`, `session_keys(key_id PK, smart_account, public_key, not_before, not_after, bounds_json, status, issued_at, revoked_at)`, `obligations(obligation_id PK, sla_id, consumer_smart_account, provider_smart_account, amount_usdc_micro, finality_state, policy_decision_id, tx_hash, evidence_hash, created_at)`, `audit_records(record_id PK, handle, event_type, payload_json, payload_hash, prev_hash, record_hash, actor, timestamp)`, `idempotency_keys(caller, key, response_json, expires_at, PRIMARY KEY (caller, key))`, `policy_spend_events(smart_account, amount_usdc_micro, evaluated_at)` for rolling 24h spend
    - Add Postgres rule `audit_records_no_mutate` that raises an exception on UPDATE or DELETE
    - Add `discovery_index(handle, vec vector(384), trust_score, last_updated)` migration behind a `pgvector` extension guard (post-MVP service uses it)
    - _Requirements: 8.1, 9.1, 10.1, 10.2, 13.1_
  - [~] 3.3 Redis and Kafka shared modules
    - `services/shared/redis/` exposes `RedisClient` with `incrBy`, `expire`, and pub/sub helpers; configure a `session_key.revoked` channel
    - `services/shared/kafka/` exposes idempotent producers with `transactional.id` per service instance and consumer factory enforcing exactly-once semantics
    - Topics declared: `audit.events`, `obligation.transitions`, `policy.decisions`, `session_key.revocations`
    - _Requirements: 10.1, 13.3_
  - [~] 3.4 Service-level health, metrics, and tracing scaffolding
    - Add `/healthz` and `/readyz` to every NestJS app
    - Wire Prometheus metrics exporter and OpenTelemetry HTTP + Kafka instrumentation
    - Declare metric stubs: `policy_decisions_total{verdict,reason_code}`, `settlement_latency_seconds`, `audit_chain_length{handle}`, `obligation_state_transitions_total{from,to}`, `session_key_revocations_total`
    - _Requirements: 7.1, 9.5, 10.1_
  - [ ]\* 3.5 Prometheus dashboards for MVP metrics
    - Provide `ops/grafana/agentpay-mvp.json` covering the five metrics above plus error-rate by `reason_code`
    - _Requirements: 7.1_

- [ ] 4. Audit_Logger service
  - [~] 4.1 Implement append, head, and export endpoints
    - `POST /v1/audit/append` validates `AuditEvent` via canonical JSON adapter, computes `payload_hash = sha256(canonical_json(payload))`, fetches `prev_hash` from Redis head per handle (fallback to Postgres on cache miss), computes `record_hash = sha256(prev_hash || payload_hash || timestamp || actor)`, persists row, advances Redis head
    - `GET /v1/audit/{handle}/head` returns latest `record_hash`
    - `GET /v1/audit/export?handle&from&to` returns matching records ordered by timestamp ascending
    - Genesis `prev_hash` is 64 hex zeros
    - _Requirements: 10.1, 10.3_
  - [~] 4.2 Enforce immutability at app and database layers
    - Map Postgres mutation exception to HTTP 405 `immutable_record` via global filter
    - Reject `PATCH`/`PUT`/`DELETE` at the controller layer with the same code
    - _Requirements: 10.2_
  - [ ]\* 4.3 Property test P19 audit hash chain monotone (TypeScript, fast-check)
    - **Property 19: Audit log is a hash chain monotone in time.** For any handle `h` and any two consecutive audit records `r_i`, `r_{i+1}` for `h`, `r_{i+1}.prev_hash == r_i.record_hash`, `r_{i+1}.record_hash == sha256(r_{i+1}.prev_hash || r_{i+1}.payload_hash || r_{i+1}.timestamp || r_{i+1}.actor)`, and `r_{i+1}.timestamp >= r_i.timestamp`. Any update or delete on a persisted record returns `immutable_record` and leaves the log unchanged. Export over `(h, from, to)` returns exactly the records whose timestamps lie in `[from, to]` for `h`, ordered ascending by timestamp.
    - Tag test with `// Feature: agentpay-platform, Property 19: ...`; generator emits random valid `AuditEvent` sequences; assertion checks the three sub-clauses plus export ordering and immutability
    - _Requirements: 10.1, 10.2, 10.3_
  - [ ]\* 4.4 Unit tests for immutability and export edges
    - `immutable_record` returned on direct SQL UPDATE/DELETE attempts (via test harness with raw client)
    - Export with empty range returns empty array; export across multiple handles is correctly partitioned
    - _Requirements: 10.2, 10.3_

- [x] 5. Policy_Engine service
  - [~] 5.1 PaymentRequest schema and canonical hashing
    - Add canonical schema descriptor for `PaymentRequest` (already in canonical-json package); compute `inputs_hash` over the canonical bytes
    - Reject malformed requests with `invalid_payment_request` and structured field path
    - _Requirements: 7.1, 12.1_
  - [~] 5.2 Session key persistence and revocation pub/sub
    - `POST /v1/policy/session-keys` persists key metadata with `status = ACTIVE`
    - `DELETE /v1/policy/session-keys/{key_id}` writes `status = REVOKED`, `revoked_at = now`, publishes `session_key.revoked` on Redis
    - Each Policy_Engine instance subscribes to `session_key.revoked` and invalidates its in-memory cache; cache miss falls back to Postgres which is source of truth
    - _Requirements: 13.1, 13.2, 13.3_
  - [~] 5.3 Atomic decision engine
    - `POST /v1/policy/evaluate` runs four checks inside a single Postgres transaction with `SELECT ... FOR UPDATE` on the `(smart_account)` row plus a Redis `INCRBY` on the daily-spend counter (committed only on APPROVED):
      1. Signature check (session key signature, key ACTIVE, within `[not_before, not_after]`, within session-key bounds)
      2. Balance check (`usdc_balance >= amount + est_gas`)
      3. Per-transaction cap check (`amount <= per_tx_cap`)
      4. Daily cap check (`rolling_24h + amount <= daily_cap`)
    - On any failure, roll back and return `Decision{verdict: DENIED, reason_code, reason_message}` mapped to the catalogue in design.md error tables
    - On success, write the APPROVED decision to the audit log via Kafka `policy.decisions`
    - Block requests for any SLA flagged `oversight_rejected` with `oversight_rejected`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 13.1, 13.2, 13.4_
  - [~] 5.4 Policy CRUD and rolling 24h spend
    - `GET /v1/policy/{smart_account}` returns `(per_tx_cap, daily_cap, rolling_24h_spend, remaining_daily)` where `remaining_daily = max(daily_cap - rolling_24h_spend, 0)`
    - `PUT /v1/policy/{smart_account}` validates body, persists, writes one `policy_update` audit record containing `P_before`, `P_after`, operator identity
    - Compute `rolling_24h_spend` from `policy_spend_events` over the trailing 24h window
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [~] 5.5 Oversight rejection flag wiring
    - Add `oversight_rejections(sla_id PK, reviewer, decided_at)` table written by Audit_Logger oversight endpoint (Task 18.2)
    - Policy_Engine reads this table during `evaluate` and returns `oversight_rejected` for any matching SLA
    - _Requirements: 10.5_
  - [ ]\* 5.6 Property test P14 Policy_Engine atomic decision (TypeScript, fast-check)
    - **Property 14: Policy_Engine atomic decision.** For any PaymentRequest `r`, the Policy_Engine decision satisfies all of: (a) verdict is APPROVED iff balance check, per-transaction cap check, daily cap check, and signature check all pass; (b) when DENIED, the `reason_code` is exactly one of `{per_transaction_cap_exceeded, daily_cap_exceeded, insufficient_balance, signature_invalid, key_expired, key_bounds_exceeded, oversight_rejected}` and reflects the first failing check; (c) when DENIED, the rolling 24-hour spend counter is unchanged and no on-chain transaction is submitted; (d) when APPROVED, the rolling 24-hour spend counter increases by exactly `r.charge.amount_usdc_micro`. Furthermore, no committed on-chain settlement exists without a corresponding APPROVED `policy_decision_id` in the audit log.
    - Tag with `// Feature: agentpay-platform, Property 14: ...`; `genPaymentRequest` parameterised over (under cap, over cap, over daily, low balance, valid sig, invalid sig, expired key, key out of bounds)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 13.4_
  - [ ]\* 5.7 Property test P15 policy updates and reduced daily cap (TypeScript, fast-check)
    - **Property 15: Policy updates apply to subsequent requests and a reduced daily cap blocks payments until the window drops.** For any policy update `U` persisted at time `t`, every PaymentRequest with `submitted_at >= t` is evaluated against `U`; in particular, for any new `daily_cap` `D'` less than the current `rolling_24h_spend` `S`, every subsequent PaymentRequest is DENIED with `daily_cap_exceeded` until `S` (recomputed over the trailing 24 hours) is strictly less than `D'`.
    - Tag with `// Feature: agentpay-platform, Property 15: ...`; uses a logical clock to simulate the 24h window
    - _Requirements: 8.1, 8.2_
  - [ ]\* 5.8 Property test P16 policy update audit completeness (TypeScript, fast-check)
    - **Property 16: Policy update audit record completeness.** For any persisted policy update transitioning policy from `P_before` to `P_after` by operator `o`, exactly one audit record of type `policy_update` exists whose payload contains `P_before`, `P_after`, and `o`.
    - Tag with `// Feature: agentpay-platform, Property 16: ...`
    - _Requirements: 8.3_
  - [ ]\* 5.9 Property test P17 policy query consistency (TypeScript, fast-check)
    - **Property 17: Policy query returns consistent computed values.** For any Smart_Account `a`, `get_policy(a)` returns `(per_tx_cap, daily_cap, rolling_24h_spend, remaining_daily)` where `remaining_daily = max(daily_cap - rolling_24h_spend, 0)` and the four values are consistent with the state used to evaluate the next PaymentRequest.
    - Tag with `// Feature: agentpay-platform, Property 17: ...`
    - _Requirements: 8.4_
  - [ ]\* 5.10 Property test P24 session key validity window (TypeScript, fast-check)
    - **Property 24: Session key validity window controls acceptance.** For any Session_Key `k` with window `[not_before, not_after]` and status `S`, a PaymentRequest signed by `k` and submitted at time `t` is accepted by the signature check iff `S == ACTIVE` and `not_before <= t <= not_after`; otherwise the decision is DENIED with `signature_invalid` when `S != ACTIVE` or `key_expired` when `t > not_after`.
    - Tag with `// Feature: agentpay-platform, Property 24: ...`
    - _Requirements: 13.1, 13.2_
  - [ ]\* 5.11 Property test P25 session key revocation propagation (TypeScript, fast-check)
    - **Property 25: Session key revocation propagates within ten seconds.** For any Session_Key `k` revoked at time `t`, every PaymentRequest signed by `k` and submitted at time `t' >= t + 10s` is DENIED with `signature_invalid`.
    - Tag with `// Feature: agentpay-platform, Property 25: ...`; simulate Redis pub/sub propagation delay up to the 10s bound and assert behaviour at and beyond it
    - _Requirements: 13.3_
  - [ ]\* 5.12 Property test P20 oversight rejection blocks subsequent payments (TypeScript, fast-check)
    - **Property 20: Oversight rejection blocks subsequent payments for the SLA.** For any oversight intervention on SLA `s` where the reviewer issues `reject` at time `t`, every PaymentRequest for `s` submitted at time `t' >= t` is DENIED with `oversight_rejected`.
    - Tag with `// Feature: agentpay-platform, Property 20: ...`; populate `oversight_rejections` directly and exercise `evaluate`
    - _Requirements: 10.4, 10.5_

- [x] 6. Checkpoint - foundation and Policy_Engine
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. RAILS_Ledger service
  - [~] 7.1 Obligation persistence and creation endpoint
    - `POST /v1/rails/obligations` validates `ObligationDraftRequest`, creates row in `obligations` with `finality_state = DRAFT`, returns `{obligation_id, finality_state}`
    - Enforce `Idempotency-Key` semantics and return `duplicate_obligation` on body mismatch
    - _Requirements: 9.1_
  - [~] 7.2 Finality state machine endpoints
    - `POST /v1/rails/obligations/{id}/provisional` accepts `{tx_hash}` and transitions DRAFT -> PROVISIONAL
    - `POST /v1/rails/obligations/{id}/verdict` accepts `{performance, evidence_hash}` and transitions PROVISIONAL -> FINAL on PASS or PROVISIONAL -> REVERSED on FAIL
    - Reject any other transition with `invalid_finality_transition` and leave state unchanged
    - In MVP, the FINAL/REVERSED branches stage the transition in DB but defer on-chain release/refund to Task 18.1
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [~] 7.3 Terminal-state event emission
    - On entry to FINAL or REVERSED, emit one `finality_transition` event to `audit.events` Kafka topic and call `Audit_Logger.append`
    - _Requirements: 9.5, 10.1_
  - [ ]\* 7.4 Property test P18 RAILS finality state machine (TypeScript, fast-check)
    - **Property 18: RAILS finality state machine.** For any Obligation_Object `o` and any sequence of inputs, the only state transitions that occur are those in the set `{ DRAFT -> PROVISIONAL on tx_confirmed, PROVISIONAL -> FINAL on (perf=PASS AND policy=PASS), PROVISIONAL -> REVERSED on (perf=FAIL OR settlement_revert) }`. Any other attempted transition is rejected with `invalid_finality_transition` and leaves the state unchanged. Whenever `o` enters FINAL or REVERSED, exactly one `finality_transition` audit record is emitted and exactly one balance transfer occurs (release to provider or refund to consumer respectively).
    - Tag with `// Feature: agentpay-platform, Property 18: ...`; arbitrary generates random transition sequences over the alphabet `{tx_confirmed, verdict_pass, verdict_fail, settlement_revert, noise}`; balance-transfer assertion uses a mock Escrow_Vault client
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 8. Settlement_Service
  - [~] 8.1 x402 header parser and encoder
    - Implement `parseX402(headerString) -> ChargeRequest` and `encodeX402(charge) -> string` in `services/settlement/src/x402/`
    - Validate fields `amount`, `asset`, `recipient`, `network`, `nonce`; reject malformed headers with `x402_parse_error`
    - _Requirements: 4.1_
  - [~] 8.2 Settle endpoint wiring Policy_Engine, RAILS, Escrow_Vault
    - `POST /v1/settle` flow per design sequence: parse header, reject `unsupported_asset`/`unsupported_network`, call `Policy_Engine.evaluate`, on APPROVED call `RAILS_Ledger.createObligation(DRAFT)`, submit `lock(obligationId, payer, payee, amount)` to Escrow_Vault via viem-based on-chain client, return x402 receipt `{tx_hash, obligation_id, policy_decision_id}`
    - On DENIED wrap inner Policy error in `policy_denied`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.1, 7.6_
  - [~] 8.3 Chain observer for DRAFT -> PROVISIONAL
    - BullMQ worker watches submitted tx hashes; on `k = 3` confirmations on Base, call `RAILS_Ledger.markProvisional(tx_hash)`
    - Handle reorgs below depth `k` by re-queueing; never advance until depth holds
    - _Requirements: 4.3, 9.2_
  - [~] 8.4 Chain failure handling
    - On `transferFrom` revert, transition obligation to REVERSED via RAILS, set `tx_hash`, return `chain_revert` with `revert_reason`
    - On tx unconfirmed beyond timeout return `chain_timeout`; keep obligation in DRAFT until observer resolves
    - _Requirements: 4.5_
  - [ ]\* 8.5 Property test P6 x402 header round-trip (TypeScript, fast-check)
    - **Property 6: x402 charge header round-trip.** For any valid x402 charge header `h`, `encode_x402(parse_x402(h)) == h` and `parse_x402(encode_x402(c)) == c` for any well-typed `ChargeRequest` `c`.
    - Tag with `// Feature: agentpay-platform, Property 6: ...`; arbitraries cover all schema variants including edge cases for nonce encoding
    - _Requirements: 4.1_
  - [ ]\* 8.6 Property test P8 unsupported asset or network rejection (TypeScript, fast-check)
    - **Property 8: Unsupported asset or network is rejected before any state change.** For any charge `c` with `c.asset != "USDC"` or `c.network not in {"base-mainnet", "base-sepolia"}`, `settle(c)` returns an `unsupported_asset` error, no Obligation_Object is created, and no on-chain transaction is submitted.
    - Tag with `// Feature: agentpay-platform, Property 8: ...`; mock RAILS_Ledger and chain client to assert zero side effects
    - _Requirements: 4.4_
  - [ ]\* 8.7 Property test P7 approved charge produces escrow lock with conserved amount (TypeScript, fast-check)
    - **Property 7: Approved charge produces an escrow lock with conserved amount.** For any Policy_Engine APPROVED decision on `PaymentRequest{amount=A, payer=P, payee=Q, sla=S}` that completes settlement successfully, after the settlement transaction confirms: (a) `Escrow_Vault.lookup(obligation_id).amount == A` with payer `P` and payee `Q`, (b) USDC balance of `P` decreased by exactly `A`, (c) the returned x402 receipt contains the on-chain `tx_hash` and the `obligation_id`, and (d) the Obligation_Object is in state PROVISIONAL.
    - Tag with `// Feature: agentpay-platform, Property 7: ...`; runs against an Anvil fork of Base Sepolia in test mode with a deterministic USDC mock token; on-chain sub-cases are additionally covered by Task 2.3
    - _Requirements: 4.2, 4.3, 9.1, 9.2_

- [x] 9. Identity_Registry service and Reputation initialisation
  - [~] 9.1 Implement Identity_Registry service endpoints
    - `POST /v1/agents` verifies the Smart_Account signature over `{smart_account, metadata_hash}`, calls the on-chain `mintHandle`, persists `(handle, smart_account, metadata)` and returns `{handle, smart_account}`
    - `GET /v1/agents/{handle}` and `GET /v1/agents/by-account/{addr}` lookups
    - On duplicate registration return the existing handle without minting (uses on-chain `accountToHandle` dedupe)
    - Emit a `registration` audit record per design
    - _Requirements: 1.1, 1.3, 1.4_
  - [~] 9.2 Initialise Trust_Score on registration
    - On successful mint, write `TrustScore{handle, score: 35, pass_count: 0, fail_count: 0, stake_usdc_micro: "0"}` to `trust_scores` table (created in 3.2 extension)
    - In MVP the Reputation_Service does not exist yet; the Identity_Registry service writes directly to `trust_scores` and Task 16 takes over CRUD post-MVP
    - _Requirements: 1.2_
  - [ ]\* 9.3 Property test P1 idempotent registration and initial trust (TypeScript, fast-check)
    - **Property 1: Registration is idempotent and produces a handle with initial trust.** For any Smart_Account address `a` and metadata `m`, calling `register_agent(a, m)` returns a handle `h` such that subsequent calls `register_agent(a, m')` for any `m'` return the same `h`, the on-chain ERC-721 balance of `a` is exactly 1, and the Trust_Score for `h` immediately after first registration equals 35.
    - Tag with `// Feature: agentpay-platform, Property 1: ...`; uses Anvil fork plus DB harness; on-chain idempotency layer also covered by Task 2.5
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]\* 9.4 Unit test R1.4 missing signature returns signature_missing
    - Submit a registration body without `signature` and assert HTTP 400 with `code: "signature_missing"` and `details.field == "signature"`
    - _Requirements: 1.4_

- [ ] 10. AgentPay SDK (TypeScript)
  - [~] 10.1 Implement TypeScript SDK surface
    - Package at `sdk/typescript/` exports `register_agent`, `discover_agents` (stub in MVP returning `[]`), `request_quote` (stub in MVP returning a fixed-template SLA), `pay`, `get_obligation`, `set_policy`, `issue_session_key`, `revoke_session_key`
    - `pay(http402Response, sessionKey)` parses the x402 charge, signs the PaymentRequest with the session key using `noble-curves` EIP-712 typed-data, POSTs to `/v1/settle`, returns the x402 receipt
    - Use `viem` for chain reads (balance, allowance) before submitting
    - _Requirements: 11.1, 11.2, 4.1, 4.2, 4.3_
  - [~] 10.2 Pin dependencies and add unsupported API version warning
    - Lock exact versions of `viem`, `noble-curves`, `@agentpay/canonical-json` in `package.json` (no `^` ranges)
    - On first call, fetch `/v1/meta/version`; if outside supported range, emit a single `console.warn` and continue
    - _Requirements: 11.4_
  - [ ]\* 10.3 Property test P21 SDK surfaces Policy errors without retry (TypeScript, fast-check)
    - **Property 21: SDK surfaces structured Policy errors without retry.** For any SDK `pay` invocation that receives a structured Policy_Engine error response, the SDK returns an error to the caller whose `code` and `message` equal those of the response, makes no further request to the Settlement_Service for that PaymentRequest, and does not mutate any local cache.
    - Tag with `// Feature: agentpay-platform, Property 21: ...`; mock fetch counts request invocations; assert exactly one outbound request
    - _Requirements: 11.2, 11.3_
  - [ ]\* 10.4 Unit test R11.4 pinned versions and unsupported version warning
    - Lint task asserts no `^` or `~` ranges in `package.json` `dependencies`
    - Mock `/v1/meta/version` to return a version outside the supported range and assert exactly one warning is emitted
    - _Requirements: 11.4_

- [ ] 11. AgentPay SDK (Python)
  - [~] 11.1 Implement Python SDK with mirrored surface
    - Package at `sdk/python/` (PEP 621 `pyproject.toml`) exposes `register_agent`, `discover_agents`, `request_quote`, `pay`, `get_obligation`, `set_policy`, `issue_session_key`, `revoke_session_key`
    - Use `web3.py` for chain reads and `coincurve` for EIP-712 signing; serialise PaymentRequest with `agentpay_canonical_json`
    - _Requirements: 11.1, 11.2, 4.1, 4.2, 4.3_
  - [~] 11.2 Pin dependencies and add unsupported API version warning
    - Pin exact versions of `web3`, `coincurve`, `agentpay_canonical_json` in `pyproject.toml`
    - On first call, fetch `/v1/meta/version`; on mismatch raise `warnings.warn` exactly once
    - _Requirements: 11.4_
  - [~] 11.3 Mirror P21 behaviour in Python SDK as a deterministic unit test
    - Use mocked HTTP transport to assert: SDK surfaces structured `{code, message}` to caller, performs no retry, does not mutate local cache
    - Test is example-based (the property-based test for P21 lives in Task 10.3 to keep one PBT per property)
    - _Requirements: 11.2, 11.3_

- [~] 12. MVP checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Discovery_Service (post-MVP)
  - [~] 13.1 OpenAPI 3.1 validation and embedding pipeline
    - `POST /v1/discovery/providers` validates body against OpenAPI 3.1 schema; on failure return list of per-violation errors
    - Summarise endpoint descriptions and compute embedding vector (interface to embedding provider abstracted behind `EmbeddingClient`; default in-tree fake for tests)
    - Upsert `(handle, vec, trust_score, last_updated)` into `discovery_index`
    - _Requirements: 2.1, 2.4_
  - [~] 13.2 Search endpoint with trust-score filter
    - `GET /v1/discovery/search?q&min_trust_score&limit` returns up to 50 handles ordered by cosine similarity descending, filtered by `trust_score >= min_trust_score`
    - _Requirements: 2.2, 2.3_
  - [~] 13.3 Deregistration with 60-second propagation
    - `DELETE /v1/discovery/providers/{handle}` removes row; expose a guarantee that subsequent reads after 60s exclude the handle (via cache TTL <= 60s)
    - _Requirements: 2.5_
  - [ ]\* 13.4 Property test P3 search filter and ordering (TypeScript, fast-check)
    - **Property 3: Discovery search filters and orders correctly.** For any discovery index `I`, query `q`, optional `min_trust_score` filter `t`, and limit `n <= 50`, the result `R = search(I, q, t, n)` satisfies: (a) `|R| <= n`, (b) every handle `h` in `R` has `trust_score(h) >= t`, and (c) cosine similarity to `q` is non-increasing along `R`.
    - Tag with `// Feature: agentpay-platform, Property 3: ...`; uses an in-tree deterministic fake embedding
    - _Requirements: 2.2, 2.3_
  - [ ]\* 13.5 Property test P4 deregistration window (TypeScript, fast-check)
    - **Property 4: Discovery deregistration removes entries within the propagation window.** For any indexed provider `h`, calling `deregister(h)` at time `t` implies that for any query `q` evaluated at time `t' >= t + 60s`, the result does not contain `h`.
    - Tag with `// Feature: agentpay-platform, Property 4: ...`; uses logical clock to step beyond 60s window
    - _Requirements: 2.5_
  - [ ]\* 13.6 Unit test R2.4 invalid OpenAPI 3.1 yields per-violation error list
    - Submit fixtures violating different OpenAPI 3.1 rules and assert response contains a list of errors, one per violation, each with `path` and `reason`
    - _Requirements: 2.4_

- [ ] 14. Negotiation_Engine (post-MVP)
  - [~] 14.1 RFQ and quote flow with deadlines
    - `POST /v1/rfq`, `POST /v1/rfq/{id}/quote`, `POST /v1/rfq/{id}/accept`, `GET /v1/sla/{sla_id}`
    - Enforce consumer-provided `deadline_ms`; on expiry return `rfq_timeout` and cancel pending RFQ
    - _Requirements: 3.1, 3.2, 3.4_
  - [~] 14.2 SLA canonical-JSON signing by both parties
    - On accept, build canonical-JSON SLA without signatures, verify provider signature, attach consumer signature, persist; on either signature failure emit audit event and return error
    - _Requirements: 3.3, 3.5_
  - [ ]\* 14.3 Property test P5 SLA signature verification (TypeScript, fast-check)
    - **Property 5: SLA signatures verify against canonical bytes.** For any accepted RFQ producing SLA `s`, both `consumer_signature` and `provider_signature` verify against the canonical JSON encoding of `s` with those two fields excluded, using the public keys recorded on the respective handles; an SLA whose signatures fail this check is rejected and an audit event is emitted.
    - Tag with `// Feature: agentpay-platform, Property 5: ...`; generates valid and tampered SLAs and asserts acceptance/rejection plus audit emission
    - _Requirements: 3.3, 3.5_
  - [ ]\* 14.4 Unit test R3.4 RFQ timeout
    - Submit RFQ with short deadline, assert response `rfq_timeout` after deadline elapses and that the RFQ row is marked cancelled
    - _Requirements: 3.4_

- [ ] 15. Verification_Mesh (post-MVP)
  - [~] 15.1 Evidence_Envelope parser and log attestation verifier
    - `POST /v1/verify/evidence` parses canonical-JSON `EvidenceEnvelope`, validates `envelope_hash`, `prev_hash` against the obligation's chain, `observed_latency_ms <= sla.latency_bound_ms`, `now <= sla.expiry`, and the log attestation signature
    - Reject envelopes with neither `log_attestation` nor `tee_attestation`
    - _Requirements: 5.1, 5.3_
  - [~] 15.2 Verdict emission and refund trigger
    - Emit `PASS` to `RAILS_Ledger.markVerdict` on success, `FAIL` on failure or SLA expiry
    - Write one verdict audit record containing verdict, verifier identity, and envelope hash
    - _Requirements: 5.3, 5.4, 5.5_
  - [~] 15.3 TEE attestation plug-in interface
    - Define `TeeAttestationVerifier` interface with a single `verify(quote, measurement, signerRoot)` method; ship a placeholder implementation that rejects all quotes with `unsupported_attestation` so v2 can drop in real verifiers without touching call sites
    - _Requirements: 5.2_
  - [ ]\* 15.4 Property test P9 verification verdict function (TypeScript, fast-check)
    - **Property 9: Verification verdict is a pure function of evidence, SLA, and time.** For any Evidence_Envelope `e` referencing Obligation_Object `o` under SLA `s`, the emitted verdict `v = verify(e, o, s, now)` is `PASS` iff all hold: (a) `e.envelope_hash` verifies against canonical bytes of `e` excluding `envelope_hash`, (b) `e.prev_hash` equals the previous envelope hash in `o`'s chain, (c) `e.observed_latency_ms <= s.latency_bound_ms`, (d) at least one of `log_attestation` or `tee_attestation` verifies under `s.success_criteria`, and (e) `now <= s.expiry`; otherwise `v = FAIL`. In both cases an audit record is emitted containing the verdict, verifier identity, and `e.envelope_hash`.
    - Tag with `// Feature: agentpay-platform, Property 9: ...`; arbitraries vary each sub-clause independently
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 16. Reputation_Service (post-MVP)
  - [~] 16.1 Trust_Score update on verdicts
    - Subscribe to `obligation.transitions` topic; on FINAL (PASS) increment `trust_score` by configured `reputation_pass_delta` capped at 100, on REVERSED (FAIL) decrement by `reputation_fail_delta` floored at 0
    - _Requirements: 6.1, 6.2_
  - [~] 16.2 Stake_Vault integration
    - `POST /v1/reputation/stake` calls on-chain `Stake_Vault.stake`; `POST /v1/reputation/stake/withdraw` calls `requestWithdraw`; on FAIL verdict trigger `slash(handle, floor(stake * phi), counterparty)` via the `REPUTATION_SETTLER_ROLE` relayer
    - `phi` is a platform constant for v1 (open design decision noted in design.md)
    - _Requirements: 6.3, 6.5_
  - [~] 16.3 Reputation query endpoint
    - `GET /v1/reputation/{handle}` returns `{trust_score, total_count, success_rate, stake_usdc_micro}` with `total_count = pass_count + fail_count` and `success_rate = pass_count / total_count` (or `null` when `total_count == 0`)
    - _Requirements: 6.4_
  - [~] 16.4 Block withdrawal while open obligations
    - Reject withdrawal at service layer with `pending_obligations` whenever `open_obligation_count(handle) > 0`; the contract enforces the same invariant on-chain via `requestWithdraw` revert
    - _Requirements: 6.5_
  - [ ]\* 16.5 Property test P10 Trust_Score clamped arithmetic (TypeScript, fast-check)
    - **Property 10: Trust_Score evolves as clamped arithmetic over verdict sequence.** For any handle `h` with initial score `s0`, configured increments `+p` for PASS and `-f` for FAIL, and any sequence of verdicts `V`, the resulting Trust_Score equals `clamp(s0 + p*pass_count(V) - f*fail_count(V), 0, 100)`.
    - Tag with `// Feature: agentpay-platform, Property 10: ...`; arbitrary generates random verdict sequences and `(s0, p, f)` tuples
    - _Requirements: 6.1, 6.2_
  - [ ]\* 16.6 Property test P12 reputation query consistency (TypeScript, fast-check)
    - **Property 12: Reputation query reflects materialised state.** For any handle `h`, `get_reputation(h)` returns a tuple equal to the materialised `(trust_score, total_count, success_rate)` where `total_count = pass_count + fail_count` and `success_rate = pass_count / total_count` when `total_count > 0` else `null`.
    - Tag with `// Feature: agentpay-platform, Property 12: ...`
    - _Requirements: 6.4_
  - [ ]\* 16.7 Property test P13 stake withdrawal blocked on open obligations (TypeScript, fast-check)
    - **Property 13: Stake withdrawal is blocked while obligations are open.** For any handle `h` with `open_obligation_count(h) > 0`, `withdraw_stake(h, any_amount)` returns `pending_obligations` and stake balance is unchanged.
    - Tag with `// Feature: agentpay-platform, Property 13: ...`; on-chain invariant additionally covered by Task 2.8
    - _Requirements: 6.5_

- [ ] 17. Identity_Registry handle transfer (post-MVP)
  - [~] 17.1 Implement handle transfer endpoint
    - `POST /v1/agents/{handle}/transfer` verifies signature, calls on-chain `transferHandle`, leaves `trust_scores` row untouched, appends one `transfer` audit record containing `{handle, old_smart_account, new_smart_account, signature}`
    - _Requirements: 1.5_
  - [ ]\* 17.2 Property test P2 transfer preserves trust and audit history (TypeScript, fast-check)
    - **Property 2: Handle transfer preserves trust score and audit history.** For any registered handle `h` with Trust_Score `s` and audit record set `R`, transferring `h` to any new Smart_Account `a'` leaves Trust_Score equal to `s` and the audit record set for `h` a superset of `R` containing exactly one additional transfer record.
    - Tag with `// Feature: agentpay-platform, Property 2: ...`; uses Anvil fork plus DB harness
    - _Requirements: 1.5_

- [ ] 18. FINAL and REVERSED finality plus oversight intervention (post-MVP)
  - [~] 18.1 Wire verdict to on-chain release or refund
    - Extend `RAILS_Ledger.markVerdict` so PASS triggers `Escrow_Vault.release(obligationId)` and FAIL triggers `Escrow_Vault.refund(obligationId)`
    - Emit `finality_transition` audit record per terminal state
    - _Requirements: 9.3, 9.4, 9.5_
  - [~] 18.2 Oversight intervention pause and decision endpoints
    - Add `POST /v1/audit/oversight/decide` to Audit_Logger: writes `oversight_decision` record and, on `reject`, inserts `oversight_rejections(sla_id, reviewer, decided_at)` so Policy_Engine (Task 5.5) denies subsequent payments
    - Add `oversight_pause` audit event emitted from Audit_Logger when an agent configured with intervention reaches the named reasoning step; reviewer notification transport stub returns 423 `intervention_pending` until a decision is made
    - _Requirements: 10.4, 10.5_
  - [ ]\* 18.3 Long-running fuzz test for audit chain (extends P19 coverage)
    - Issue a long sequence of random `AuditEvent` values across many handles and periodically verify the full chain via `record_hash` recomputation; assert `immutable_record` on attempted mutations
    - _Requirements: 10.1, 10.2_

- [ ] 19. Integration verification
  - [~] 19.1 Docker Compose test bench
    - `docker-compose.test.yml` runs Postgres (with pgvector), Redis, Kafka (KRaft single-broker), and an Anvil fork of Base Sepolia
    - `tests/e2e/bootstrap/` migrates schemas, deploys contracts via `forge script` against Anvil, and seeds a known operator key, USDC mock, and Smart_Account
    - _Requirements: 4.2, 9.1, 10.1_
  - [~] 19.2 Cross-service end-to-end automated scenario
    - Implement under `tests/e2e/` a jest test that walks: register_agent (MVP) → request_quote (post-MVP) → pay (x402) → submit evidence → verdict PASS → FINAL → release; and a parallel scenario covering FAIL → REVERSED → refund
    - Verify Property 18 transitions across services and audit chain integrity end-to-end (Property 19)
    - _Requirements: 1.1, 4.2, 4.3, 5.1, 5.3, 5.4, 9.1, 9.2, 9.3, 9.4, 9.5, 10.1_
  - [~] 19.3 CI workflow runs the full PBT and forge suites
    - GitHub Actions workflow under `.github/workflows/ci.yml` runs in order: `pnpm install`, `pnpm -r build`, `pnpm -r test` (jest with fast-check, minimum 100 iterations enforced via `numRuns`), `uv run pytest` (hypothesis with `max_examples=100`), `forge test --fuzz-runs 256 --invariant-runs 64`, and the docker-compose E2E scenario from 19.2
    - Workflow fails on any PBT counterexample or forge invariant violation
    - _Requirements: 12.3, 12.4, 12.6_
  - [~] 19.4 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Property-to-task index

| Property                                   | Task                              | Library            |
| ------------------------------------------ | --------------------------------- | ------------------ |
| P1 Registration idempotent + initial trust | 9.3 (off-chain) + 2.5 (on-chain)  | fast-check + forge |
| P2 Handle transfer preserves trust         | 17.2                              | fast-check         |
| P3 Discovery filter and ordering           | 13.4                              | fast-check         |
| P4 Discovery deregistration window         | 13.5                              | fast-check         |
| P5 SLA signatures verify                   | 14.3                              | fast-check         |
| P6 x402 round-trip                         | 8.5                               | fast-check         |
| P7 Approved charge produces escrow lock    | 8.7 (off-chain) + 2.3 (on-chain)  | fast-check + forge |
| P8 Unsupported asset/network rejection     | 8.6                               | fast-check         |
| P9 Verification verdict function           | 15.4                              | fast-check         |
| P10 Trust_Score clamped arithmetic         | 16.5                              | fast-check         |
| P11 Slashing conserves USDC                | 2.7                               | forge              |
| P12 Reputation query consistency           | 16.6                              | fast-check         |
| P13 Withdrawal blocked while open          | 16.7 (off-chain) + 2.8 (on-chain) | fast-check + forge |
| P14 Policy atomic decision                 | 5.6                               | fast-check         |
| P15 Policy updates + reduced cap           | 5.7                               | fast-check         |
| P16 Policy update audit completeness       | 5.8                               | fast-check         |
| P17 Policy query consistency               | 5.9                               | fast-check         |
| P18 RAILS finality state machine           | 7.4 (off-chain) + 2.3 (on-chain)  | fast-check + forge |
| P19 Audit hash chain monotone              | 4.3                               | fast-check         |
| P20 Oversight rejection blocks payments    | 5.12                              | fast-check         |
| P21 SDK surfaces Policy errors no retry    | 10.3                              | fast-check         |
| P22 Canonical JSON round-trip              | 1.5                               | fast-check         |
| P23 Canonical JSON deterministic           | 1.6                               | fast-check         |
| P24 Session key validity window            | 5.10                              | fast-check         |
| P25 Session key revocation propagation     | 5.11                              | fast-check         |

## Notes

- Tasks marked with `*` are optional. They are property tests, unit edge-case tests, gas optimisations, dashboards, and the long-running audit fuzz. The platform's MVP and post-MVP behaviour can be assembled by completing the non-optional tasks alone; the optional sub-tasks deliver the correctness guarantees the design commits to.
- Each leaf task references the specific requirement sub-clauses it implements via `_Requirements: X.Y_`.
- MVP slice ends at Task 12. A developer executing Tasks 1-12 in order produces a runnable end-to-end MVP covering R1, R4, R7, R8, R9 partial, R10 partial, R11, R12, and R13.
- Post-MVP services (Tasks 13-18) layer on top behind the same Policy_Engine and RAILS_Ledger contracts established in MVP; their PBTs validate the remaining properties.
- Task 19 is the integration verification gate. The CI workflow defined in 19.3 runs every PBT (`fast-check` + `hypothesis` + `forge`) plus the cross-service E2E scenario; this is the build's correctness contract.

## Task Dependency Graph

```yaml
dependencies:
  '2. On-chain contracts on Base L2 (Solidity 0.8.24, Foundry)':
    ['1. Bootstrap monorepo and canonical JSON packages']
  '3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)':
    ['1. Bootstrap monorepo and canonical JSON packages']
  '4. Audit_Logger service': ['3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)']
  '5. Policy_Engine service': ['3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)']
  '6. Checkpoint - foundation and Policy_Engine':
    ['4. Audit_Logger service', '5. Policy_Engine service']
  '7. RAILS_Ledger service':
    ['3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)', '4. Audit_Logger service']
  '8. Settlement_Service':
    [
      '2. On-chain contracts on Base L2 (Solidity 0.8.24, Foundry)',
      '5. Policy_Engine service',
      '7. RAILS_Ledger service',
    ]
  '9. Identity_Registry service and Reputation initialisation':
    [
      '2. On-chain contracts on Base L2 (Solidity 0.8.24, Foundry)',
      '3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)',
    ]
  '10. AgentPay SDK (TypeScript)':
    ['1. Bootstrap monorepo and canonical JSON packages', '8. Settlement_Service']
  '11. AgentPay SDK (Python)':
    ['1. Bootstrap monorepo and canonical JSON packages', '8. Settlement_Service']
  '12. MVP checkpoint':
    [
      '6. Checkpoint - foundation and Policy_Engine',
      '8. Settlement_Service',
      '9. Identity_Registry service and Reputation initialisation',
      '10. AgentPay SDK (TypeScript)',
      '11. AgentPay SDK (Python)',
    ]
  '13. Discovery_Service (post-MVP)':
    ['3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)']
  '14. Negotiation_Engine (post-MVP)':
    ['3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)']
  '15. Verification_Mesh (post-MVP)': ['7. RAILS_Ledger service']
  '16. Reputation_Service (post-MVP)':
    [
      '2. On-chain contracts on Base L2 (Solidity 0.8.24, Foundry)',
      '3. Shared service infrastructure (NestJS, Postgres, Redis, Kafka)',
    ]
  '17. Identity_Registry handle transfer (post-MVP)':
    ['9. Identity_Registry service and Reputation initialisation']
  '18. FINAL and REVERSED finality plus oversight intervention (post-MVP)':
    ['7. RAILS_Ledger service', '15. Verification_Mesh (post-MVP)']
  '19. Integration verification': ['12. MVP checkpoint']
```

## Workflow Completion

This workflow has produced the three spec artifacts (requirements, design, tasks). Implementation begins by opening `tasks.md` and clicking "Start task" next to a task item.
