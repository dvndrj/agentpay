// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {StakeVault} from "../src/StakeVault.sol";
import {Roles} from "../src/Roles.sol";

/**
 * @title Deploy
 * @notice Deterministic CREATE2 deployment of AgentPay on-chain contracts.
 *
 * Deploys IdentityRegistry, EscrowVault, and StakeVault via CREATE2 using a salt
 * sourced from the DEPLOY_SALT environment variable. This produces identical
 * addresses on Base mainnet and Base Sepolia given the same salt and bytecode.
 *
 * Usage:
 *   forge script script/Deploy.s.sol:Deploy --rpc-url <RPC_URL> --broadcast
 *
 *   # Override salt (default: keccak256("agentpay.v1")):
 *   DEPLOY_SALT=0x... forge script script/Deploy.s.sol:Deploy --rpc-url <RPC_URL> --broadcast
 *
 *   # Required env vars:
 *   #   USDC_ADDRESS  - USDC token address on the target network
 *   #   ADMIN_ADDRESS - Address to receive DEFAULT_ADMIN_ROLE on StakeVault
 *   #   DEPLOY_SALT   - (optional) 32-byte hex salt for CREATE2
 *
 * Output: writes deployment artifacts to ./deployments/{network}.json
 */
contract Deploy is Script {
    /// @notice Default salt: keccak256("agentpay.v1")
    bytes32 public constant DEFAULT_SALT = 0xd8c6e8f5a1b3c7d9e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8;

    /// @notice USDC address on Base mainnet
    address public constant USDC_BASE_MAINNET = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /// @notice USDC address on Base Sepolia testnet
    address public constant USDC_BASE_SEPOLIA = 0x036cbd53842C5426634E792954EC13d37b9D4230;

    function run() external {
        // ── Load configuration ──────────────────────────────────
        bytes32 salt = _getSalt();
        address usdc = _getUsdc();
        address admin = _getAdmin();

        console.log("=== AgentPay CREATE2 Deployment ===");
        console.log("Salt:");
        console.logBytes32(salt);
        console.log("USDC:", usdc);
        console.log("Admin:", admin);

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        // ── Deploy IdentityRegistry ─────────────────────────────
        IdentityRegistry identityRegistry = new IdentityRegistry{salt: salt}();
        console.log("IdentityRegistry deployed at:", address(identityRegistry));

        // ── Deploy EscrowVault ─────────────────────────────────
        EscrowVault escrowVault = new EscrowVault{salt: salt}(usdc);
        console.log("EscrowVault deployed at:", address(escrowVault));

        // ── Deploy StakeVault ──────────────────────────────────
        StakeVault stakeVault = new StakeVault{salt: salt}(usdc, admin);
        console.log("StakeVault deployed at:", address(stakeVault));

        vm.stopBroadcast();

        // ── Write deployment artifact ───────────────────────────
        _writeArtifact(address(identityRegistry), address(escrowVault), address(stakeVault), usdc, admin, salt);
    }

    /// @dev Read salt from DEPLOY_SALT env var or use default.
    function _getSalt() private returns (bytes32) {
        bytes32 envSalt = vm.envOr("DEPLOY_SALT", bytes32(0));
        if (envSalt != bytes32(0)) {
            return envSalt;
        }
        return DEFAULT_SALT;
    }

    /// @dev Read USDC address from env or detect from chain ID.
    function _getUsdc() private returns (address) {
        address envUsdc = vm.envOr("USDC_ADDRESS", address(0));
        if (envUsdc != address(0)) {
            return envUsdc;
        }
        // Fallback: detect by chain ID
        uint256 chainId = block.chainid;
        if (chainId == 8453) {
            return USDC_BASE_MAINNET;
        } else if (chainId == 84532) {
            return USDC_BASE_SEPOLIA;
        }
        revert("Set USDC_ADDRESS env var for this network");
    }

    /// @dev Read admin address from env or use deployer.
    function _getAdmin() private returns (address) {
        return vm.envOr("ADMIN_ADDRESS", msg.sender);
    }

    /// @dev Write deployment artifact JSON to ./deployments/{network}.json
    function _writeArtifact(
        address identityRegistry,
        address escrowVault,
        address stakeVault,
        address usdc,
        address admin,
        bytes32 salt
    ) private {
        string memory network = _networkName();
        string memory root = vm.projectRoot();
        string memory path = string(abi.encodePacked(root, "/deployments/", network, ".json"));

        // Build JSON manually
        string memory json = string(
            abi.encodePacked(
                "{\n",
                '  "network": "', network, '",\n',
                '  "chainId": ', vm.toString(block.chainid), ',\n',
                '  "salt": "', vm.toString(salt), '",\n',
                '  "deployer": "', vm.toString(msg.sender), '",\n',
                '  "usdc": "', vm.toString(usdc), '",\n',
                '  "admin": "', vm.toString(admin), '",\n',
                '  "contracts": {\n',
                '    "IdentityRegistry": "', vm.toString(identityRegistry), '",\n',
                '    "EscrowVault": "', vm.toString(escrowVault), '",\n',
                '    "StakeVault": "', vm.toString(stakeVault), '"\n',
                '  }\n',
                "}\n"
            )
        );

        vm.writeFile(path, json);
        console.log("Deployment artifact written to:", path);

        // Also write a simple .env-compatible addresses file
        string memory envPath = string(abi.encodePacked(root, "/deployments/", network, ".env"));
        string memory envContent = string(
            abi.encodePacked(
                "IDENTITY_REGISTRY=", vm.toString(identityRegistry), "\n",
                "ESCROW_VAULT=", vm.toString(escrowVault), "\n",
                "STAKE_VAULT=", vm.toString(stakeVault), "\n",
                "USDC=", vm.toString(usdc), "\n"
            )
        );
        vm.writeFile(envPath, envContent);
        console.log("Environment file written to:", envPath);
    }

    /// @dev Derive a human-readable network name from chain ID.
    function _networkName() private view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 8453) return "base-mainnet";
        if (chainId == 84532) return "base-sepolia";
        if (chainId == 31337) return "anvil";
        return vm.toString(chainId);
    }
}
