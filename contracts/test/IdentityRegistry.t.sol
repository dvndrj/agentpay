// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {IIdentityRegistry} from "../src/interfaces/IIdentityRegistry.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @title IdentityRegistryTest
 * @notice Fuzz tests for IdentityRegistry covering P1 on-chain sub-case.
 *
 * Feature: agentpay-platform
 * Property 1 (on-chain): Registration is idempotent.
 *   For any address `a`, after the first call to `mintHandle(a, m)`,
 *   every subsequent `mintHandle(a, m')` returns the same tokenId,
 *   and `balanceOf(a) == 1`.
 */
contract IdentityRegistryTest is Test {
    IdentityRegistry public registry;

    address public operator = makeAddr("operator");
    address public agent1 = makeAddr("agent1");
    address public agent2 = makeAddr("agent2");
    address public agent3 = makeAddr("agent3");

    function setUp() public {
        registry = new IdentityRegistry();
    }

    // ─────────────────────────────────────────────────────────────
    // Property 1 (on-chain): Registration is idempotent
    // ─────────────────────────────────────────────────────────────

    /// @notice Fuzz: first mint succeeds, subsequent mints return same handle,
    ///         ERC-721 balance stays at 1.
    /// Tag: // Feature: agentpay-platform, Property 1 (on-chain): ...
    function testFuzz_Mint_Idempotent(
        address smartAccount,
        bytes32 metadata1,
        bytes32 metadata2
    ) public {
        vm.assume(smartAccount != address(0));
        vm.assume(smartAccount != address(registry));
        vm.assume(smartAccount != address(vm));
        vm.assume(smartAccount.code.length == 0); // avoid collision with contract address

        // First mint
        uint256 handle1 = registry.mintHandle(smartAccount, metadata1);
        assertTrue(handle1 != 0, "first mint should return non-zero handle");
        assertEq(registry.balanceOf(smartAccount), 1, "balance should be 1 after first mint");
        assertTrue(registry.isRegistered(smartAccount), "should be registered after mint");
        assertEq(registry.getHandle(smartAccount), handle1, "getHandle should return same handle");
        assertEq(registry.getSmartAccount(handle1), smartAccount, "getSmartAccount should return address");

        // Second mint with different metadata
        uint256 handle2 = registry.mintHandle(smartAccount, metadata2);
        assertEq(handle2, handle1, "second mint should return same handle");
        assertEq(registry.balanceOf(smartAccount), 1, "balance should still be 1");
        assertEq(registry.getHandle(smartAccount), handle1, "handle mapping unchanged");
    }

    /// @notice Fuzz: mint to zero address reverts.
    function testFuzz_Mint_ZeroAddressReverts(bytes32 metadata) public {
        vm.expectRevert("IdentityRegistry: zero address");
        registry.mintHandle(address(0), metadata);
    }

    /// @notice Fuzz: two different addresses get different handles.
    function testFuzz_Mint_DifferentAddresses(bytes32 metadata1, bytes32 metadata2) public {
        vm.assume(agent1 != address(0));
        vm.assume(agent2 != address(0));
        vm.assume(agent1 != agent2);

        uint256 h1 = registry.mintHandle(agent1, metadata1);
        uint256 h2 = registry.mintHandle(agent2, metadata2);

        assertTrue(h1 != h2, "different addresses should get different handles");
        assertEq(registry.balanceOf(agent1), 1);
        assertEq(registry.balanceOf(agent2), 1);
    }

    /// @notice Fuzz: three addresses get sequential handles.
    function testFuzz_Mint_SequentialHandles(bytes32 m1, bytes32 m2, bytes32 m3) public {
        uint256 h1 = registry.mintHandle(agent1, m1);
        uint256 h2 = registry.mintHandle(agent2, m2);
        uint256 h3 = registry.mintHandle(agent3, m3);

        // Token IDs start at 1 and increment
        assertEq(h1, 1);
        assertEq(h2, 2);
        assertEq(h3, 3);
    }

    /// @notice getHandle for unregistered address returns 0.
    function test_GetHandle_UnregisteredReturnsZero() public {
        assertEq(registry.getHandle(makeAddr("unknown")), 0);
        assertFalse(registry.isRegistered(makeAddr("unknown")));
    }

    /// @notice getSmartAccount for non-existent handle reverts.
    function test_GetSmartAccount_NotFoundReverts() public {
        vm.expectRevert("IdentityRegistry: handle does not exist");
        registry.getSmartAccount(999);
    }

    /// @notice revokeHandle by non-admin reverts.
    function test_RevokeHandle_NonAdminReverts() public {
        uint256 handle = registry.mintHandle(agent1, bytes32(0));

        vm.prank(makeAddr("notAdmin"));
        vm.expectRevert();
        registry.revokeHandle(handle);
    }

    /// @notice revokeHandle by admin succeeds and clears state.
    function test_RevokeHandle_Success() public {
        uint256 handle = registry.mintHandle(agent1, bytes32(uint256(0x1234)));

        // Admin (deployer) revokes
        registry.revokeHandle(handle);

        assertFalse(registry.isRegistered(agent1), "should not be registered after revoke");
        assertEq(registry.getHandle(agent1), 0, "getHandle should return 0");
        assertEq(registry.balanceOf(agent1), 0, "balance should be 0 after burn");
    }

    /// @notice After revoke, same address can mint a new handle.
    function test_RevokeThenRemint() public {
        uint256 handle1 = registry.mintHandle(agent1, bytes32(0));

        // Admin revokes
        registry.revokeHandle(handle1);

        // Same address mints again, gets a new (different) handle
        uint256 handle2 = registry.mintHandle(agent1, bytes32(uint256(0xabcd)));
        assertTrue(handle2 != handle1, "re-mint should give new handle");
        assertEq(registry.balanceOf(agent1), 1);
        assertTrue(registry.isRegistered(agent1));
    }

    /// @notice transferHandle as non-owner reverts.
    function test_TransferHandle_NonOwnerReverts() public {
        uint256 handle = registry.mintHandle(agent1, bytes32(0));

        vm.prank(agent2); // not the owner
        vm.expectRevert("IdentityRegistry: caller is not the owner");
        registry.transferHandle(handle, agent2);
    }

    /// @notice transferHandle to already-registered address reverts.
    function test_TransferHandle_ToRegisteredReverts() public {
        uint256 h1 = registry.mintHandle(agent1, bytes32(0));
        registry.mintHandle(agent2, bytes32(0));

        vm.prank(agent1);
        vm.expectRevert("IdentityRegistry: new account already registered");
        registry.transferHandle(h1, agent2);
    }

    /// @notice transferHandle success updates both mappings.
    function test_TransferHandle_Success() public {
        uint256 handle = registry.mintHandle(agent1, bytes32(0));

        vm.prank(agent1);
        registry.transferHandle(handle, agent2);

        // Old owner
        assertEq(registry.getHandle(agent1), 0, "old owner should have no handle");
        assertFalse(registry.isRegistered(agent1));
        assertEq(registry.balanceOf(agent1), 0);

        // New owner
        assertEq(registry.getHandle(agent2), handle, "new owner should have handle");
        assertTrue(registry.isRegistered(agent2));
        assertEq(registry.balanceOf(agent2), 1);
        assertEq(registry.getSmartAccount(handle), agent2);
    }

    /// @notice Supports both ERC-721 and AccessControl interfaces.
    function test_SupportsInterfaces() public {
        // ERC-721 interface ID
        assertTrue(registry.supportsInterface(0x80ac58cd), "should support ERC721");
        // ERC-721 Metadata interface ID
        assertTrue(registry.supportsInterface(0x5b5e139f), "should support ERC721Metadata");
        // AccessControl interface ID
        assertTrue(registry.supportsInterface(type(IAccessControl).interfaceId), "should support AccessControl");
    }
}
