// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract InvalidFixture {
    function broken( external returns (uint256) {
        return 1;
    }
}
