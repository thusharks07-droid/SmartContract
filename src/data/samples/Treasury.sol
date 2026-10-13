// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract Treasury {
    address public admin;
    mapping(address => uint256) public credits;

    constructor() { admin = msg.sender; }

    function setAdmin(address nextAdmin) external {
        admin = nextAdmin;
    }

    function distribute(address payable recipient, uint256 amount) external {
        require(credits[msg.sender] >= amount, "credit");
        credits[msg.sender] -= amount;
        recipient.transfer(amount);
    }

    function recordCredit(address account, uint256 amount) external {
        credits[account] += amount;
    }
}
