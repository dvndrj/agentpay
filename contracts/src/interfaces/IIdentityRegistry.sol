// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title IIdentityRegistry
 * @notice Interface for the Identity Registry contract (ERC-8004 over ERC-721).
 * @dev Issues ERC-721 handles representing persistent agent identities on Base L2.
 *      Requirements: R1
 */
interface IIdentityRegistry {
    /// @notice Emitted when a new agent handle is minted
    /// @param handle The token ID (handle identifier)
    /// @param smartAccount The smart account address bound to this handle
    /// @param metadataHash Hash of the agent metadata
    event HandleMinted(
        uint256 indexed handle,
        address indexed smartAccount,
        bytes32 metadataHash
    );

    /// @notice Emitted when a handle is transferred to a new smart account
    /// @param handle The token ID (handle identifier)
    /// @param from Previous owner address
    /// @param to New owner address
    event HandleTransferred(
        uint256 indexed handle,
        address indexed from,
        address indexed to
    );

    /// @notice Emitted when a handle is revoked
    /// @param handle The token ID (handle identifier)
    /// @param smartAccount The smart account address that was revoked
    event HandleRevoked(
        uint256 indexed handle,
        address indexed smartAccount
    );

    /**
     * @notice Mint a new agent handle (ERC-721 token) for a smart account
     * @dev Conforms to ERC-8004 specification over ERC-721
     * @param smartAccount Address of the smart account to bind to this handle
     * @param metadataHash Hash of the agent metadata
     * @return handle The token ID (handle identifier) that was minted
     */
    function mintHandle(
        address smartAccount,
        bytes32 metadataHash
    ) external returns (uint256 handle);

    /**
     * @notice Get the smart account address associated with a handle
     * @param handle The token ID (handle identifier)
     * @return smartAccount The bound smart account address
     */
    function getSmartAccount(uint256 handle) external view returns (address smartAccount);

    /**
     * @notice Get the handle associated with a smart account address
     * @param smartAccount The smart account address
     * @return handle The token ID (handle identifier), returns 0 if not registered
     */
    function getHandle(address smartAccount) external view returns (uint256 handle);

    /**
     * @notice Check if a smart account has been registered
     * @param smartAccount The smart account address
     * @return registered True if the smart account has a handle
     */
    function isRegistered(address smartAccount) external view returns (bool registered);

    /**
     * @notice Revoke a handle (burns the token)
     * @param handle The token ID (handle identifier) to revoke
     */
    function revokeHandle(uint256 handle) external;
}
