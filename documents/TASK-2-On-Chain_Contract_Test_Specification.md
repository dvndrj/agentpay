# On-Chain Contracts — Test Specification

**Version:** 1.0
**Date:** 2026-06-29
**Scope:** Task 2 — AgentPay On-chain Contracts (Solidity 0.8.24, Foundry)
**Target audience:** QA / Testing Team
**Prerequisites:** Foundry installed (`foundryup`), Node.js ≥18 (for anvil), `contracts/` directory at repo root

---

## 1. Overview

This document describes the three Solidity smart contracts deployed on Base L2, the role-based access control system that binds them, and the 47 automated tests that validate correctness. It is intended to help QA engineers understand what has been built, how to run the existing tests, and what manual or integration scenarios to add.

### Contracts under test

| Contract | File | Purpose | Requirements |
|---|---|---|---|
| `Roles` | `src/Roles.sol` | Defines `RAILS_SETTLER_ROLE` and `REPUTATION_SETTLER_ROLE` constants | R4.2, R6.3, R9.3, R9.4 |
| `EscrowVault` | `src/EscrowVault.sol` | Holds USDC against obligations; releases to provider or refunds to payer | R4.2, R9.3, R9.4 |
| `IdentityRegistry` | `src/IdentityRegistry.sol` | ERC-8004 over ERC-721; issues persistent agent handles | R1.1, R1.3, R1.5 |
| `StakeVault` | `src/StakeVault.sol` | Manages reputation staking, slashing, and open-obligation tracking | R6.3, R6.5 |

### Interfaces

| File | Purpose |
|---|---|
| `src/interfaces/IEscrowVault.sol` | Escrow `EscrowState` enum, `Escrow` struct, events, function signatures |
| `src/interfaces/IIdentityRegistry.sol` | Identity events and function signatures |
| `src/interfaces/IStakeVault.sol` | Stake `Stake` struct, events, function signatures |

---

## 2. How to Run Tests

### Quick start

```bash
cd contracts
forge build                # compile (via_ir enabled)
forge test                 # all 47 tests, fuzz_runs=256, invariant_runs=64
forge test -vvv            # verbose traces on failure
forge test --match-contract EscrowVaultTest   # single suite
forge snapshot --match-contract "EscrowVaultTest|StakeVaultTest"   # gas baseline
```

### Environment

- **Solidity:** 0.8.24 with `via_ir = true`, `optimizer = true`, `optimizer_runs = 200`
- **Fuzz:** 256 runs per parametric test (CI profile: 1024)
- **Invariant:** 64 runs × 256 depth per invariant test (CI profile: 256 runs × 512 depth)
- **Dependencies:** OpenZeppelin Contracts v5 (`lib/openzeppelin-contracts/`), forge-std
- **Mock token:** `ERC20Mock` from OpenZeppelin (mintable/burnable ERC-20, 18 decimals)

### CI command

```bash
forge test --fuzz-runs 1024 --invariant-runs 256 --invariant-depth 512
```

---

## 3. Contract-by-Contract Test Coverage

### 3.1 EscrowVault (`test/EscrowVault.t.sol`) — 15 tests

**Deployment:** `EscrowVault(address usdc)` — USDC is `immutable`; deployer gets `DEFAULT_ADMIN_ROLE`. A mock `ERC20Mock` is deployed and minted to a test payer in `setUp()`.

#### 3.1.1 Property 7: Escrow Lock with Conserved Amount (R4.2)

