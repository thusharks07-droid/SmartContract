// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract TokenLedger {
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowance;

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(balances[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        balances[from] -= amount;
        balances[to] += amount;
        allowance[from][msg.sender] -= amount;
    }
}
