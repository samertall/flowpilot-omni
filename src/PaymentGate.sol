// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title PaymentGate - sends actual Base Sepolia ETH payments and emits a canonical receipt.
/// @notice The event is observed by Reactive Omni. No funds are custodied by this contract.
contract PaymentGate {
    error InvalidRule();
    error InvalidMerchant();
    error ZeroPayment();
    error TransferFailed();
    error ReentrantCall();

    event PaymentMade(
        bytes32 indexed ruleId,
        address indexed payer,
        address indexed merchant,
        uint256 amount
    );

    bool private locked;

    function pay(bytes32 ruleId, address payable merchant) external payable {
        if (locked) revert ReentrantCall();
        if (ruleId == bytes32(0)) revert InvalidRule();
        if (merchant == address(0)) revert InvalidMerchant();
        if (msg.value == 0) revert ZeroPayment();

        locked = true;
        (bool ok,) = merchant.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit PaymentMade(ruleId, msg.sender, merchant, msg.value);
        locked = false;
    }
}
