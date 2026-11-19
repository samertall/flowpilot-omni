// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";

/// @title OmniRelay - authenticated Lasna event subscription and cross-chain dispatch.
/// @dev Omni API (not legacy RVM). Deployed once, destination set once after vault deployment.
contract OmniRelay is AbstractReactive {
    error OnlyOwner();
    error InvalidDestination();
    error AlreadyConfigured();

    uint256 public constant PAYMENT_TOPIC = uint256(keccak256("PaymentMade(bytes32,address,address,uint256)"));
    uint64 public constant CALLBACK_GAS_LIMIT = 750_000;
    uint256 public immutable originChainId;
    uint256 public immutable destinationChainId;
    address public immutable originContract;
    address public immutable owner;
    address public destination;
    mapping(bytes32 => bool) public processed;

    event DestinationConfigured(address indexed destination);
    event RelayRequested(bytes32 indexed ruleId, bytes32 indexed proofId, address payer, address merchant, uint256 amount);

    constructor(uint256 originChainId_, address originContract_, uint256 destinationChainId_) payable {
        if (originChainId_ == 0 || destinationChainId_ == 0 || originContract_ == address(0)) {
            revert InvalidDestination();
        }
        owner = msg.sender;
        originChainId = originChainId_;
        destinationChainId = destinationChainId_;
        originContract = originContract_;
        SYSTEM.subscribe(originChainId_, originContract_, PAYMENT_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function setDestination(address destination_) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (destination != address(0)) revert AlreadyConfigured();
        if (destination_ == address(0)) revert InvalidDestination();
        destination = destination_;
        emit DestinationConfigured(destination_);
    }

    /// @inheritdoc IReactive
    function react(LogRecord memory log_) external onlySystem {
        // Invalid / unrelated logs must be ignored, not reverted: reactive gas is metered.
        if (destination == address(0) || log_.chainId != originChainId ||
            log_.contractAddress != originContract || log_.topic0 != PAYMENT_TOPIC ||
            log_.opCode != 4 || log_.data.length != 32) return;

        bytes32 ruleId = bytes32(log_.topic1);
        address payer = address(uint160(log_.topic2));
        address merchant = address(uint160(log_.topic3));
        uint256 amount = abi.decode(log_.data, (uint256));
        if (ruleId == bytes32(0) || payer == address(0) || merchant == address(0) || amount == 0) return;

        bytes32 proofId = keccak256(abi.encode(log_.chainId, log_.contractAddress, log_.txHash, log_.logIndex));
        if (processed[proofId]) return;
        processed[proofId] = true;

        // First argument must be placeholder address: Omni's callback proxy injects THIS reactive address.
        bytes memory payload = abi.encodeWithSignature(
            "executePayout(address,bytes32,address,address,uint256,bytes32)",
            address(0), ruleId, payer, merchant, amount, proofId
        );
        SYSTEM.requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0({
            chainId: destinationChainId,
            recipient: destination,
            gasLimit: CALLBACK_GAS_LIMIT,
            payload: payload
        }));
        emit RelayRequested(ruleId, proofId, payer, merchant, amount);
    }

    function coverDebt() external { _coverDebt(); }
}
