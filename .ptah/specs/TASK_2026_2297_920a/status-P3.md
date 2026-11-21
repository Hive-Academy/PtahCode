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
