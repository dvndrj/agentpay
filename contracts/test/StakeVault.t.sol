// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {StakeVault} from "../src/StakeVault.sol";
import {Roles} from "../src/Roles.sol";
import {IStakeVault} from "../src/interfaces/IStakeVault.sol";
import {ERC20Mock} from "openzeppelin-contracts/contracts/mocks/token/ERC20Mock.sol";

/**
 * @title StakeVaultTest
 * @notice Fuzz and invariant tests for StakeVault covering P11 and P13 on-chain.
 *
 * Feature: agentpay-platform
 * Property 11: Slashing conserves USDC across stake and counterparty.
 *   For any FAIL verdict against handle `h` with stake `S`, counterparty `C`,
 *   and slash fraction `phi in [0, 1]`, after `slash(h, floor(S * phi), C)`:
 *   - new stake is `S - floor(S * phi)`
 *   - counterparty `C` USDC balance increases by exactly `floor(S * phi)`
 *   - total USDC across stake vault and counterparty is unchanged.
 *
 * Property 13 (on-chain): Stake withdrawal is blocked while obligations are open.
 *   Under any sequence of incrementOpenObligations / decrementOpenObligations /
 *   withdraw calls, withdraw reverts whenever openObligationCount[handle] > 0
 *   and stake balance is unchanged.
 */
