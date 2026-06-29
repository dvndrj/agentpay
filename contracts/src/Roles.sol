// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title Roles
 * @notice Defines role constants used across AgentPay vault contracts.
 * @dev These roles are used with OpenZeppelin's AccessControl for authorization.
 *      Requirements: R4.2, R6.3, R9.3, R9.4
 */
library Roles {
    /**
     * @notice Role for the RAILS Ledger service to settle escrow operations
     * @dev Grants permission to call release() and refund() on EscrowVault
     *      Used by RAILS_Ledger to execute FINAL and REVERSED state transitions (R9.3, R9.4)
     */
    bytes32 public constant RAILS_SETTLER_ROLE = keccak256("RAILS_SETTLER_ROLE");

    /**
     * @notice Role for the Reputation Service to manage stake operations
     * @dev Grants permission to call slash(), lockStake(), and unlockStake() on StakeVault
     *      Used by Reputation_Service to slash stakes on failed obligations (R6.3)
     */
    bytes32 public constant REPUTATION_SETTLER_ROLE = keccak256("REPUTATION_SETTLER_ROLE");
}
