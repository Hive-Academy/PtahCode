# Code logic re-review, batch 1

Paths are under `libs/backend/agent-sdk/src/lib/helpers/compaction/` unless noted. M = `subagent-budget-monitor.ts`.

**Verdict: APPROVED. Score 8/10.** F1-F7 are fixed or fixed in substance. The new findings are Medium or Low and none blocks the batch. N1 and N2 are recommended follow-ups.

## Per-finding status

| # | Status | Evidence |
| --- | --- | --- |
| F1 deliverables never permitted at runtime | Fixed | `subagent-deliverables.ts:9-24` parses the `Deliverable(s):` marker. `subagent-deliverables.ts:30-39` records successful pre-gate Write/Edit paths. M:1364 stores the declarations on the task. M:669-670 passes the union of recorded and declared paths to `warn`. `subagent-notes-gate.ts:33-35` re-checks containment and dedupes by `pathKey`. Completion needs only the notes write (`subagent-notes-gate.ts:64`). The handoff message lists the permitted paths (`subagent-handoff-message.ts:60,138`; M:1753). |
| F2 `count()` overwrites stopCause | Fixed | `subagent-request-accounting.ts:45-46` keeps the cause while a warning or stop is active. A new safety cause overrides only a notes-kind cause. The spec at `subagent-budget-monitor.spec.ts:3578` covers a message arriving during `stopWarnedAgent`. |
| F3 throwing `notesGate.warn` leaves no notes turn | Fixed, with a caveat (see N3) | M:668-675 catches the error, clears `warnedAgentId` and returns. The next message retries. The log carries only the error name. The spec is at line 3567. |
| F4 Read of a deliverable denied | Fixed | `subagent-notes-gate.ts:72-73` allows Read, Write and Edit on every permitted path. |
| F5 forced stop cuts the final message | Fixed | The wording at `subagent-notes-gate.ts:74` and `subagent-handoff-message.ts:61` says: deliverables optional, notes last, turn ends after the notes write. |
| F6 skipped stop logged at `info` | Fixed | M:733 now logs at `warn`. |
| F7 optional `recordNotesToolResult` | Fixed | `subagent-budget-hooks.ts:25` warns when the recorder is missing. The recorder stays optional by design, so hosts that omit it rely on the watchdog. |

## Checks on the revision

- **Containment (`subagent-notes-path.ts:7-30`).** The check passes only if the path is contained both lexically and after realpath of the deepest existing ancestor.
  - `..` is rejected via `path.relative`.
  - A symlink that points outside is rejected via realpath.
  - A different drive gives an absolute relative path and is rejected.
  - Case: `path.relative` is case-insensitive on win32, and `pathKey` lowercases on win32 only.
  - No escape found.
  - Non-ENOENT fs errors (EACCES, ELOOP) are rethrown. See N4.
- **Prompt parser (`subagent-deliverables.ts:9-24`).** Only line-start markers are matched. Globs, `*?{}[]` and backticks inside the value are rejected. The list is capped at 20. It does not verify that the text is a path (see N2).
- **Record growth and leak.** Per-agent records are keyed by agent id and released or rekeyed by session (M:1054, M:1125). Rekey and release are tested. No cross-subagent leak was found. Growth is unbounded (see N1).
- **Monitor size.** `subagent-budget-monitor.ts` is 1,978 lines against 2,035 on main, so it did not grow. The largest new file is 66 lines (`subagent-request-accounting.ts`). `subagent-handoff-record.ts` is 703 lines but is unmodified, so it predates this batch.

## New findings

| Sev | Location | Finding | Suggested change |
| --- | --- | --- | --- |
| Medium (N1) | `subagent-deliverables.ts:28-38`; `subagent-handoff-message.ts:60,138` | The set of recorded paths has no cap. A subagent that edits many files grows it without limit, and the record is released only at session release, not when the subagent ends. Every path is also printed into the warning and handoff text. Because the notes workspace is the whole workspace, "permitted" can become every file the agent wrote. | Cap the set (for example 50 paths, keeping the most recent). Cap the paths printed in the messages. Release the record on `SubagentStop`. |
| Low (N2) | `subagent-deliverables.ts:15-20` | `Deliverable: a summary of findings` is accepted as the path `a summary of findings`, and so is a URL. This is harmless because the path is workspace-contained, but it adds noise to the permitted list. | Require a path-like token: no spaces unless backticked, and a file extension or a separator. |
| Low (N3) | M:671-675 | The catch reports only the error name, and it retries and logs on every message. A permanent failure gives no notes turn and one error log per message. A programmer error (TypeError) is also swallowed. | Log the error with a bounded message. Count the failures and give up after N tries, falling back to the safety stop. |
| Low (N4) | `subagent-notes-path.ts:13-14`; M:710 | A non-ENOENT fs error from `insideNotesWorkspace` propagates out of `deliverables.record` in `recordNotesToolResult`, and out of `check`. The hook caller must handle it. | Catch it in `record` and treat it as "not contained". |

## Test results

- Jest, 6 suites: monitor, notes-gate, budget-hooks, deliverables, stop-cause, and `../subagent-hook-handler.spec.ts`. **6 passed, 312 tests passed.**
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`: **exit 0**.
- I did not run eslint in this pass. The implementer reported a clean run with 2 existing warnings.
- I did not write a failing test for N1-N4. They come from reading the code.
