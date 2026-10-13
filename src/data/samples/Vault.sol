// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract Vault {
    mapping(address => uint256) public balances;
    address public owner;
    bool private entered;

    constructor() { owner = msg.sender; }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "balance");
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "send failed");
        balances[msg.sender] -= amount;
    }

    function setOwner(address nextOwner) external {
        owner = nextOwner;
    }
}
