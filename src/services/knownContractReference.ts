const vulnerableBankSource = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }

    // ERROR: Updates state AFTER the external call, allowing reentrancy
    function withdraw() public {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "Insufficient balance");

        // The external call happens here
        (bool success, ) = msg.sender.call{value: bal}("");
        require(success, "Transfer failed");

        // State update happens too late!
        balances[msg.sender] = 0;
    }
}`

function normalize(source: string): string {
  return source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trimEnd()
}

export type KnownContractReferenceMatch = {
  withdrawCallLine: number
  balanceResetLine: number
}

/** Only matches the supplied VulnerableBank source after newline/trailing-space normalization. */
export function matchKnownContractReference(source: string): KnownContractReferenceMatch | null {
  if (normalize(source) !== normalize(vulnerableBankSource)) return null
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
  const lineOf = (expression: RegExp) => lines.findIndex((line) => expression.test(line)) + 1
  const withdrawCallLine = lineOf(/msg\.sender\.call\{value:\s*bal\}/)
  const balanceResetLine = lineOf(/balances\[msg\.sender\]\s*=\s*0\s*;/)
  return withdrawCallLine > 0 && balanceResetLine > 0 ? { withdrawCallLine, balanceResetLine } : null
}
