// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";

interface IERC20Transfer {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @title PayoutVault - independently prefunded token escrow released by genuine Omni callbacks.
/// @notice Not a bridge. Source ETH pays the merchant; destination test tokens are pre-escrowed.
contract PayoutVault is AbstractCallback {
    error InvalidRule();
    error InvalidParameters();
    error RuleAlreadyExists();
    error RuleNotActive();
    error WrongMerchant();
    error PaymentTooSmall();
    error TooEarlyToRefund();
    error TokenTransferFailed();
    error WrongTokenAmount();
    error ReentrantCall();
    error ProofAlreadyUsed();

    uint64 public constant CALLBACK_GRACE = 1 hours;
    uint8 public constant ACTIVE = 1;
    uint8 public constant PAID = 2;
    uint8 public constant REFUNDED = 3;

    struct Rule {
        address sponsor;
        address merchant;
        address beneficiary;
        uint256 payoutAmount;
        uint256 minSourcePayment;
        uint64 expiry;
        uint8 state;
    }
    IERC20Transfer public immutable token;
    mapping(bytes32 => Rule) public rules;
    mapping(bytes32 => bool) public usedProofs;
    bool private locked;

    event RuleCreated(bytes32 indexed ruleId, address indexed sponsor, address indexed beneficiary,
        address merchant, uint256 payoutAmount, uint256 minSourcePayment, uint64 expiry);
    event PayoutExecuted(bytes32 indexed ruleId, bytes32 indexed proofId, address indexed beneficiary,
        address payer, uint256 amount);
    event RuleRefunded(bytes32 indexed ruleId, address indexed sponsor, uint256 amount);

    modifier nonReentrant() {
        if (locked) revert ReentrantCall();
        locked = true;
        _;
        locked = false;
    }

    constructor(address token_, IPayable callbackProxy_, address reactiveSender_)
        payable AbstractCallback(callbackProxy_, reactiveSender_)
    {
        if (token_ == address(0) || reactiveSender_ == address(0)) revert InvalidParameters();
        token = IERC20Transfer(token_);
    }

    /// @notice Rules are created and funded directly by the sponsor's connected wallet.
    /// @dev Exact-balance checks reject fee-on-transfer tokens for escrow accounting.
    function createRule(bytes32 ruleId, address merchant, address beneficiary,
        uint256 payoutAmount, uint256 minSourcePayment, uint64 expiry)
        external nonReentrant
    {
        if (ruleId == bytes32(0)) revert InvalidRule();
        if (rules[ruleId].state != 0) revert RuleAlreadyExists();
        if (merchant == address(0) || beneficiary == address(0) || payoutAmount == 0 ||
            minSourcePayment == 0 || expiry <= block.timestamp) revert InvalidParameters();

        uint256 beforeBalance = token.balanceOf(address(this));
        _safeTransferFrom(msg.sender, address(this), payoutAmount);
        if (token.balanceOf(address(this)) - beforeBalance != payoutAmount) revert WrongTokenAmount();

        rules[ruleId] = Rule(msg.sender, merchant, beneficiary,
            payoutAmount, minSourcePayment, expiry, ACTIVE);
        emit RuleCreated(ruleId, msg.sender, beneficiary, merchant, payoutAmount, minSourcePayment, expiry);
    }

    /// @notice Omni injects `reactiveSender` into the first ABI argument.
    function executePayout(address reactiveSender, bytes32 ruleId, address payer,
        address paidMerchant, uint256 paidAmount, bytes32 proofId)
        external onlyServiceProvider onlyCallbackSender(reactiveSender) nonReentrant
    {
        Rule storage rule = rules[ruleId];
        if (rule.state != ACTIVE || block.timestamp > uint256(rule.expiry) + CALLBACK_GRACE) revert RuleNotActive();
        if (paidMerchant != rule.merchant) revert WrongMerchant();
        if (paidAmount < rule.minSourcePayment) revert PaymentTooSmall();
        if (proofId == bytes32(0) || usedProofs[proofId]) revert ProofAlreadyUsed();
        usedProofs[proofId] = true;
        rule.state = PAID;
        _safeTransfer(rule.beneficiary, rule.payoutAmount);
        emit PayoutExecuted(ruleId, proofId, rule.beneficiary, payer, rule.payoutAmount);
    }

    /// @notice Sponsor recovers untriggered funds only after expiry plus callback grace.
    function refundExpired(bytes32 ruleId) external nonReentrant {
        Rule storage rule = rules[ruleId];
        if (rule.state != ACTIVE) revert RuleNotActive();
        if (msg.sender != rule.sponsor) revert InvalidParameters();
        if (block.timestamp <= uint256(rule.expiry) + CALLBACK_GRACE) revert TooEarlyToRefund();
        rule.state = REFUNDED;
        _safeTransfer(rule.sponsor, rule.payoutAmount);
        emit RuleRefunded(ruleId, rule.sponsor, rule.payoutAmount);
    }

    function coverDebt() external { _coverDebt(); }

    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, bytes memory ret) = address(token).call(
            abi.encodeWithSelector(IERC20Transfer.transfer.selector, to, amount)
        );
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = address(token).call(
            abi.encodeWithSelector(IERC20Transfer.transferFrom.selector, from, to, amount)
        );
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenTransferFailed();
    }
}
