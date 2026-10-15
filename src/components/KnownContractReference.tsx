import { matchKnownContractReference } from '../services/knownContractReference'

export function KnownContractReference({ source }: { source: string }) {
  const match = matchKnownContractReference(source)
  if (!match) return null

  return <section className="panel known-contract-reference" aria-labelledby="known-reference-title">
    <div className="section-heading">
      <div><p className="eyebrow">EXACT-SOURCE REFERENCE</p><h2 id="known-reference-title">VulnerableBank · reentrancy</h2></div>
      <span className="known-contract-reference__badge">High potential impact</span>
    </div>
    <p className="known-contract-reference__notice">Predefined reference for this exact source. This panel is hardcoded and is separate from Slither findings and Gemini output; it does not mean an analyzer ran successfully.</p>
    <p><strong>Issue:</strong> <code>withdraw()</code> sends <code>bal</code> to the caller before clearing <code>balances[msg.sender]</code>. A contract recipient can call <code>withdraw()</code> again during its receive/fallback callback while the recorded balance is still non-zero.</p>
    <dl className="known-contract-reference__locations"><div><dt>External value transfer</dt><dd><code>Source line {match.withdrawCallLine}</code></dd></div><div><dt>Balance cleared afterward</dt><dd><code>Source line {match.balanceResetLine}</code></dd></div></dl>
    <p><strong>Potential impact:</strong> Repeated withdrawals can drain funds belonging to other depositors if the bank holds enough ether and the caller is a reentrant contract. The practical impact depends on the deployed balance and call context.</p>
    <div className="known-contract-reference__fix"><strong>Recommended fix: checks-effects-interactions</strong><pre><code>{`uint256 bal = balances[msg.sender];
require(bal > 0, "Insufficient balance");
balances[msg.sender] = 0;
(bool success, ) = msg.sender.call{value: bal}("");
require(success, "Transfer failed");`}</code></pre><p>Because a failed <code>require</code> reverts the whole transaction, the earlier balance update also rolls back. A reentrancy guard can provide additional defense, but should not replace the state-before-call ordering.</p></div>
  </section>
}
