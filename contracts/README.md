# AgentPay Contracts (Foundry)

Solidity 0.8.24 contracts for the AgentPay platform on Base L2: `IdentityRegistry`
(ERC-8004 over ERC-721), `EscrowVault`, and `StakeVault`. See the root
[`design.md`](../.kiro/specs/agentpay-platform/design.md) for the on-chain section.

## Layout

```
contracts/
├── foundry.toml         # Solidity 0.8.24, optimizer runs 200, fuzz_runs 256, invariant_runs 64
├── src/                 # contract sources
├── test/                # forge unit + fuzz + invariant tests
├── script/              # deployment scripts (CREATE2)
└── lib/                 # forge-installed dependencies (openzeppelin-contracts, forge-std)
```

## Bootstrap

The standard bootstrap is:

```bash
forge init --no-commit .
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
forge install foundry-rs/forge-std --no-commit
forge build
```

### Manual fallback (no `forge` available)

The initial scaffolding in this repo was produced without `forge` (the binary
was not available in the sandbox). The directory tree (`src/`, `test/`,
`script/`, `lib/`) and `foundry.toml` were created by hand so subsequent tasks
can install Foundry dependencies and start adding contracts. To complete the
bootstrap on a machine with the Foundry toolchain installed:

1. Install Foundry: <https://book.getfoundry.sh/getting-started/installation>.
2. From the repository root, run:
   ```bash
   cd contracts
   forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
   forge install foundry-rs/forge-std --no-commit
   forge build
   ```
3. Verify the configured profile by running `forge config` and confirming
   Solidity is pinned to `0.8.24`, optimizer is on with 200 runs, fuzz runs are
   256, and invariant runs are 64.

## Build & test

```bash
forge build
forge test            # unit + fuzz + invariant (--fuzz-runs 256, --invariant-runs 64)
forge snapshot        # gas baseline; committed by task 2.10
```
