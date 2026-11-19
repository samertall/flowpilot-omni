// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/Test.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {PaymentGate} from "../src/PaymentGate.sol";
import {OmniRelay} from "../src/OmniRelay.sol";
import {PayoutVault} from "../src/PayoutVault.sol";

/// @dev Local system emulator. The real Lasna SYSTEM injects the relay address on callback delivery.
contract MockOmniSystem {
    uint256 public lastChainId;
    address public lastRecipient;
    uint64 public lastGasLimit;
    bytes public lastPayload;
    uint256 public requestCount;
    uint256 public subscriptionCount;

    function subscribe(uint256, address, uint256, uint256, uint256, uint256) external {
        subscriptionCount++;
    }
    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory c) external {
        lastChainId = c.chainId;
        lastRecipient = c.recipient;
        lastGasLimit = c.gasLimit;
        lastPayload = c.payload;
        requestCount++;
    }
}

contract FlowPilotTest is Test {
    address constant SYSTEM_ADDRESS = 0x8888888888888888888888888888888888888888;
    address constant PROXY = address(0x1234);
    uint256 constant BASE = 84532;
    uint256 constant UNI = 1301;
    uint256 constant PAYOUT = 25_000_000;
    uint256 constant MIN_PAYMENT = 0.01 ether;
    bytes32 constant RULE = keccak256("flowpilot-merchant-invoice-001");
    address payable merchant = payable(address(0xBEEF));
    address beneficiary = address(0xC0FFEE);

    MockUSD token;
    PaymentGate gate;
    OmniRelay relay;
    PayoutVault vault;
    MockOmniSystem system;

    function setUp() public {
        system = new MockOmniSystem();
        vm.etch(SYSTEM_ADDRESS, address(system).code);
        system = MockOmniSystem(SYSTEM_ADDRESS);
        token = new MockUSD();
        token.faucet();
        gate = new PaymentGate();
        relay = new OmniRelay(BASE, address(gate), UNI);
        vault = new PayoutVault(address(token), IPayable(payable(PROXY)), address(relay));
        relay.setDestination(address(vault));
        token.approve(address(vault), PAYOUT);
        vault.createRule(RULE, merchant, beneficiary, PAYOUT, MIN_PAYMENT, uint64(block.timestamp + 1 days));
        vm.deal(address(this), 5 ether);
    }

    function _logRecord(uint256 amount, address payee, bytes32 ruleId) internal view returns (IReactive.LogRecord memory r) {
        r.chainId = BASE;
        r.contractAddress = address(gate);
        r.topic0 = relay.PAYMENT_TOPIC();
        r.topic1 = uint256(ruleId);
        r.topic2 = uint256(uint160(address(this)));
        r.topic3 = uint256(uint160(payee));
        r.data = abi.encode(amount);
        r.opCode = 4;
        r.txHash = uint256(keccak256("base-transaction-1"));
        r.logIndex = 0;
    }

    function _react(IReactive.LogRecord memory r) internal {
        vm.prank(SYSTEM_ADDRESS);
        relay.react(r);
    }

    function _deliver(IReactive.LogRecord memory r) internal {
        bytes32 proof = keccak256(abi.encode(r.chainId, r.contractAddress, r.txHash, r.logIndex));
        vm.prank(PROXY);
        vault.executePayout(address(relay), bytes32(r.topic1), address(uint160(r.topic2)),
            address(uint160(r.topic3)), abi.decode(r.data, (uint256)), proof);
    }

    function testCompleteOriginToCallbackSimulation() public {
        uint256 merchantBefore = merchant.balance;
        vm.recordLogs();
        gate.pay{value: MIN_PAYMENT}(RULE, merchant);
        Vm.Log[] memory entries = vm.getRecordedLogs();
        assertEq(entries.length, 1);
        assertEq(merchant.balance - merchantBefore, MIN_PAYMENT);
        assertEq(entries[0].topics.length, 4);

        IReactive.LogRecord memory r = _logRecord(MIN_PAYMENT, merchant, RULE);
        r.topic0 = uint256(entries[0].topics[0]);
        r.topic1 = uint256(entries[0].topics[1]);
        r.topic2 = uint256(entries[0].topics[2]);
        r.topic3 = uint256(entries[0].topics[3]);
        r.data = entries[0].data;
        _react(r);
        assertEq(system.lastChainId(), UNI);
        assertEq(system.lastRecipient(), address(vault));
        assertEq(system.lastGasLimit(), relay.CALLBACK_GAS_LIMIT());
        assertEq(system.requestCount(), 1);
        bytes32 proof = keccak256(abi.encode(r.chainId, r.contractAddress, r.txHash, r.logIndex));
        assertEq(system.lastPayload(), abi.encodeWithSelector(
            PayoutVault.executePayout.selector, address(0), RULE, address(this), merchant, MIN_PAYMENT, proof
        ));

        _deliver(r);
        assertEq(token.balanceOf(beneficiary), PAYOUT);
        (,,,,,,uint8 state) = vault.rules(RULE);
        assertEq(state, vault.PAID());
    }

    function testDuplicateOriginEventIgnored() public {
        IReactive.LogRecord memory r = _logRecord(MIN_PAYMENT, merchant, RULE);
        _react(r);
        _react(r);
        assertEq(system.requestCount(), 1);
    }

    function testIgnoresForgedOriginAddress() public {
        IReactive.LogRecord memory r = _logRecord(MIN_PAYMENT, merchant, RULE);
        r.contractAddress = address(0x5555);
        _react(r);
        assertEq(system.requestCount(), 0);
    }

    function testOnlySystemCanInvokeReact() public {
        vm.expectRevert();
        relay.react(_logRecord(MIN_PAYMENT, merchant, RULE));
    }

    function testOnlyProxyCanCallVault() public {
        vm.expectRevert();
        vault.executePayout(address(relay), RULE, address(this), merchant, MIN_PAYMENT, keccak256("x"));
    }

    function testOnlyAuthenticatedReactiveCanCallVault() public {
        vm.expectRevert();
        vm.prank(PROXY);
        vault.executePayout(address(0xDEAD), RULE, address(this), merchant, MIN_PAYMENT, keccak256("x"));
    }

    function testWrongMerchantRejected() public {
        vm.expectRevert();
        vm.prank(PROXY);
        vault.executePayout(address(relay), RULE, address(this), address(0xA), MIN_PAYMENT, keccak256("x"));
    }

    function testBelowThresholdRejected() public {
        vm.expectRevert();
        vm.prank(PROXY);
        vault.executePayout(address(relay), RULE, address(this), merchant, MIN_PAYMENT - 1, keccak256("x"));
    }

    function testPayoutCannotBeReplayed() public {
        IReactive.LogRecord memory r = _logRecord(MIN_PAYMENT, merchant, RULE);
        _deliver(r);
        vm.expectRevert();
        _deliver(r);
    }

    function testRuleCannotBeRefundedEarly() public {
        vm.expectRevert();
        vault.refundExpired(RULE);
    }

    function testSponsorRefundAfterExpiryAndGrace() public {
        uint256 before = token.balanceOf(address(this));
        vm.warp(block.timestamp + 1 days + 1 hours + 1);
        vault.refundExpired(RULE);
        assertEq(token.balanceOf(address(this)), before + PAYOUT);
    }

    function testNoOneCanResetDestination() public {
        vm.expectRevert();
        relay.setDestination(address(0x5555));
    }

    function testSubscriptionRegisteredOnDeploy() public {
        assertEq(system.subscriptionCount(), 1);
    }

    function testIgnoresWrongSourceChain() public {
        IReactive.LogRecord memory r = _logRecord(MIN_PAYMENT, merchant, RULE);
        r.chainId = 1;
        _react(r);
        assertEq(system.requestCount(), 0);
    }

    function testIgnoresWrongTopicCount() public {
        IReactive.LogRecord memory r = _logRecord(MIN_PAYMENT, merchant, RULE);
        r.opCode = 3;
        _react(r);
        assertEq(system.requestCount(), 0);
    }

    function testRejectsCallbackAfterRefund() public {
        IReactive.LogRecord memory r = _logRecord(MIN_PAYMENT, merchant, RULE);
        vm.warp(block.timestamp + 1 days + 1 hours + 1);
        vault.refundExpired(RULE);
        vm.expectRevert();
        _deliver(r);
        (,,,,,,uint8 state) = vault.rules(RULE);
        assertEq(state, vault.REFUNDED());
    }

    function testIndependentOriginLogProofsCannotDoublePay() public {
        IReactive.LogRecord memory r = _logRecord(MIN_PAYMENT, merchant, RULE);
        _react(r);
        _deliver(r);
        assertEq(token.balanceOf(beneficiary), PAYOUT);
        r.txHash = uint256(keccak256("base-transaction-2"));
        _react(r);
        assertEq(system.requestCount(), 2);
        vm.expectRevert();
        _deliver(r);
        assertEq(token.balanceOf(beneficiary), PAYOUT);
    }

    function testCannotCreateSameRuleTwice() public {
        token.approve(address(vault), PAYOUT);
        vm.expectRevert();
        vault.createRule(RULE, merchant, beneficiary, PAYOUT, MIN_PAYMENT, uint64(block.timestamp + 1 days));
    }

}
