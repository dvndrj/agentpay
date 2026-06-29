// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IIdentityRegistry.sol";

/**
 * @title IdentityRegistry
 * @notice Identity Registry contract implementing ERC-8004 over ERC-721.
 * @dev Issues ERC-721 handles representing persistent agent identities on Base L2.
 *      Maintains bidirectional mapping between smart accounts and handles.
 *      Idempotent registration: duplicate registration returns existing handle.
 *      Requirements: R1.1, R1.3, R1.5
 */
contract IdentityRegistry is ERC721, AccessControl, IIdentityRegistry {
    /// @notice Role for administrators who can revoke handles
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice Counter for generating unique token IDs
    uint256 private _nextTokenId;

    /// @notice Maps smart account address to handle (token ID)
    /// @dev Returns 0 if smart account is not registered
    mapping(address => uint256) private _accountToHandle;

    /// @notice Maps handle (token ID) to smart account address
    mapping(uint256 => address) private _handleToAccount;

    /// @notice Maps handle (token ID) to metadata hash
    mapping(uint256 => bytes32) private _handleToMetadataHash;

    /**
     * @notice Constructor initializes the ERC-721 token
     * @dev Sets up AccessControl with DEFAULT_ADMIN_ROLE and ADMIN_ROLE for deployer
     */
    constructor() ERC721("AgentPay Identity", "APID") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        // Token IDs start at 1 (0 is reserved to indicate "not registered")
        _nextTokenId = 1;
    }

    /**
     * @notice Mint a new agent handle (ERC-721 token) for a smart account
     * @dev Idempotent: if smartAccount already has a handle, returns existing handle
     *      Conforms to ERC-8004 specification over ERC-721
     * @param smartAccount Address of the smart account to bind to this handle
     * @param metadataHash Hash of the agent metadata
     * @return handle The token ID (handle identifier) that was minted or already exists
     */
    function mintHandle(
        address smartAccount,
        bytes32 metadataHash
    ) external returns (uint256 handle) {
        require(smartAccount != address(0), "IdentityRegistry: zero address");

        // Check if smart account already has a handle (idempotent registration)
        uint256 existingHandle = _accountToHandle[smartAccount];
        if (existingHandle != 0) {
            // Smart account is already registered, return existing handle
            return existingHandle;
        }

        // Mint new handle
        handle = _nextTokenId;
        _nextTokenId++;

        // Mint the ERC-721 token to the smart account
        _safeMint(smartAccount, handle);

        // Update bidirectional mappings
        _accountToHandle[smartAccount] = handle;
        _handleToAccount[handle] = smartAccount;
        _handleToMetadataHash[handle] = metadataHash;

        emit HandleMinted(handle, smartAccount, metadataHash);

        return handle;
    }

    /**
     * @notice Transfer a handle to a new smart account
     * @dev Updates the accountToHandle index and emits HandleTransferred
     *      Only the current owner can initiate the transfer
     * @param tokenId The token ID (handle identifier) to transfer
     * @param newSmartAccount The new smart account address
     */
    function transferHandle(uint256 tokenId, address newSmartAccount) external {
        require(newSmartAccount != address(0), "IdentityRegistry: zero address");
        require(_ownerOf(tokenId) != address(0), "IdentityRegistry: token does not exist");
        
        address currentOwner = ownerOf(tokenId);
        require(
            msg.sender == currentOwner,
            "IdentityRegistry: caller is not the owner"
        );

        // Check if new smart account already has a handle
        require(
            _accountToHandle[newSmartAccount] == 0,
            "IdentityRegistry: new account already registered"
        );

        // Clear old mapping
        delete _accountToHandle[currentOwner];

        // Update mappings to new account
        _accountToHandle[newSmartAccount] = tokenId;
        _handleToAccount[tokenId] = newSmartAccount;

        // Transfer the ERC-721 token
        _transfer(currentOwner, newSmartAccount, tokenId);

        emit HandleTransferred(tokenId, currentOwner, newSmartAccount);
    }

    /**
     * @notice Get the smart account address associated with a handle
     * @param handle The token ID (handle identifier)
     * @return smartAccount The bound smart account address
     */
    function getSmartAccount(uint256 handle) external view returns (address smartAccount) {
        smartAccount = _handleToAccount[handle];
        require(smartAccount != address(0), "IdentityRegistry: handle does not exist");
        return smartAccount;
    }

    /**
     * @notice Get the handle associated with a smart account address
     * @param smartAccount The smart account address
     * @return handle The token ID (handle identifier), returns 0 if not registered
     */
    function getHandle(address smartAccount) external view returns (uint256 handle) {
        return _accountToHandle[smartAccount];
    }

    /**
     * @notice Check if a smart account has been registered
     * @param smartAccount The smart account address
     * @return registered True if the smart account has a handle
     */
    function isRegistered(address smartAccount) external view returns (bool registered) {
        return _accountToHandle[smartAccount] != 0;
    }

    /**
     * @notice Revoke a handle (burns the token)
     * @dev Only callable by ADMIN_ROLE
     * @param handle The token ID (handle identifier) to revoke
     */
    function revokeHandle(uint256 handle) external onlyRole(ADMIN_ROLE) {
        require(_ownerOf(handle) != address(0), "IdentityRegistry: token does not exist");

        address smartAccount = _handleToAccount[handle];

        // Clear all mappings
        delete _accountToHandle[smartAccount];
        delete _handleToAccount[handle];
        delete _handleToMetadataHash[handle];

        // Burn the token
        _burn(handle);

        emit HandleRevoked(handle, smartAccount);
    }

    /**
     * @notice Get the metadata hash for a handle
     * @param handle The token ID (handle identifier)
     * @return metadataHash The metadata hash associated with this handle
     */
    function getMetadataHash(uint256 handle) external view returns (bytes32 metadataHash) {
        require(_ownerOf(handle) != address(0), "IdentityRegistry: token does not exist");
        return _handleToMetadataHash[handle];
    }

    /**
     * @notice Override supportsInterface to support both ERC721 and AccessControl
     * @param interfaceId The interface identifier
     * @return bool True if the interface is supported
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
