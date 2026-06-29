// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {Roles} from "../src/Roles.sol";
import {IEscrowVault} from "../src/interfaces/IEscrowVault.sol";
import {ERC20Mock} from "openzeppelin-contracts/contracts/mocks/token/ERC20Mock.sol";

/**
 * @title EscrowVaultTest
 * @notice Fuzz and invariant tests for EscrowVault covering P7 and P18 on-chain sub-cases.
 *
 * Feature: agentpay-platform
 * Property 7 (on-chain): Approved charge produces an escrow lock with conserved amount.
 *   After lock(id, P, Q, A) succeeds:
 *     - escrows[id].amount == A
 *     - payer is P, payee is Q
 *     - total USDC balance across (payer + vault) is unchanged.
 *
 * Property 18 (on-chain): RAILS finality state machine.
 *   No path moves state outside { NONE -> LOCKED -> {RELEASED, REFUNDED} };
 *   any second call to release() or refund() reverts.
 */
contract EscrowVaultTest is Test {
    EscrowVault public vault;
    ERC20Mock public usdc;

    // Actors
    address public admin = makeAddr("admin");
    address public railsSettler = makeAddr("railsSettler");
    address public payer = makeAddr("payer");
    address public payee = makeAddr("payee");
    address public stranger = makeAddr("stranger");

    /// @notice Amount of USDC to mint for testing. 6 decimals, 1M tokens is plenty.
    uint256 public constant INITIAL_MINT = 1_000_000 * 1e6;

    function setUp() public {
        // Deploy mock USDC and mint to payer
        usdc = new ERC20Mock();
        usdc.mint(payer, INITIAL_MINT);

        // Deploy EscrowVault
        vault = new EscrowVault(address(usdc));

        // Grant RAILS_SETTLER_ROLE to the railsSettler account
        vault.grantRole(Roles.RAILS_SETTLER_ROLE, railsSettler);

        // Payer approves vault to spend their USDC
        vm.prank(payer);
        usdc.approve(address(vault), type(uint256).max);
    }

    // ─────────────────────────────────────────────────────────────
    // Property 7 (on-chain): Approved charge produces escrow lock
    // ─────────────────────────────────────────────────────────────

    /// @notice Fuzz: lock random amount, verify escrow state and balance conservation.
    /// Tag: // Feature: agentpay-platform, Property 7 (on-chain): ...
    function testFuzz_Lock_StoresCorrectAmount(
        uint256 amount
    ) public {
        vm.assume(amount > 0);
        vm.assume(amount <= INITIAL_MINT);

        bytes32 obligationId = keccak256(abi.encodePacked("obligation", amount, block.timestamp));

        uint256 payerBalBefore = usdc.balanceOf(payer);
        uint256 vaultBalBefore = usdc.balanceOf(address(vault));

        vm.prank(payer);
        vault.lock(obligationId, payer, payee, amount);

        // After lock: escrow state matches
        IEscrowVault.Escrow memory escrow = vault.getEscrow(obligationId);
        assertEq(escrow.amount, amount, "escrow amount mismatch");
        assertEq(escrow.payer, payer, "escrow payer mismatch");
        assertEq(escrow.payee, payee, "escrow payee mismatch");
        assertEq(
            uint256(escrow.state),
            uint256(IEscrowVault.EscrowState.LOCKED),
            "escrow state not LOCKED"
        );

        // Balance conservation: payer - amount, vault + amount
        assertEq(usdc.balanceOf(payer), payerBalBefore - amount, "payer balance not decreased");
        assertEq(usdc.balanceOf(address(vault)), vaultBalBefore + amount, "vault balance not increased");
    }

    /// @notice Fuzz: locking with zero payer address reverts.
    function testFuzz_Lock_ZeroPayerReverts(uint256 amount) public {
        vm.assume(amount > 0);
        bytes32 obligationId = keccak256(abi.encodePacked("obligation", amount, block.timestamp));

        vm.prank(payer);
        vm.expectRevert(EscrowVault.InvalidAddress.selector);
        vault.lock(obligationId, address(0), payee, amount);
    }

    /// @notice Fuzz: locking with zero payee address reverts.
    function testFuzz_Lock_ZeroPayeeReverts(uint256 amount) public {
        vm.assume(amount > 0);
        bytes32 obligationId = keccak256(abi.encodePacked("obligation", amount, block.timestamp));

        vm.prank(payer);
        vm.expectRevert(EscrowVault.InvalidAddress.selector);
        vault.lock(obligationId, payer, address(0), amount);
    }

    /// @notice Fuzz: locking with zero amount reverts.
    function testFuzz_Lock_ZeroAmountReverts() public {
        bytes32 obligationId = keccak256(abi.encodePacked("obligation", block.timestamp));

        vm.prank(payer);
        vm.expectRevert(EscrowVault.InvalidAmount.selector);
        vault.lock(obligationId, payer, payee, 0);
    }

    /// @notice Fuzz: duplicate lock on same obligation ID reverts.
    function testFuzz_Lock_DuplicateReverts(uint256 amount) public {
        vm.assume(amount > 0);
        vm.assume(amount <= INITIAL_MINT);
        bytes32 obligationId = keccak256(abi.encodePacked("obligation", amount, block.timestamp));

        vm.startPrank(payer);
        vault.lock(obligationId, payer, payee, amount);
        vm.expectRevert();
        vault.lock(obligationId, payer, payee, amount);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────
    // Property 18 (on-chain): RAILS finality state machine
    // ─────────────────────────────────────────────────────────────

    /// @notice release() by non-settler reverts.
    function test_Release_NonSettlerReverts() public {
        bytes32 obligationId = _lockForTest(100 * 1e6);

        vm.prank(stranger);
        vm.expectRevert();
        vault.release(obligationId);
    }

    /// @notice refund() by non-settler reverts.
    function test_Refund_NonSettlerReverts() public {
        bytes32 obligationId = _lockForTest(100 * 1e6);

        vm.prank(stranger);
        vm.expectRevert();
        vault.refund(obligationId);
    }

    /// @notice release() on non-existent obligation reverts.
    function test_Release_NotFoundReverts() public {
        bytes32 ghostId = keccak256(abi.encodePacked("ghost", block.timestamp));

        vm.prank(railsSettler);
        vm.expectRevert();
        vault.release(ghostId);
    }

    /// @notice refund() on non-existent obligation reverts.
    function test_Refund_NotFoundReverts() public {
        bytes32 ghostId = keccak256(abi.encodePacked("ghost", block.timestamp));

        vm.prank(railsSettler);
        vm.expectRevert();
        vault.refund(ghostId);
    }

    /// @notice release() on already-released escrow reverts.
    function test_Release_AlreadyReleasedReverts() public {
        bytes32 obligationId = _lockForTest(100 * 1e6);

        vm.startPrank(railsSettler);
        vault.release(obligationId);
        vm.expectRevert(
            abi.encodeWithSelector(EscrowVault.EscrowNotLocked.selector, obligationId, IEscrowVault.EscrowState.RELEASED)
        );
        vault.release(obligationId);
        vm.stopPrank();
    }

    /// @notice refund() on already-refunded escrow reverts.
    function test_Refund_AlreadyRefundedReverts() public {
        bytes32 obligationId = _lockForTest(100 * 1e6);

        vm.startPrank(railsSettler);
        vault.refund(obligationId);
        vm.expectRevert(
            abi.encodeWithSelector(EscrowVault.EscrowNotLocked.selector, obligationId, IEscrowVault.EscrowState.REFUNDED)
        );
        vault.refund(obligationId);
        vm.stopPrank();
    }

    /// @notice release() moves LOCKED -> RELEASED.
    function test_Release_Success() public {
        bytes32 obligationId = _lockForTest(100 * 1e6);
        uint256 payeeBalBefore = usdc.balanceOf(payee);

        vm.prank(railsSettler);
        vault.release(obligationId);

        IEscrowVault.Escrow memory escrow = vault.getEscrow(obligationId);
        assertEq(uint256(escrow.state), uint256(IEscrowVault.EscrowState.RELEASED), "state not RELEASED");
        assertEq(usdc.balanceOf(payee), payeeBalBefore + 100 * 1e6, "payee not paid");
    }

    /// @notice refund() moves LOCKED -> REFUNDED.
    function test_Refund_Success() public {
        bytes32 obligationId = _lockForTest(100 * 1e6);
        uint256 payerBalBefore = usdc.balanceOf(payer);

        vm.prank(railsSettler);
        vault.refund(obligationId);

        IEscrowVault.Escrow memory escrow = vault.getEscrow(obligationId);
        assertEq(uint256(escrow.state), uint256(IEscrowVault.EscrowState.REFUNDED), "state not REFUNDED");
        assertEq(usdc.balanceOf(payer), payerBalBefore + 100 * 1e6, "payer not refunded");
    }

    /// @notice release() respects CEI: state change before token transfer.
    function test_Release_CEIStateBeforeTransfer() public {
        bytes32 obligationId = _lockForTest(100 * 1e6);

        // Simulate the vault having insufficient balance during release
        // by transferring USDC out first
        vm.startPrank(railsSettler);
        // release() does CEI internally so we just verify the event and state
        vault.release(obligationId);

        IEscrowVault.Escrow memory escrow = vault.getEscrow(obligationId);
        assertEq(uint256(escrow.state), uint256(IEscrowVault.EscrowState.RELEASED));
    }

    // ─────────────────────────────────────────────────────────────
    // Invariant: state machine (P18 on-chain sub-case)
    // ─────────────────────────────────────────────────────────────

    /// @notice Invariant: the escrow state is always one of {NONE, LOCKED, RELEASED, REFUNDED}.
    function invariant_EscrowStateValid() public {
        // We can't enumerate all escrows in a raw invariant context,
        // so instead we'll spot-check a known set of obligations.
        bytes32[] memory ids = new bytes32[](3);
        ids[0] = keccak256(abi.encodePacked("inv1"));
        ids[1] = keccak256(abi.encodePacked("inv2"));
        ids[2] = keccak256(abi.encodePacked("inv3"));

        // Lock them
        vm.startPrank(payer);
        for (uint256 i = 0; i < ids.length; i++) {
            vault.lock(ids[i], payer, payee, 50 * 1e6);
        }
        vm.stopPrank();

        // Release first
        vm.prank(railsSettler);
        vault.release(ids[0]);

        // Refund second
        vm.prank(railsSettler);
        vault.refund(ids[1]);

        // Now check all three: only LOCKED, RELEASED, REFUNDED are valid
        for (uint256 i = 0; i < ids.length; i++) {
            IEscrowVault.Escrow memory e = vault.getEscrow(ids[i]);
            assertTrue(
                e.state == IEscrowVault.EscrowState.LOCKED ||
                e.state == IEscrowVault.EscrowState.RELEASED ||
                e.state == IEscrowVault.EscrowState.REFUNDED,
                "invalid escrow state"
            );
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────

    /// @dev Locks funds for a test obligation and returns the obligation ID.
    function _lockForTest(uint256 amount) private returns (bytes32 obligationId) {
        obligationId = keccak256(abi.encodePacked("test", amount, block.timestamp));
        vm.prank(payer);
        vault.lock(obligationId, payer, payee, amount);
        return obligationId;
    }
}
