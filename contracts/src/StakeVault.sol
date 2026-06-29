// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IStakeVault} from "./interfaces/IStakeVault.sol";
import {Roles} from "./Roles.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title StakeVault
 * @notice Manages USDC staking and slashing for the AgentPay reputation system.
 * @dev Implements IStakeVault with role-based access control for reputation settlement.
 *      Requirements: R6.3, R6.5
 */
contract StakeVault is IStakeVault, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The USDC token used for staking
    IERC20 public immutable usdc;

    /// @notice Mapping from handle to stake data
    mapping(uint256 => Stake) private stakes;

    /// @notice Mapping from handle to count of open obligations
    mapping(uint256 => uint256) public openObligationCount;

    /**
     * @notice Construct a new StakeVault
     * @param _usdc Address of the USDC token contract
     * @param _admin Address that will receive the DEFAULT_ADMIN_ROLE
     */
    constructor(address _usdc, address _admin) {
        require(_usdc != address(0), "StakeVault: zero USDC address");
        require(_admin != address(0), "StakeVault: zero admin address");

        usdc = IERC20(_usdc);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /**
     * @inheritdoc IStakeVault
     * @dev Pulls USDC from the caller via safeTransferFrom. Requires prior approval.
     */
    function stake(uint256 handle, uint256 amount) external nonReentrant {
        require(amount > 0, "StakeVault: zero amount");

        Stake storage stakeData = stakes[handle];

        // If this is the first stake, set the owner
        if (stakeData.owner == address(0)) {
            stakeData.owner = msg.sender;
        } else {
            // Only the stake owner can add more stake
            require(stakeData.owner == msg.sender, "StakeVault: not stake owner");
        }

        // Pull USDC from the caller
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Update stake amount
        stakeData.amount += amount;

        emit Staked(handle, msg.sender, amount);
    }

    /**
     * @inheritdoc IStakeVault
     * @dev Only callable by stake owner. Reverts if there are open obligations.
     */
    function withdraw(uint256 handle, uint256 amount) external nonReentrant {
        require(amount > 0, "StakeVault: zero amount");

        Stake storage stakeData = stakes[handle];

        require(stakeData.owner == msg.sender, "StakeVault: not stake owner");
        require(openObligationCount[handle] == 0, "StakeVault: open obligations exist");

        uint256 available = stakeData.amount - stakeData.lockedAmount;
        require(available >= amount, "StakeVault: insufficient available stake");

        // Update stake amount
        stakeData.amount -= amount;

        // Transfer USDC to the owner
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(handle, msg.sender, amount);
    }

    /**
     * @inheritdoc IStakeVault
     * @dev Only callable by REPUTATION_SETTLER_ROLE. Transfers slashed amount to the recipient.
     */
    function slash(
        uint256 handle,
        uint256 amount,
        address recipient
    ) external onlyRole(Roles.REPUTATION_SETTLER_ROLE) nonReentrant {
        require(amount > 0, "StakeVault: zero amount");
        require(recipient != address(0), "StakeVault: zero recipient");

        Stake storage stakeData = stakes[handle];

        require(stakeData.amount >= amount, "StakeVault: insufficient stake");

        // Decrease stake amount
        stakeData.amount -= amount;

        // If the slashed amount was from locked stake, decrease locked amount
        if (stakeData.lockedAmount > 0) {
            uint256 lockedToDecrease = amount > stakeData.lockedAmount
                ? stakeData.lockedAmount
                : amount;
            stakeData.lockedAmount -= lockedToDecrease;
        }

        // Transfer slashed USDC to the recipient
        usdc.safeTransfer(recipient, amount);

        emit Slashed(handle, amount, recipient);
    }

    /**
     * @inheritdoc IStakeVault
     * @dev Only callable by REPUTATION_SETTLER_ROLE
     */
    function lockStake(
        uint256 handle,
        uint256 amount
    ) external onlyRole(Roles.REPUTATION_SETTLER_ROLE) {
        require(amount > 0, "StakeVault: zero amount");

        Stake storage stakeData = stakes[handle];

        uint256 available = stakeData.amount - stakeData.lockedAmount;
        require(available >= amount, "StakeVault: insufficient available stake");

        stakeData.lockedAmount += amount;

        emit StakeLocked(handle, amount);
    }

    /**
     * @inheritdoc IStakeVault
     * @dev Only callable by REPUTATION_SETTER_ROLE
     */
    function unlockStake(
        uint256 handle,
        uint256 amount
    ) external onlyRole(Roles.REPUTATION_SETTLER_ROLE) {
        require(amount > 0, "StakeVault: zero amount");

        Stake storage stakeData = stakes[handle];

        require(stakeData.lockedAmount >= amount, "StakeVault: insufficient locked stake");

        stakeData.lockedAmount -= amount;

        emit StakeUnlocked(handle, amount);
    }

    /**
     * @notice Increment the count of open obligations for a handle
     * @dev Only callable by RAILS_SETTLER_ROLE. Used to track pending obligations.
     * @param handle The agent handle identifier
     */
    function incrementOpenObligations(
        uint256 handle
    ) external onlyRole(Roles.RAILS_SETTLER_ROLE) {
        openObligationCount[handle]++;
    }

    /**
     * @notice Decrement the count of open obligations for a handle
     * @dev Only callable by RAILS_SETTLER_ROLE. Used when obligations are resolved.
     * @param handle The agent handle identifier
     */
    function decrementOpenObligations(
        uint256 handle
    ) external onlyRole(Roles.RAILS_SETTLER_ROLE) {
        require(openObligationCount[handle] > 0, "StakeVault: no open obligations");
        openObligationCount[handle]--;
    }

    /**
     * @inheritdoc IStakeVault
     */
    function getStake(uint256 handle) external view returns (Stake memory) {
        return stakes[handle];
    }

    /**
     * @inheritdoc IStakeVault
     */
    function getAvailableStake(uint256 handle) external view returns (uint256) {
        Stake storage stakeData = stakes[handle];
        return stakeData.amount - stakeData.lockedAmount;
    }
}
