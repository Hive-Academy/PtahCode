# Code Logic Review — `TASK_2026_2330_5c6e`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 7/10 |
| Assessment | REVISE |
| Blocking issues | 0 |
| Serious issues | 1 |
| Moderate issues | 0 |
| Failure modes found | 1 |

The main-chat fix is sound. The live-lane fix is sound. Cold lane resume is incomplete end to end. The score reflects one required path that still sends `/compact` to the model instead of compacting. No foundation-wide defect was found.

## Root cause

The unsupported-command cause is real. The old router sent every `new-query` command through `executeSlashCommand`, while Codex rejects every command except `/compact` (`codex-chat-session-controls.ts:178-183`). The new branch preserves the thread and returns a typed refusal (`chat-slash-command-router.service.ts:402-422`).

The streamless-session explanation needs one qualification. Electron already had a native liveness check in `hasLiveSessionStream` (`chat-session.service.ts:3290-3299`). The new metadata fallback protects sessions when that check is absent or returns false (`chat-session.service.ts:3707-3712`). It prevents the old teardown from interrupting a busy Codex thread.

## Five logic questions

### 1. How does this fail silently?

A stopped Codex lane without a cached catalog sends `/compact` as an ordinary formatted prompt. No native compaction occurs. Raw delivery returns false when no command list is known (`agent-message-dispatcher.ts:155-169`). The adapter only compacts when the resumed task starts with `/compact` (`codex-app-server-lane.adapter.ts:912-915`).

### 2. What user action produces unexpected behaviour?

Open a restored or released Codex lane after an application restart. Do not open its command options while it is live. Send `/compact`. The dispatcher adds the Ptah message header and resumes with a model turn (`agent-message-dispatcher.ts:114-120`). The command does not reach `runCompact`.

### 3. What input data produces a wrong answer?

`/compact` with `advertisedCommands` returning `undefined` produces the wrong delivery form. A stopped-lane view without a cache explicitly returns `commands: []` (`agent-message-coordinator.service.ts:130-144`). The lookup also returns `undefined` when no live handle exists (`agent-message-coordinator.service.ts:597-602`).

### 4. What happens when a dependency fails?

Live-lane compaction resets `compacting` in `finally`, so a refusal does not block the next command (`codex-app-server-lane.adapter.ts:894-901`). Busy main-chat compaction is rejected by the adapter (`codex-chat-session-controls.ts:181-187`) and mapped to `CODEX_BUSY` (`chat-session.service.ts:1005-1009`). Runtime compaction failure keeps the existing `CODEX_RUNTIME_FAILED` settlement path (`chat-slash-command-router.service.ts:466-475`). No stale-state defect was found in these paths.

### 5. What is missing that the requirements never mentioned?

The stopped-lane command catalog does not advertise `compact`. The adapter-level cold-resume spec bypasses dispatcher admission, so it does not cover this gap (`codex-app-server-lane.adapter.spec.ts:694-708`).

## Serious issues

### Cold resume without a cached catalog does not compact

- File: `agent-message-dispatcher.ts:155-169`, `agent-message-coordinator.service.ts:130-144`, `codex-app-server-lane.adapter.ts:912-915`
- Scenario: The lane has no live handle and no cached command list.
- Impact: `/compact` starts an assistant turn instead of compacting. This contradicts the claimed cold-resume support.
- Fix: Include `compact` in the stopped-lane catalog and propagate it through `stoppedLaneView`. Add a dispatcher-to-adapter test for cold resume with no cached catalog.

## Minor issues

- The new streamless test omits `sessionRuntimeRouter` (`chat-continue-slash-before-resume.spec.ts:523-535`). It proves the metadata fallback, not the normal Electron idle path already guarded at `chat-session.service.ts:3290-3299`. Add a busy native-admission case to pin the actual teardown race.

## Data flow

1. Main chat: `continueSession` preserves the Codex record, then the router compacts or refuses without a relaunch. **OK** (`chat-session.service.ts:2089`, `chat-slash-command-router.service.ts:402-422`).
2. Live lane: the catalog advertises `compact`, the dispatcher sends it raw, and `continue` calls `runCompact`. **OK** (`codex-app-server-lane.adapter.ts:985`, `codex-app-server-lane.adapter.ts:1051-1056`).
3. Cold lane: raw delivery depends on a cached catalog. **GAP** (`agent-message-dispatcher.ts:155-169`).
4. Other runtimes: the Codex-only branches leave Claude, ACP, agy and provider-session routing unchanged. **OK** (`chat-slash-command-router.service.ts:362-373`, `chat-slash-command-router.service.ts:424-465`).

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Main-chat `/compact` | COMPLETE | Busy, idle and closed-thread paths are covered. |
| Main-chat `/model`, `/status`, skills and unknown commands | COMPLETE | Typed `CODEX_UNSUPPORTED_OPTION`; no session teardown. |
| Live-lane `/compact` | COMPLETE | Busy admission and recovery are guarded. |
| Cold-lane `/compact` | PARTIAL | No-cache dispatcher admission still sends a model turn. |
| Other lane commands | COMPLETE | Ordinary text delivery follows the recorded decision. |

## Verification

- Traced the changed exports through `ChatSessionService`, the slash router, Electron and CLI-engine adapter composition, and the lane dispatcher.
- `ptah_get_diagnostics` timed out twice; no diagnostic result was available.
- Independent Jest execution did not start the tests. Both RPC suites failed during module resolution because worktree-local `node_modules/marked` was absent. This is an environment blocker, not a test failure caused by the diff.
- The implementer reports passing focused Jest and TypeScript checks in `fix-report.md:18-59`. Those results were not independently reproduced here.

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: A stopped Codex lane without a cached catalog still executes `/compact` as a model prompt.
- What a robust implementation would add: stopped-lane command advertisement and one no-cache cold-resume integration test.
