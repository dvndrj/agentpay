# AgentPay

AgentPay is a financial operating system for the autonomous agent economy. It
bridges off-chain agent workflows (MCP, A2A) with on-chain financial primitives
on Base L2, enabling sub-cent micropayments under enforced policy with
auditable records.

The platform is organised as a six-layer protocol stack (Identity, Discovery,
Negotiation, Settlement, Verification, Reputation) backed by an
infrastructure-level Policy Engine, a RAILS clearing framework, and a Glass Box
audit log. See [`.kiro/specs/agentpay-platform/`](.kiro/specs/agentpay-platform)
for the canonical requirements, design, and task plan.

## Workspace layout

```
agentpay/
├── pnpm-workspace.yaml          # pnpm workspace manifest
├── package.json                 # root npm scripts, pnpm@9, typescript@5
├── tsconfig.base.json           # strict TS base config (ES2022, bundler resolution)
├── eslint.config.mjs            # flat ESLint config (typescript-eslint + prettier)
├── .prettierrc.json             # 2 spaces, single quotes, trailing commas all, width 100
├── pyproject.toml               # uv workspace root (Python)
├── packages/
│   ├── canonical-json-ts/       # @agentpay/canonical-json (TypeScript)
│   └── canonical-json-py/       # agentpay_canonical_json (Python)
├── contracts/                   # Solidity 0.8.24, Foundry
│   ├── foundry.toml             # pinned: optimizer runs 200, fuzz_runs 256, invariant_runs 64
│   ├── src/                     # contract sources
│   ├── test/                    # forge unit + fuzz + invariant tests
│   ├── script/                  # CREATE2 deployment scripts
│   └── lib/                     # forge-installed dependencies
├── services/
│   ├── shared/                  # NestJS shared libs (error envelope, idempotency, kafka, redis)
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
│   ├── typescript/              # @agentpay/sdk
│   └── python/                  # agentpay_sdk
└── tests/
    └── e2e/                     # cross-service jest scenarios
```

The directories under `packages/`, `services/`, `sdk/`, and `tests/` are
created incrementally by subsequent tasks; only the workspace scaffolding lives
at the root today.

## Toolchain

| Tool       | Version  | Purpose                                              |
| ---------- | -------- | ---------------------------------------------------- |
| Node.js    | >= 20.11 | TypeScript runtime for services and SDK              |
| pnpm       | 9.x      | Workspace package manager (pinned via `packageManager`) |
| TypeScript | ^5.4     | Strict, ES2022, `noUncheckedIndexedAccess`           |
| Python     | >= 3.11  | Canonical JSON and Python SDK                        |
| uv         | latest   | Python workspace and dependency manager              |
| Foundry    | latest   | Solidity 0.8.24 compiler, fuzz, and invariant tests  |

## Getting started

```bash
# JavaScript / TypeScript
corepack enable
pnpm install

# Python
uv sync

# Solidity
cd contracts && forge install && forge build
```

If `forge` is not available locally, see
[`contracts/README.md`](contracts/README.md) for the manual fallback.

## Conventions

- All HTTP APIs are versioned at `/v1` and return structured error envelopes
  (`{code, message, details, request_id}`); see `design.md`.
- All signed records (Obligation, Evidence, SLA, AuditRecord) are encoded with
  the canonical JSON spec defined in `packages/canonical-json-*`.
- Property-based tests (fast-check / hypothesis / forge) live next to the code
  they validate and are tagged with `Feature: agentpay-platform, Property N`.
