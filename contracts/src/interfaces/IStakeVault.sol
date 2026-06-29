// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IStakeVault
 * @notice Interface for the Stake Vault contract that holds agent reputation stakes.
 * @dev Manages USDC staking and slashing for the AgentPay reputation system on Base L2.
 *      Requirements: R6.3
 */
interface IStakeVault {
    /// @notice Stake data structure
    /// @param owner Address of the agent operator who owns the stake
    /// @param amount Amount of USDC staked
    /// @param lockedAmount Amount currently locked due to pending obligations
    struct Stake {
        address owner;
        uint256 amount;
        uint256 lockedAmount;
    }

    /// @notice Emitted when an agent stakes USDC
    /// @param handle The agent handle identifier
    /// @param owner Address of the stake owner
    /// @param amount Amount of USDC staked
    event Staked(
        uint256 indexed handle,
        address indexed owner,
        uint256 amount
    );

    /// @notice Emitted when stake is withdrawn
    /// @param handle The agent handle identifier
    /// @param owner Address of the stake owner
    /// @param amount Amount of USDC withdrawn
    event Withdrawn(
        uint256 indexed handle,
        address indexed owner,
        uint256 amount
    );

    /// @notice Emitted when stake is slashed due to a failed obligation
    /// @param handle The agent handle identifier
    /// @param amount Amount of USDC slashed
    /// @param recipient Address receiving the slashed funds (counterparty)
    event Slashed(
        uint256 indexed handle,
        uint256 amount,
        address indexed recipient
    );

    /// @notice Emitted when stake is locked for pending obligations
    /// @param handle The agent handle identifier
    /// @param amount Amount of USDC locked
    event StakeLocked(
        uint256 indexed handle,
        uint256 amount
    );

    /// @notice Emitted when stake is unlocked after obligation resolution
    /// @param handle The agent handle identifier
    /// @param amount Amount of USDC unlocked
    event StakeUnlocked(
        uint256 indexed handle,
        uint256 amount
    );

    /**
     * @notice Stake USDC for an agent handle
     * @dev Pulls USDC from the caller via safeTransferFrom. Requires prior approval.
     * @param handle The agent handle identifier
     * @param amount Amount of USDC to stake
     */
    function stake(uint256 handle, uint256 amount) external;

    /**
     * @notice Withdraw available stake for an agent handle (R6.3)
     * @dev Only callable by stake owner. Reverts if there are locked funds from pending obligations.
     * @param handle The agent handle identifier
     * @param amount Amount of USDC to withdraw
     */
    function withdraw(uint256 handle, uint256 amount) external;

    /**
     * @notice Slash stake due to a failed obligation (R6.3)
     * @dev Only callable by REPUTATION_SETTLER_ROLE. Transfers slashed amount to the recipient.
     * @param handle The agent handle identifier
     * @param amount Amount of USDC to slash
     * @param recipient Address to receive the slashed funds (counterparty)
     */
    function slash(uint256 handle, uint256 amount, address recipient) external;

    /**
     * @notice Lock a portion of stake for pending obligations
     * @dev Only callable by REPUTATION_SETTLER_ROLE
     * @param handle The agent handle identifier
     * @param amount Amount of USDC to lock
     */
    function lockStake(uint256 handle, uint256 amount) external;

    /**
     * @notice Unlock stake after obligation resolution
     * @dev Only callable by REPUTATION_SETTLER_ROLE
     * @param handle The agent handle identifier
     * @param amount Amount of USDC to unlock
     */
    function unlockStake(uint256 handle, uint256 amount) external;

    /**
     * @notice Get stake details for an agent handle
     * @param handle The agent handle identifier
     * @return stake The stake data structure
     */
    function getStake(uint256 handle) external view returns (Stake memory stake);

    /**
     * @notice Get available (unlocked) stake amount for an agent handle
     * @param handle The agent handle identifier
     * @return available The amount of USDC available for withdrawal
     */
    function getAvailableStake(uint256 handle) external view returns (uint256 available);
}
