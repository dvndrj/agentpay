// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IEscrowVault
 * @notice Interface for the Escrow Vault contract that holds USDC against obligations.
 * @dev Implements escrow functionality for AgentPay platform on Base L2.
 *      Requirements: R4.2, R9.3, R9.4
 */
interface IEscrowVault {
    /// @notice Possible states of an escrow
    enum EscrowState {
        NONE,
        LOCKED,
        RELEASED,
        REFUNDED
    }

    /// @notice Escrow data structure
    /// @param payer Address of the party who locked the funds
    /// @param payee Address of the party who will receive the funds on release
    /// @param amount Amount of USDC locked in the escrow
    /// @param state Current state of the escrow
    struct Escrow {
        address payer;
        address payee;
        uint256 amount;
        EscrowState state;
    }

    /// @notice Emitted when funds are locked in escrow
    /// @param obligationId Unique identifier for the obligation
    /// @param payer Address of the payer
    /// @param payee Address of the payee
    /// @param amount Amount of USDC locked
    event Locked(
        bytes32 indexed obligationId,
        address indexed payer,
        address indexed payee,
        uint256 amount
    );

    /// @notice Emitted when funds are released to the payee
    /// @param obligationId Unique identifier for the obligation
    /// @param payee Address receiving the funds
    /// @param amount Amount of USDC released
    event Released(
        bytes32 indexed obligationId,
        address indexed payee,
        uint256 amount
    );

    /// @notice Emitted when funds are refunded to the payer
    /// @param obligationId Unique identifier for the obligation
    /// @param payer Address receiving the refund
    /// @param amount Amount of USDC refunded
    event Refunded(
        bytes32 indexed obligationId,
        address indexed payer,
        uint256 amount
    );

    /**
     * @notice Lock USDC in escrow for a specific obligation
     * @dev Pulls USDC from payer via safeTransferFrom. Requires prior approval.
     * @param obligationId Unique identifier for the obligation
     * @param payer Address of the party providing the funds
     * @param payee Address of the party who will receive the funds on release
     * @param amount Amount of USDC to lock
     */
    function lock(
        bytes32 obligationId,
        address payer,
        address payee,
        uint256 amount
    ) external;

    /**
     * @notice Release escrowed funds to the payee (R9.3)
     * @dev Only callable by RAILS_SETTLER_ROLE. Requires escrow state to be LOCKED.
     * @param obligationId Unique identifier for the obligation
     */
    function release(bytes32 obligationId) external;

    /**
     * @notice Refund escrowed funds to the payer (R9.4)
     * @dev Only callable by RAILS_SETTLER_ROLE. Requires escrow state to be LOCKED.
     * @param obligationId Unique identifier for the obligation
     */
    function refund(bytes32 obligationId) external;

    /**
     * @notice Get escrow details for a specific obligation
     * @param obligationId Unique identifier for the obligation
     * @return escrow The escrow data structure
     */
    function getEscrow(bytes32 obligationId) external view returns (Escrow memory escrow);
}