| Test | Type | What it asserts |
|---|---|---|
| `testFuzz_Lock_StoresCorrectAmount(uint256)` | Fuzz (256) | `lock(id, P, Q, A)` → escrow struct `{amount: A, payer: P, payee: Q, state: LOCKED}`; payer balance decreases by exactly `A`; vault balance increases by exactly `A` |
| `testFuzz_Lock_ZeroPayerReverts(uint256)` | Fuzz (256) | `lock(id, address(0), Q, A)` reverts with `InvalidAddress` |
| `testFuzz_Lock_ZeroPayeeReverts(uint256)` | Fuzz (256) | `lock(id, P, address(0), A)` reverts with `InvalidAddress` |
| `testFuzz_Lock_ZeroAmountReverts()` | Example | `lock(id, P, Q, 0)` reverts with `InvalidAmount` |
| `testFuzz_Lock_DuplicateReverts(uint256)` | Fuzz (256) | Second `lock()` on same `obligationId` reverts |

#### 3.1.2 Property 18: Finality State Machine (R9.3, R9.4)

| Test | What it asserts |
|---|---|
| `test_Release_NonSettlerReverts()` | Non-`RAILS_SETTLER_ROLE` caller cannot `release()` |
| `test_Refund_NonSettlerReverts()` | Non-`RAILS_SETTLER_ROLE` caller cannot `refund()` |
| `test_Release_NotFoundReverts()` | `release()` on non-existent obligation reverts |
| `test_Refund_NotFoundReverts()` | `refund()` on non-existent obligation reverts |
| `test_Release_AlreadyReleasedReverts()` | Second `release()` reverts with `EscrowNotLocked` + state `RELEASED` |
| `test_Refund_AlreadyRefundedReverts()` | Second `refund()` reverts with `EscrowNotLocked` + state `REFUNDED` |
| `test_Release_Success()` | `release()` transitions LOCKED → RELEASED; payee receives funds |
| `test_Refund_Success()` | `refund()` transitions LOCKED → REFUNDED; payer receives refund |
| `test_Release_CEIStateBeforeTransfer()` | State written before external transfer (CEI pattern) |
| `invariant_EscrowStateValid()` | Invariant (64/16384): all escrow states ∈ {NONE, LOCKED, RELEASED, REFUNDED}; no invalid states appear under random call sequences |

#### Custom errors

| Error | Signature | When |
|---|---|---|
| `EscrowAlreadyExists` | `bytes32 obligationId` | Duplicate `lock()` |
| `EscrowNotFound` | `bytes32 obligationId` | `release()`/`refund()` on unknown id |
| `EscrowNotLocked` | `bytes32 obligationId, EscrowState currentState` | `release()`/`refund()` when not LOCKED |
| `InvalidAddress` | — | Zero payer or payee |
| `InvalidAmount` | — | Zero amount in `lock()` |

#### Events

| Event | Fields |
|---|---|
| `Locked` | `indexed bytes32 obligationId, indexed address payer, indexed address payee, uint256 amount` |
| `Released` | `indexed bytes32 obligationId, indexed address payee, uint256 amount` |
| `Refunded` | `indexed bytes32 obligationId, indexed address payer, uint256 amount` |

#### Gas baseline

| Operation | Gas (approximate) |
|---|---|
| `lock()` happy path | ~153,000 |
| `release()` happy path | ~163,000 |
| `refund()` happy path | ~139,000 |
| `lock()` duplicate revert | ~149,000 |
| `release()` not-found revert | ~21,000 |
| `refund()` not-found revert | ~21,000 |

---

### 3.2 IdentityRegistry (`test/IdentityRegistry.t.sol`) — 13 tests

**Deployment:** `IdentityRegistry()` — Inherits OpenZeppelin `ERC721("AgentPay Identity", "APID")` + `AccessControl`. Deployer receives `DEFAULT_ADMIN_ROLE` and `ADMIN_ROLE`. Token IDs start at 1 (0 = unregistered).

#### 3.2.1 Property 1: Idempotent Registration (R1.1, R1.3)

