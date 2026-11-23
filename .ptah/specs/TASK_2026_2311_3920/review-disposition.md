# Review disposition (code-logic-review.md)

Fixed in the second commit: S1 (hold when reroute does not apply), S2 (unique-gate fallback for a session
id the monitor does not know), S3 (owner signature before the claim), M1 (restore body on failed reroute),
M5 (warn on an unmatched tool-less start), M6 (withdraw notice only when the gate ended).

Not changed:
- M2 `body-unavailable` stays `outcome-unknown`: a missing body cannot be sent again, and retry needs it.
- M3 `everDispatched` stays set at claim (conservative duplicate-risk flag, unchanged contract).
- M7 rekey merge keeps the target gate: edge case of a merge of two live records, not reproducible
  without a double rekey; left for a later task.
- M8 no live path (reports are kind `report`).
- Child registry persistence: not built (needs a user decision on a new storage format).
