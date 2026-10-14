// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract AccessControlVulnerableFixture {
    address payable public beneficiary;

    constructor() payable {
        beneficiary = payable(msg.sender);
    }

    function destroy() external {
        selfdestruct(beneficiary);
    }
}