| Test | Type | What it asserts |
|---|---|---|
| `testFuzz_Mint_Idempotent(address, bytes32, bytes32)` | Fuzz (256) | First `mintHandle(a, m1)` returns tokenId ≠ 0 and `balanceOf(a) == 1`; second `mintHandle(a, m2)` returns the **same** tokenId and `balanceOf(a)` stays 1 |
| `testFuzz_Mint_ZeroAddressReverts(bytes32)` | Fuzz (256) | `mintHandle(address(0), m)` reverts with `"IdentityRegistry: zero address"` |
| `testFuzz_Mint_DifferentAddresses(bytes32, bytes32)` | Fuzz (256) | Two addresses get different handles |
| `testFuzz_Mint_SequentialHandles(bytes32, bytes32, bytes32)` | Fuzz (256) | Token IDs are sequential: 1, 2, 3 |

#### 3.2.2 Lookups

| Test | What it asserts |
|---|---|
| `test_GetHandle_UnregisteredReturnsZero()` | `getHandle(unknown)` → 0, `isRegistered(unknown)` → false |
| `test_GetSmartAccount_NotFoundReverts()` | `getSmartAccount(999)` reverts with `"…handle does not exist"` |

#### 3.2.3 Handle Transfer (R1.5)

| Test | What it asserts |
|---|---|
| `test_TransferHandle_NonOwnerReverts()` | Non-owner cannot transfer |
| `test_TransferHandle_ToRegisteredReverts()` | Cannot transfer to an already-registered address |
| `test_TransferHandle_Success()` | Owner transfers: old owner cleared, new owner mapped, `balanceOf` updated |

#### 3.2.4 Revocation

| Test | What it asserts |
|---|---|
| `test_RevokeHandle_NonAdminReverts()` | Non-admin cannot revoke |
| `test_RevokeHandle_Success()` | Admin revokes: all mappings cleared, token burned |
| `test_RevokeThenRemint()` | Same address can mint a **new** handle after revocation |

#### 3.2.5 Interface Support

| Test | What it asserts |
|---|---|
| `test_SupportsInterfaces()` | `supportsInterface` returns true for ERC-721 (`0x80ac58cd`), ERC-721Metadata (`0x5b5e139f`), and IAccessControl |

---

### 3.3 StakeVault (`test/StakeVault.t.sol`) — 19 tests

**Deployment:** `StakeVault(address usdc, address admin)` — USDC is `immutable`; `admin` receives `DEFAULT_ADMIN_ROLE`. Test setup grants `REPUTATION_SETTLER_ROLE` and `RAILS_SETTLER_ROLE` to dedicated addresses.

#### 3.3.1 Property 11: Slash Conservation (R6.3)

| Test | Type | What it asserts |
|---|---|---|
| `testFuzz_Slash_Conservation(uint256, uint256)` | Fuzz (256) | After `slash(h, slashAmount, C)`: stake amount = `S - slashAmount`, counterparty balance = `C_before + slashAmount`, vault balance = `V_before - slashAmount` |
| `testFuzz_Slash_ZeroAmountReverts(uint256)` | Fuzz (256) | `slash(h, 0, C)` reverts `"StakeVault: zero amount"` |
| `test_Slash_NonSettlerReverts()` | Example | Non-`REPUTATION_SETTLER_ROLE` cannot slash |
| `test_Slash_InsufficientStakeReverts()` | Example | Slashing > stake reverts `"StakeVault: insufficient stake"` |
| `test_Slash_ZeroRecipientReverts()` | Example | `slash(h, A, address(0))` reverts `"StakeVault: zero recipient"` |
| `test_Slash_ReducesLockedAmount()` | Example | Slashing into locked stake reduces `lockedAmount` proportionally |

#### 3.3.2 Property 13: Withdrawal Blocked by Open Obligations (R6.5)

