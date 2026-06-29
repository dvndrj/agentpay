// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IEscrowVault} from "./interfaces/IEscrowVault.sol";
import {Roles} from "./Roles.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title EscrowVault
 * @notice Escrow vault for holding USDC against obligations on the AgentPay platform.
 * @dev Implements the IEscrowVault interface with OpenZeppelin's AccessControl and ReentrancyGuard.
 *      Funds are locked when an obligation is created, then either released to the payee
 *      or refunded to the payer based on verification outcomes determined by RAILS_Ledger.
 *
 *      State transitions:
 *      - NONE → LOCKED: via lock() (anyone can call with approval)
 *      - LOCKED → RELEASED: via release() (RAILS_SETTLER_ROLE only)
 *      - LOCKED → REFUNDED: via refund() (RAILS_SETTLER_ROLE only)
 *
 *      Requirements: R4.2 (x402 settlement), R9.3 (release on FINAL), R9.4 (refund on REVERSED)
 *
 * @custom:security-contact security@agentpay.xyz
 */
contract EscrowVault is IEscrowVault, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice USDC token contract address on Base L2
    IERC20 public immutable usdc;

    /// @notice Mapping of obligation IDs to escrow data
    mapping(bytes32 => Escrow) private escrows;

    /// @notice Error thrown when attempting to lock funds for an obligation that already exists
    error EscrowAlreadyExists(bytes32 obligationId);

    /// @notice Error thrown when attempting to operate on a non-existent escrow
    error EscrowNotFound(bytes32 obligationId);

    /// @notice Error thrown when attempting to release/refund an escrow not in LOCKED state
    error EscrowNotLocked(bytes32 obligationId, EscrowState currentState);

    /// @notice Error thrown when providing invalid addresses (zero address)
    error InvalidAddress();

    /// @notice Error thrown when attempting to lock zero amount
    error InvalidAmount();

    /**
     * @notice Deploys the EscrowVault contract
     * @dev Grants DEFAULT_ADMIN_ROLE to the deployer. The admin can then grant RAILS_SETTLER_ROLE.
     * @param _usdc Address of the USDC token contract on Base L2
     */
    constructor(address _usdc) {
        if (_usdc == address(0)) revert InvalidAddress();

        usdc = IERC20(_usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @inheritdoc IEscrowVault
     * @dev Pulls USDC from the payer's address via safeTransferFrom.
     *      Caller must ensure the payer has approved this contract for at least `amount`.
     *      This function can be called by anyone (typically Settlement_Service).
     *
     *      Emits {Locked} event on success.
     *
     *      Requirements:
     *      - obligationId must not already exist in the escrows mapping
     *      - payer and payee must not be zero addresses
     *      - amount must be greater than zero
     *      - payer must have approved this contract for at least `amount` USDC
     *      - payer must have at least `amount` USDC balance
     *
     * @custom:security ReentrancyGuard applied to prevent reentrancy during token transfer
     */
    function lock(
        bytes32 obligationId,
        address payer,
        address payee,
        uint256 amount
    ) external nonReentrant {
        // Validate inputs
        if (payer == address(0) || payee == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (escrows[obligationId].state != EscrowState.NONE) {
            revert EscrowAlreadyExists(obligationId);
        }

        // Create escrow record
        escrows[obligationId] = Escrow({
            payer: payer,
            payee: payee,
            amount: amount,
            state: EscrowState.LOCKED
        });

        // Pull USDC from payer to this contract
        usdc.safeTransferFrom(payer, address(this), amount);

        emit Locked(obligationId, payer, payee, amount);
    }

    /**
     * @inheritdoc IEscrowVault
     * @dev Transfers escrowed USDC to the payee when obligation verification passes (R9.3).
     *      Only callable by accounts with RAILS_SETTLER_ROLE (typically RAILS_Ledger service).
     *
     *      Emits {Released} event on success.
     *
     *      Requirements:
     *      - Caller must have RAILS_SETTLER_ROLE
     *      - Escrow must exist and be in LOCKED state
     *      - Contract must have sufficient USDC balance to transfer
     *
     * @custom:security ReentrancyGuard applied to prevent reentrancy during token transfer
     */
    function release(bytes32 obligationId)
        external
        onlyRole(Roles.RAILS_SETTLER_ROLE)
        nonReentrant
    {
        Escrow storage escrow = escrows[obligationId];

        if (escrow.state == EscrowState.NONE) revert EscrowNotFound(obligationId);
        if (escrow.state != EscrowState.LOCKED) {
            revert EscrowNotLocked(obligationId, escrow.state);
        }

        // Update state before transfer (CEI pattern)
        escrow.state = EscrowState.RELEASED;
        address payee = escrow.payee;
        uint256 amount = escrow.amount;

        // Transfer USDC to payee
        usdc.safeTransfer(payee, amount);

        emit Released(obligationId, payee, amount);
    }

    /**
     * @inheritdoc IEscrowVault
     * @dev Refunds escrowed USDC to the payer when obligation verification fails (R9.4).
     *      Only callable by accounts with RAILS_SETTLER_ROLE (typically RAILS_Ledger service).
     *
     *      Emits {Refunded} event on success.
     *
     *      Requirements:
     *      - Caller must have RAILS_SETTLER_ROLE
     *      - Escrow must exist and be in LOCKED state
     *      - Contract must have sufficient USDC balance to transfer
     *
     * @custom:security ReentrancyGuard applied to prevent reentrancy during token transfer
     */
    function refund(bytes32 obligationId)
        external
        onlyRole(Roles.RAILS_SETTLER_ROLE)
        nonReentrant
    {
        Escrow storage escrow = escrows[obligationId];

        if (escrow.state == EscrowState.NONE) revert EscrowNotFound(obligationId);
        if (escrow.state != EscrowState.LOCKED) {
            revert EscrowNotLocked(obligationId, escrow.state);
        }

        // Update state before transfer (CEI pattern)
        escrow.state = EscrowState.REFUNDED;
        address payer = escrow.payer;
        uint256 amount = escrow.amount;

        // Transfer USDC back to payer
        usdc.safeTransfer(payer, amount);

        emit Refunded(obligationId, payer, amount);
    }

    /**
     * @inheritdoc IEscrowVault
     * @dev Returns a copy of the escrow data. Returns an escrow with state NONE if not found.
     */
    function getEscrow(bytes32 obligationId) external view returns (Escrow memory) {
        return escrows[obligationId];
    }
}
