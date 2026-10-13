// SAMPLE CONTRACT — illustrative input for the Paste tab only.
// This source is not analyzed and does not represent a security result.
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract PasteSample {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }
}