| Test | Type | What it asserts |
|---|---|---|
| `testFuzz_Withdraw_BlockedByOpenObligations(uint256, uint256)` | Fuzz (256) | `withdraw()` reverts `"StakeVault: open obligations exist"` when `openObligationCount > 0`; stake unchanged |
| `test_Withdraw_SucceedsAfterObligationsCleared()` | Example | After `decrementOpenObligations`, `withdraw()` succeeds |
| `test_DecrementOpenObligations_UnderflowReverts()` | Example | `decrementOpenObligations()` at 0 reverts `"…no open obligations"` |
| `test_OpenObligations_NonSettlerReverts()` | Example | Non-`RAILS_SETTLER_ROLE` cannot increment/decrement |
| `invariant_WithdrawBlockedWhileOpen()` | Invariant (64/16384) | Every `withdraw()` reverts when `openObligationCount > 0`; stake never mutates on failed withdrawal |

#### 3.3.3 Stake / Withdraw Flows

| Test | Type | What it asserts |
|---|---|---|
| `testFuzz_Stake_Success(uint256)` | Fuzz (256) | Stake increases vault balance, records `{owner, amount}`, `getAvailableStake` matches |
| `test_Stake_ZeroAmountReverts()` | Example | `stake(h, 0)` reverts `"StakeVault: zero amount"` |
| `test_Stake_TopUp()` | Example | Same owner can add more stake |
| `test_Stake_NonOwnerTopUpReverts()` | Example | Different caller cannot top-up `"…not stake owner"` |
| `test_Withdraw_NonOwnerReverts()` | Example | Non-owner cannot withdraw |
| `test_Withdraw_RespectsLockedAmount()` | Example | Can only withdraw `amount - lockedAmount` |

#### 3.3.4 Lock / Unlock Stake

| Test | What it asserts |
|---|---|
| `test_LockUnlock_Flow()` | `lockStake` reduces available, `unlockStake` restores it. Total amount unchanged. |
| `test_LockUnlock_NonSettlerReverts()` | Non-`REPUTATION_SETTLER_ROLE` cannot lock/unlock |

#### Gas baseline

| Operation | Gas (approximate) |
|---|---|
| `stake()` first time | ~108,000 |
| `stake()` top-up | ~108,000 |
| `slash()` | ~143,000 |
| `withdraw()` (no obligations) | ~122,000 |
| `withdraw()` blocked revert | ~134,000 |
| `lockStake()` | ~136,000 (part of flow) |

---

## 4. Role-Based Access Control Summary

| Role | Constant | Granted to | Permissions |
|---|---|---|---|
| `RAILS_SETTLER_ROLE` | `keccak256("RAILS_SETTLER_ROLE")` | RAILS_Ledger service | EscrowVault: `release()`, `refund()`; StakeVault: `incrementOpenObligations()`, `decrementOpenObligations()` |
| `REPUTATION_SETTLER_ROLE` | `keccak256("REPUTATION_SETTLER_ROLE")` | Reputation_Service | StakeVault: `slash()`, `lockStake()`, `unlockStake()` |
| `DEFAULT_ADMIN_ROLE` | `0x00` | Deployer | Grants/revokes all roles |
| `ADMIN_ROLE` | `keccak256("ADMIN_ROLE")` | Deployer (IdentityRegistry) | `revokeHandle()` |

**QA note:** Any test that calls `release()`, `refund()`, `slash()`, `lockStake()`, or `unlockStake()` from an address without the required role **must** revert. The existing tests cover every function × role matrix for the expected failure path.

---

## 5. State Machine Diagrams

### EscrowVault

```
                    lock(P, Q, A)
    NONE ────────────────────────────► LOCKED
                                         │
                    release()            │  refund()
    RELEASED ◄────────────────────────   │  ────────────────────────► REFUNDED
                                         │
    (cannot transition further)          (cannot transition further)
```

**Rule:** No path from LOCKED goes anywhere except RELEASED or REFUNDED — and only once. The invariant test (`invariant_EscrowStateValid`) verifies this under 16,384 random call sequences.

### StakeVault Withdrawal Rule

```
    withdraw(h, A)  ──►  REVERT  (if openObligationCount[h] > 0)
    withdraw(h, A)  ──►  SUCCESS (if openObligationCount[h] == 0 AND available >= A)
```

