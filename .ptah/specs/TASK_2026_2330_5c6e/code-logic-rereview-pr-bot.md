# Code logic re-review — PR #1516 bot fixes, round 2

## Verdict

APPROVED 8/10

## Summary

Both earlier defects are fixed in the uncommitted diff. A stalled `skills/list` now rejects that request and leaves the process open. An inactive skill resume passes `effort` on the same config that becomes the thread profile. The five extra Codex runtime files only thread an optional timeout and recognize late skill replies. No new Blocking or Serious defect.

Score is 8 rather than 9 because a late skill frame that fails envelope validation still takes the existing `onData` fail path (`codex-app-server-process.ts:387-388`); only `invalidResult` is ignored (`codex-app-server-process.ts:454-455`). It is not 6: the 30s timer no longer calls `fail` for `skills/list`, and effort is on the resume profile the next `turn/start` sends.

Jest was not re-run here. The fix report's focused suites are the verification evidence. This pass is source tracing of the diff.

## Earlier findings

| Finding | Status | Evidence |
| --- | --- | --- |
| Serious: abandoned `skills/list` closes the live lane | FIXED | `listCodexLaneSkills` passes the remaining budget as the RPC timeout (`codex-app-server-lane-catalog.ts:13-15`). Live and stopped reads observe a rejection via `Promise.allSettled` and still return models, efforts, and `commandsUnavailable` (`codex-app-server-lane.adapter.ts:1024-1041`, `codex-app-server-lane-catalog.ts:46-51`). On that timeout the transport deletes the pending entry and rejects without `fail` (`codex-app-server-process.ts:327-332`). A late reply whose id is in the issued negative skill sequence is dropped (`codex-app-server-process.ts:426-427`, `codex-app-server-process.ts:497`). `RuntimeContext.skillCommands` forwards `timeoutMs` (`codex-context.ts:1013-1015`). |
| Moderate: inactive skill resume drops the selected effort | FIXED | The inactive branch resumes with `effort: params.effort` beside `config.model` (`chat-slash-command-router.service.ts:411-414`). Host profile build copies `config.effort` (`codex-chat-host-ports.ts:450`). The context stores it (`codex-context.ts:183-185`) and `turn/start` sends `this.settings.effort` (`codex-context.ts:1071`). The open-session branch still applies both fields before invoke (`chat-slash-command-router.service.ts:416-420`). |

## Extra files

| File | New failure mode |
| --- | --- |
| `codex-runtime.types.ts` | No. Optional second parameter on `listSkillCommands` (`codex-runtime.types.ts:446`). One-argument implementations stay assignable. |
| `owned-codex-context.ts` | No. The wrapper forwards `timeoutMs` (`owned-codex-context.ts:14`). A missing inner method still becomes `[]`. No extra listener. |
| `codex-context.ts` | No. `timeoutMs` is passed through (`codex-context.ts:1006-1015`). Omitted timeout still uses the request default. `resolveSkillCommand` does not pass one, so a hung lookup rejects at 30s instead of closing the process. That matches the catalog fix. |
| `codex-app-server-process.ts` | No leaked listener, double close, or lost model/effort. Skill ids are a separate negative sequence updated only after validation (`codex-app-server-process.ts:321-325`). Timeout removes that pending entry only (`codex-app-server-process.ts:329-332`). `close` still clears remaining timers once (`codex-app-server-process.ts:674-678`). Listener teardown is unchanged (`codex-app-server-process.ts:754-764`). |
| `codex-app-server-process.spec.ts` | Test only. Covers timeout, a late `id: -1` reply, process still writable, and a following `id: -2` success (`codex-app-server-process.spec.ts:1165-1177`). |

## `platform-cli` and `cli-engine` exports

Unchanged. Neither package is in the diff. `platform-cli` `src/index.ts` does not export Codex context types. `cli-engine` imports `CODEX_RUNTIME_TOKENS` from `@ptah-extension/codex-runtime` and does not re-export `listSkillCommands` or `CodexAppServerProcess`. The Codex context change is an optional parameter, so existing callers keep compiling.

## Five logic questions

1. Silent failure: a live skill stall resolves the catalog with `commandsUnavailable` and does not arm a process-killing timer. The rejection is inside `allSettled`, so it is not an unhandled rejection.
2. User action: an inactive skill resume now carries the selected effort into the thread profile. The open session still applies model and effort before the skill invoke.
3. Wrong answer: a late skill payload is not applied to a request that already timed out (`codex-app-server-process.ts:497`). The next `skills/list` uses the next negative id.
4. Dependency failure: `skills/list` timeout or rejection leaves models in place. Any other request timeout still calls `fail`. A skill write failure still calls `fail`, which is a broken stdin, not a stall.
5. Unspecified case: a late skill frame that is not `invalidResult` (for example `invalidEnvelope`) still closes the process through `onData`. That is the same fail-closed rule as any other malformed stdout frame, and it is not the abandoned-timer bug.

## New defects

None.

## Decisions

- Treat request-local `skills/list` timeout for every caller, including `resolveSkillCommand`, as the fix rather than a new defect. The alternative was a catalog-only cancel flag. Evidence: one transport branch at `codex-app-server-process.ts:329-332` is what stops `fail`. Reversible.
- Do not re-file the empty `prompt: ''` resume turn. It predates this diff; `turn/start` still uses `settings.effort` once the profile has it.
