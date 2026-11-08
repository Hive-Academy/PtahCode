# Live test round 5 SDK fix report

## Root cause

- `subagent-notes-gate.ts:64` allowed only the first exact notes Write/Edit. The C3 child wrote a heading and `Task id: unknown` before the notice, so it could not update it afterward. C1/C2 left no notes.
- `subagent-handoff-files.ts:112,131` counted every existing notes file as complete and exclusive creation treated `EEXIST` as success. A stub therefore prevented the host snapshot.
- `subagent-budget-monitor.ts:893` did not publish normal-exit records before delivery. `subagent-handoff-delivery.ts:153` called a parent-message acknowledgment timeout “not read by the parent,” although the write remained queued and the record could already have reached the parent by another route.

## Fixes

- Allow repeated exact-path Write/Edit while preserving the warned-agent gate for other tools. The notice asks the child to update existing notes and includes the known Task id, including the late Task-id path.
- Treat empty or heading plus unknown-Task-id notes as stubs. Merge a redacted inferred snapshot into such a stub; preserve substantive agent prose. Missing notes still receive inferred progress.
- Publish normal-exit records before the parent delivery path; forced stops already publish before delivery. Replace the misleading acknowledgment timeout wording.

## Specs and verification

- Updated `subagent-notes-gate.spec.ts`, `subagent-handoff-files.spec.ts`, `subagent-budget-monitor.spec.ts`, and `subagent-handoff-delivery.spec.ts` for repeat edits, stub merge, real Task id, publication, and timeout wording.
- `ptah_get_diagnostics` found no errors after the final edits. An earlier scoped check saw a concurrent codex-runtime sibling error outside this lane's scope.
- Focused `npm run verify -- -t test -p agent-sdk -- '--testPathPatterns=subagent-(notes-gate|handoff-files|handoff-delivery|budget-monitor)'`: passed after corrections.
- `npm run verify -- -p agent-sdk,ptah-electron,cli-engine`: 13/13 tasks passed (lint, typecheck, tests).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no FAIL; agent-sdk remains 4 unsuppressed sites against baseline 4.

## Remaining gaps

- SDK parent-message acknowledgment does not prove the parent read a handoff. The log now states the event accurately. A live retest is needed to confirm C1/C2/C3 parent receipt and notes content. No live test was run in this lane.

## Decisions

- Stub detection uses an empty file or at most a heading and unknown Task id, based on the observed 38-byte C3 stub; other prose remains authoritative. Reversible.
- Normal-exit records publish immediately before delivery, matching the forced-stop path and the round-4 review recommendation. Reversible.