---

## 6. Suggested Manual / Integration Test Scenarios

The automated tests cover correctness properties. QA should add the following integration scenarios:

### 6.1 Cross-contract flow

1. Deploy all three contracts to a local Anvil fork of Base Sepolia.
2. Grant `RAILS_SETTLER_ROLE` to a test relayer EOA.
3. **Full lifecycle:**
   - `IdentityRegistry.mintHandle(alice, metadataHash)` → handle 1
   - `StakeVault.stake(1, 1000 USDC)`
   - `EscrowVault.lock(obligationId, alice, bob, 500 USDC)`
   - Verify USDC balances: alice −500, vault +500
   - `EscrowVault.release(obligationId)` → bob +500, state RELEASED
   - Verify `StakeVault.openObligationCount` management works across increment/decrement

### 6.2 Revert path: refund

1. Lock funds in escrow.
2. Call `refund(obligationId)` from `RAILS_SETTLER_ROLE`.
3. Assert alice received refund, state = REFUNDED.
4. Assert second `refund()` or `release()` reverts.

### 6.3 Slashing with open obligations

1. Stake 1000 USDC on handle 1.
2. `incrementOpenObligations(1)`.
3. Attempt `withdraw(1, any)` → must revert.
4. `slash(1, 200, counterparty)` from `REPUTATION_SETTLER_ROLE` → succeeds.
5. Verify: stake = 800, counterparty +200, vault −200.
6. `decrementOpenObligations(1)`.
7. `withdraw(1, 500)` → succeeds (available = 800, no locked stake).
8. `withdraw(1, 400)` → reverts (only 300 available).

### 6.4 Identity full lifecycle

1. Mint handle → transfer to new address → revoke → re-mint.
2. Verify `getHandle()`, `isRegistered()`, `getSmartAccount()` at each step.
3. Confirm ERC-721 `Transfer`, `HandleMinted`, `HandleTransferred`, `HandleRevoked` events.

### 6.5 Role isolation

1. Deploy contracts, attempt every gated function from:
   - An address with no roles.
   - An address with wrong role (e.g., `REPUTATION_SETTLER_ROLE` calling `release()`).
2. All must revert per the matrix in §4.

### 6.6 CREATE2 determinism

1. Deploy to Anvil via `forge script script/Deploy.s.sol` with a known salt and USDC address.
2. Note deployed addresses.
3. Wipe and re-deploy with same salt → addresses must be identical.
4. Change salt → addresses must differ.

---

## 7. Test Output Reference (expected)

```
Ran 3 test suites: 47 tests passed, 0 failed, 0 skipped

IdentityRegistryTest ... 13 passed  (fuzz: 256 runs each fuzz test)
StakeVaultTest ......... 19 passed  (fuzz: 256, invariant: 64/16384)
EscrowVaultTest ........ 15 passed  (fuzz: 256, invariant: 64/16384)
```

---

## 8. File Index

| File | Purpose |
|---|---|
| `contracts/src/Roles.sol` | Role constants |
| `contracts/src/EscrowVault.sol` | Escrow implementation |
| `contracts/src/IdentityRegistry.sol` | Identity implementation |
| `contracts/src/StakeVault.sol` | Stake implementation |
| `contracts/src/interfaces/IEscrowVault.sol` | Escrow interface |
| `contracts/src/interfaces/IIdentityRegistry.sol` | Identity interface |
| `contracts/src/interfaces/IStakeVault.sol` | Stake interface |
| `contracts/test/EscrowVault.t.sol` | Escrow tests (15) |
| `contracts/test/IdentityRegistry.t.sol` | Identity tests (13) |
| `contracts/test/StakeVault.t.sol` | Stake tests (19) |
| `contracts/script/Deploy.s.sol` | CREATE2 deployment script |
| `contracts/foundry.toml` | Foundry config |
| `contracts/.gas-snapshot` | Gas baseline |
