# P3 status (child report routing, batches 17 and 18)

## Batch report (2026-11-21, implementation done, uncommitted)

- Router: a known child whose verified parent is inactive now gets its report queued in the durable
  parent inbox. Result: `{ delivered: false, queued: true, receiptId }`. Unknown caller stays
  `unattributed-caller`.
- Schema: optional `originKind` (`agent` | `session`) on the parent envelope record and body.
- Drainer: session envelopes are sent as `ptah-session:{child}`. The child owner is rechecked before
  send. A changed owner cancels the envelope and keeps it visible. An unknown owner stays pending.
- Stdio `agent_report`: lane id first, else the launcher session id as `childSessionId`.
- Formatter: `Report Queued` heading and local refusal sentences.
- Checks: lint and typecheck pass for `cli-agent-runtime` and `vscode-lm-tools`. Tests in
  `vscode-lm-tools` pass. Tests in `cli-agent-runtime` pass except
  `agent-process-manager.account-binding.spec.ts` ("stays ambient when the stored lane selection is
  the default route"). That test also fails on a clean HEAD, so it is not caused by P3.
- Known limitation: a report queued under a predecessor parent is not re-keyed when that parent later
  hands off. It waits, or is cancelled as owner-changed if the predecessor returns.
- Next: Codex review, fix round, full gate, commit, push, PR.

The first `ptah_agent_report` call to the parent was refused with `parent-session-not-active`
(parent not live), so this file holds the same text.

## Review round 2 outcome (2026-11-22)

Codex review of HEAD `bfb755ea1`: REVISE 5/10 (`code-logic-review-p3-r2.md`). Fix round:

- Fixed: defect 2 (failed release strands a claim: `unsentClaims` retry), 3 (retry floor after a failed
  write), 4 (a partial lineage read is `unverified`, held and never cancelled before 24 hours),
  7 (a saved receipt outranks a live parent), 8 (the child record is read again inside the per-child
  chain), 9 (receipt id and state on retained terminal refusals).
- Open, documented limits (not fixed in P3):
  - Defect 1: a handoff continuation that reparents the child in the microtask gap between the final
    owner check and the adapter call, while the predecessor stays live, can still send to the
    predecessor. A binding-revision fence needs a registry change outside P3 scope.
  - Defect 5: offline routing and drain can disagree for a secondary SDK alias after a forward edge.
    The drainer holds or cancels as `owner-changed`; the report is not sent to a wrong parent.
  - Defect 6: a repeat outside the recent-report window after the effective recipient changed, or after
    the same owner gains its SDK alias, can create a second queued copy. No wrong-parent delivery.

## PR report (2026-11-22)

PR https://github.com/Hive-Academy/PtahCode/pull/1463 is open (head 7ca90a4e1). Local gate: lint and
typecheck pass, vscode-lm-tools tests pass, cli-agent-runtime tests pass except the pre-existing
account-binding spec. CI was pending at the time of this note. Parent report was refused with
`parent-session-not-active`, so this file holds it. Open limits: defects 1, 5, 6 above.

## PR review round (2026-11-22)

PtahCode review of 7ca90a4e1: two major findings, both fixed in the next commit. The live path waits for
the store restore before it reads a saved receipt (refuses with `delivery-failed` if the restore
fails). The drainer follows lineage from every recorded owner alias, which closes the drain side of
defect 5. CI: only `mcp-bench` `host-launcher.spec.ts` (guard mode, 71 s) failed; it is outside P3.

## CodeRabbit round (2026-11-22, head 5e2c18131)

Fixed: saved receipt lookup now runs before the burst and duplicate bounds (a repeat returns its
receipt); the claim (`sending`, same `attemptId`, same recipient) is checked synchronously before the
adapter call; a failed claim write sets the retry floor; the `parent-session-not-active` sentence also
covers an owner change.

Not fixed in P3 (design limits, documented):
- The child registry is in memory, so after a host restart a queued report stays `unknown` and waits
  (up to 24 hours) until the child binding exists again. Persisting the registry is outside P3.
- A claim whose release write fails and whose host then restarts becomes `outcome-unknown` on restore
  (the safe side: no duplicate send). Distinguishing a pre-dispatch claim needs a store schema change.
- `markDelivered` can still overwrite a `cancelled` row when a cancel lands during the adapter call.