contract StakeVaultTest is Test {
    StakeVault public vault;
    ERC20Mock public usdc;

    address public admin = makeAddr("admin");
    address public reputationSettler = makeAddr("reputationSettler");
    address public railsSettler = makeAddr("railsSettler");
    address public staker = makeAddr("staker");
    address public counterparty = makeAddr("counterparty");
    address public stranger = makeAddr("stranger");

    uint256 public constant INITIAL_MINT = 1_000_000 * 1e6;

    uint256 public constant HANDLE = 1;

    function setUp() public {
        usdc = new ERC20Mock();
        usdc.mint(staker, INITIAL_MINT);

        vault = new StakeVault(address(usdc), admin);

        // Grant roles
        vm.startPrank(admin);
        vault.grantRole(Roles.REPUTATION_SETTLER_ROLE, reputationSettler);
        vault.grantRole(Roles.RAILS_SETTLER_ROLE, railsSettler);
        vm.stopPrank();

        // Staker approves vault
        vm.prank(staker);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    function _stake(uint256 amount) private {
        vm.prank(staker);
        vault.stake(HANDLE, amount);
    }

    // ─────────────────────────────────────────────────────────────
    // Property 11: Slashing conserves USDC
    // ─────────────────────────────────────────────────────────────

    /// @notice Fuzz: slash conserves USDC across stake, counterparty, and vault.
    /// Tag: // Feature: agentpay-platform, Property 11: ...
    function testFuzz_Slash_Conservation(
        uint256 stakeAmount,
        uint256 slashAmount
    ) public {
        vm.assume(stakeAmount > 0);
        vm.assume(stakeAmount <= INITIAL_MINT);
        vm.assume(slashAmount > 0);
        vm.assume(slashAmount <= stakeAmount);

        // Setup: stake first
        _stake(stakeAmount);
        uint256 vaultBalBefore = usdc.balanceOf(address(vault));
        uint256 cpBalBefore = usdc.balanceOf(counterparty);

        // Slash
        vm.prank(reputationSettler);
        vault.slash(HANDLE, slashAmount, counterparty);

        // Assertions
        IStakeVault.Stake memory s = vault.getStake(HANDLE);
        assertEq(s.amount, stakeAmount - slashAmount, "stake amount not decremented correctly");
        assertEq(
            usdc.balanceOf(counterparty),
            cpBalBefore + slashAmount,
            "counterparty balance not incremented"
        );
        assertEq(
            usdc.balanceOf(address(vault)),
            vaultBalBefore - slashAmount,
            "vault balance not decremented"
        );
    }

    /// @notice Fuzz: slash zero amount reverts.
    function testFuzz_Slash_ZeroAmountReverts(uint256 stakeAmount) public {
        vm.assume(stakeAmount > 0);
        vm.assume(stakeAmount <= INITIAL_MINT);
        _stake(stakeAmount);

        vm.prank(reputationSettler);
        vm.expectRevert("StakeVault: zero amount");
        vault.slash(HANDLE, 0, counterparty);
    }

    /// @notice Slash by non-settler reverts.
    function test_Slash_NonSettlerReverts() public {
        _stake(100 * 1e6);

        vm.prank(stranger);
        vm.expectRevert();
        vault.slash(HANDLE, 50 * 1e6, counterparty);
    }

    /// @notice Slash more than stake reverts.
    function test_Slash_InsufficientStakeReverts() public {
        _stake(100 * 1e6);

        vm.prank(reputationSettler);
        vm.expectRevert("StakeVault: insufficient stake");
        vault.slash(HANDLE, 101 * 1e6, counterparty);
    }

    /// @notice Slash to zero address reverts.
    function test_Slash_ZeroRecipientReverts() public {
        _stake(100 * 1e6);

        vm.prank(reputationSettler);
        vm.expectRevert("StakeVault: zero recipient");
        vault.slash(HANDLE, 50 * 1e6, address(0));
    }

    // ─────────────────────────────────────────────────────────────
    // Property 13 (on-chain): Withdrawal blocked while open obligations
    // ─────────────────────────────────────────────────────────────

    /// @notice Fuzz: withdraw when openObligationCount > 0 reverts.
    /// Tag: // Feature: agentpay-platform, Property 13 (on-chain): ...
    function testFuzz_Withdraw_BlockedByOpenObligations(
        uint256 stakeAmount,
        uint256 withdrawAmount
    ) public {
        vm.assume(stakeAmount > 0);
        vm.assume(stakeAmount <= INITIAL_MINT);
        vm.assume(withdrawAmount > 0);
        vm.assume(withdrawAmount <= stakeAmount);

        _stake(stakeAmount);

        // Increment open obligations
        vm.prank(railsSettler);
        vault.incrementOpenObligations(HANDLE);

        // Withdraw should revert
        vm.prank(staker);
        vm.expectRevert("StakeVault: open obligations exist");
        vault.withdraw(HANDLE, withdrawAmount);

        // Stake balance unchanged
        assertEq(vault.getStake(HANDLE).amount, stakeAmount, "stake should be unchanged");
    }

    /// @notice Withdraw succeeds after obligations are cleared.
    function test_Withdraw_SucceedsAfterObligationsCleared() public {
        _stake(200 * 1e6);

        // Open and close an obligation
        vm.startPrank(railsSettler);
        vault.incrementOpenObligations(HANDLE);
        vault.decrementOpenObligations(HANDLE);
        vm.stopPrank();

        // Now withdraw should work
        uint256 stakerBalBefore = usdc.balanceOf(staker);
        vm.prank(staker);
        vault.withdraw(HANDLE, 100 * 1e6);

        assertEq(vault.getStake(HANDLE).amount, 100 * 1e6, "half withdrawn");
        assertEq(usdc.balanceOf(staker), stakerBalBefore + 100 * 1e6, "staker received funds");
    }

    /// @notice Decrement open obligations below zero reverts.
    function test_DecrementOpenObligations_UnderflowReverts() public {
        vm.prank(railsSettler);
        vm.expectRevert("StakeVault: no open obligations");
        vault.decrementOpenObligations(HANDLE);
    }

    /// @notice Increment/decrement open obligations by non-settler reverts.
    function test_OpenObligations_NonSettlerReverts() public {
        vm.prank(stranger);
        vm.expectRevert();
        vault.incrementOpenObligations(HANDLE);

        vm.prank(stranger);
        vm.expectRevert();
        vault.decrementOpenObligations(HANDLE);
    }

    // ─────────────────────────────────────────────────────────────
    // Stake / Withdraw flows
    // ─────────────────────────────────────────────────────────────

    /// @notice Fuzz: stake increases vault balance and stake record.
    function testFuzz_Stake_Success(uint256 amount) public {
        vm.assume(amount > 0);
        vm.assume(amount <= INITIAL_MINT);

        uint256 stakerBalBefore = usdc.balanceOf(staker);
        uint256 vaultBalBefore = usdc.balanceOf(address(vault));

        _stake(amount);

        IStakeVault.Stake memory s = vault.getStake(HANDLE);
        assertEq(s.amount, amount, "stake amount mismatch");
        assertEq(s.owner, staker, "stake owner mismatch");
        assertEq(usdc.balanceOf(staker), stakerBalBefore - amount, "staker balance not decreased");
        assertEq(usdc.balanceOf(address(vault)), vaultBalBefore + amount, "vault balance not increased");
        assertEq(vault.getAvailableStake(HANDLE), amount, "available stake mismatch");
    }

    /// @notice Stake zero amount reverts.
    function test_Stake_ZeroAmountReverts() public {
        vm.prank(staker);
        vm.expectRevert("StakeVault: zero amount");
        vault.stake(HANDLE, 0);
    }

    /// @notice Top-up stake by same owner succeeds.
    function test_Stake_TopUp() public {
        _stake(100 * 1e6);
        _stake(50 * 1e6);

        assertEq(vault.getStake(HANDLE).amount, 150 * 1e6);
        assertEq(vault.getAvailableStake(HANDLE), 150 * 1e6);
    }

    /// @notice Stake by non-owner after initial stake reverts.
    function test_Stake_NonOwnerTopUpReverts() public {
        _stake(100 * 1e6);

        vm.prank(stranger);
        vm.expectRevert("StakeVault: not stake owner");
        vault.stake(HANDLE, 50 * 1e6);
    }

    /// @notice Withdraw by non-owner reverts.
    function test_Withdraw_NonOwnerReverts() public {
        _stake(100 * 1e6);

        vm.prank(stranger);
        vm.expectRevert("StakeVault: not stake owner");
        vault.withdraw(HANDLE, 50 * 1e6);
    }

    // ─────────────────────────────────────────────────────────────
    // Lock / Unlock stake (by REPUTATION_SETTLER_ROLE)
    // ─────────────────────────────────────────────────────────────

    /// @notice Lock reduces available stake, unlock restores it.
    function test_LockUnlock_Flow() public {
        _stake(200 * 1e6);

        vm.prank(reputationSettler);
        vault.lockStake(HANDLE, 75 * 1e6);

        assertEq(vault.getStake(HANDLE).amount, 200 * 1e6, "total unchanged by lock");
        assertEq(vault.getStake(HANDLE).lockedAmount, 75 * 1e6, "locked amount set");
        assertEq(vault.getAvailableStake(HANDLE), 125 * 1e6, "available reduced");

        vm.prank(reputationSettler);
        vault.unlockStake(HANDLE, 50 * 1e6);

        assertEq(vault.getStake(HANDLE).lockedAmount, 25 * 1e6, "locked amount reduced");
        assertEq(vault.getAvailableStake(HANDLE), 175 * 1e6, "available restored");
    }

    /// @notice Lock/unlock by non-settler reverts.
    function test_LockUnlock_NonSettlerReverts() public {
        _stake(100 * 1e6);

        vm.prank(stranger);
        vm.expectRevert();
        vault.lockStake(HANDLE, 50 * 1e6);

        vm.prank(stranger);
        vm.expectRevert();
        vault.unlockStake(HANDLE, 50 * 1e6);
    }

    /// @notice Withdraw respects locked amount: can't withdraw locked portion.
    function test_Withdraw_RespectsLockedAmount() public {
        _stake(200 * 1e6);

        vm.prank(reputationSettler);
        vault.lockStake(HANDLE, 150 * 1e6);

        // Try to withdraw more than available (200 - 150 = 50 available)
        vm.prank(staker);
        vm.expectRevert("StakeVault: insufficient available stake");
        vault.withdraw(HANDLE, 100 * 1e6);

        // But can withdraw up to available
        vm.prank(staker);
        vault.withdraw(HANDLE, 50 * 1e6);
        assertEq(vault.getStake(HANDLE).amount, 150 * 1e6);
    }

    /// @notice Slash reduces locked amount when applicable.
    function test_Slash_ReducesLockedAmount() public {
        _stake(200 * 1e6);

        vm.prank(reputationSettler);
        vault.lockStake(HANDLE, 100 * 1e6);

        // Slash 60 from locked stake
        vm.prank(reputationSettler);
        vault.slash(HANDLE, 60 * 1e6, counterparty);

        assertEq(vault.getStake(HANDLE).amount, 140 * 1e6);
        assertEq(vault.getStake(HANDLE).lockedAmount, 40 * 1e6, "locked amount reduced by slash");
        assertEq(vault.getAvailableStake(HANDLE), 100 * 1e6);
    }

    // ─────────────────────────────────────────────────────────────
    // Invariant: withdrawal blocked while open obligations (P13)
    // ─────────────────────────────────────────────────────────────

    /// @notice Invariant: any withdraw call reverts when openObligationCount > 0.
    function invariant_WithdrawBlockedWhileOpen() public {
        // This is a sanity check: if there are open obligations, any
        // withdraw attempt should revert or be impossible.
        // Since the invariant harasser uses random call sequences,
        // we just assert that the invariant holds for our known handle.
        if (vault.openObligationCount(HANDLE) > 0) {
            uint256 stakeBefore = vault.getStake(HANDLE).amount;
            vm.prank(staker);
            try vault.withdraw(HANDLE, 1) {
                // If it didn't revert, it should only happen when count is 0
                assertEq(vault.openObligationCount(HANDLE), 0, "withdraw succeeded with open obligations");
            } catch {
                // Revert is expected when count > 0
                assertEq(vault.getStake(HANDLE).amount, stakeBefore, "stake should not change on failed withdraw");
            }
        }
    }
}
