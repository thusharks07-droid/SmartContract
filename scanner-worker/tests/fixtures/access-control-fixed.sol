// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract AccessControlFixedFixture {
    address payable public beneficiary;
    address public immutable owner;

    constructor() payable {
        owner = msg.sender;
        beneficiary = payable(msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "owner only");
        _;
    }

    function destroy() external onlyOwner {
        selfdestruct(beneficiary);
    }
}
