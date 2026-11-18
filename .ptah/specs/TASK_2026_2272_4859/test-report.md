# Skill ranking test report

Status: four spec files implemented; runtime verification blocked by machine resources. No passing Jest, lint, typecheck or full-gate result is claimed.

## Authored coverage

- skill-ranking-caller.service.spec.ts: fake DecisionCaller/completer; unset/blocked models, first and second offered choices, reorder, unknown per-item answer and valid sibling, all invalid answers, raced 3s timeout, opening/model exceptions, 250ms inner timeout margin, privacy/200-character cap, empty request.
- skill-ranking.service.spec.ts: fake decision caller and HarnessLlmRunner, fake filesystem scratch operations; decision precedence, absent/null/error fallback, valid structured JSON, invalid JSON, unknown/duplicate/missing labels, partial per-item fallback and mixed model provenance, three injection strings, prompt privacy/cap, tool prohibition, item-scoped JSON schema and Zod validation, exact fake-timer 3s/15s deadlines, heuristic-only operation, reason length.
- skill-recommendation.service.spec.ts: existing tests retained; explicit undefined ranker equivalence, ranker selection for all three rankedBy values, rank/reason fields, one best free candidate and shared candidate exclusion.
- harness-llm-runner.service.spec.ts: fake SDK processor/query/resolver/broadcaster; workspace model resolution separate from scratch cwd, toolAccess none, JSON schema, MCP disabled and supplied maxTurns forwarded.

No live model, network call, or real model runner is used in the added specs. No onboarding libraries or UI components were modified.

## Focused fixes and runner explanation

Zod now rejects duplicate output labels instead of silently deduplicating them. Missing model reasons get a concise default, and reasons are capped at 139 characters to satisfy ?under 140?. Ranking metadata is allowlisted, sanitized for executable markup/javascript schemes/URLs/absolute paths, trimmed and capped at 200 characters. Workspace and evidence fields do not enter prompts.

The public decision deadline remains 3000ms. Inner system-one timeout and structured abort budget use 2750ms, reserving the existing 250ms return margin.

The runner diff against main changes workspaceRoot and toolAccess, not maxTurns. A source comment explains that scratch execution avoids workspace access while provider/model resolution must use the workspace and ranking tools must be disabled. The focused runner test covers these parameters and maxTurns forwarding.

## Verification

PTAH_VERIFY_LINT_PARALLEL=1 was used. No verification locks or memory thresholds were bypassed. Only this lane's queued verification processes were stopped; other worktrees were left untouched.

| Command | Nx tasks executed | Exit code | Result |
| --- | ---: | --- | --- |
| npm run verify -- --related -p lane-routing,rpc-handlers,shared | 0 | -1 | Queue position 4, waited over two minutes, own queued process stopped. |
| npm run verify -- -t lint,typecheck -p lane-routing,rpc-handlers,shared,ptah-electron | 0 | 1 | Queue position 4, cancelled own process tree after 20s without admission. |
| npm run verify -- -p lane-routing,rpc-handlers,shared,ptah-electron | 0 | 1 | Queue position 4, cancelled own process tree after 20s without admission. |
| Changed-file TypeScript transpileModule syntax check | N/A | 0 | 10 files, 0 syntax/transpilation errors; not semantic typechecking. |
| git diff --check | N/A | 0 | No whitespace errors. |

Resource evidence: all three verification slots occupied; approximately 2.1?2.2 GB free while additional-run admission requires 5 GB. `node scripts/verify.mjs --status` output is captured below. There are no assertion failure messages to quote because no target started. Nonzero gate exits reflect cancellation, not failing assertions.

Runtime statement/branch/function/line coverage: unavailable. Jest never started; zero tests executed. Authored scenario coverage is listed above. The requested commands do not enable instrumentation. After resources are available, rerun all three gates and, if numeric coverage is needed, a focused instrumented pass over these four specs under the verification lock. Syntax/transpilation success does not establish that assertions pass.

## Tool availability

Ptah workspace analysis and reverse-dependency inspection were available. Native CLI skill discovery was unavailable; local resilient-nestjs-patterns/SKILL.md and retry-and-fallback reference were read directly. Ptah diagnostics (including a scoped retry) reported: "TypeScript check still running after 45s. It was not cancelled"; both requested files remained unchecked. The native syntax check is a limited fallback; semantic types remain unverified. A resource-blocker report to the parent was not delivered because its inbox was full.

## Absolute paths

- `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\libs\backend\lane-routing\src\lib\decision-model\skill-ranking-caller.service.spec.ts`
- `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\libs\backend\rpc-handlers\src\lib\skills-sh\services\skill-ranking.service.spec.ts`
- `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\libs\backend\rpc-handlers\src\lib\skills-sh\services\skill-recommendation.service.spec.ts`
- `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\libs\backend\rpc-handlers\src\lib\harness\ai\harness-llm-runner.service.spec.ts`

## Complete captured output

### `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\.ptah\specs\TASK_2026_2272_4859\verification\01-related.log`

```text
> @ptah-extension/source@0.0.0 verify
> node scripts/verify.mjs --related -p lane-routing,rpc-handlers,shared

[verify 2026-11-18T10:45:14.693Z] waiting for a slot: 3/3 held by pid 32732 [verify lint,typecheck (ui,chat) then verify test (ui,chat)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-advanced-page-5b3618ab7e1d since 2026-11-18T10:40:39.461Z; pid 35764 [verify lint,typecheck (chat,core) then verify test (chat,core)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-decision-matrix-context-d1634ac04677 since 2026-11-18T10:40:08.857Z; pid 39200 [verify lint,typecheck (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e) then verify test (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e)] in D:\projects\ptah-extension\.claude-worktrees\display-detached-default since 2026-11-18T10:36:34.357Z (queue position 4)
[verify 2026-11-18T10:46:15.332Z] waiting for a slot: 3/3 held by pid 32732 [verify lint,typecheck (ui,chat) then verify test (ui,chat)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-advanced-page-5b3618ab7e1d since 2026-11-18T10:40:39.461Z; pid 35764 [verify lint,typecheck (chat,core) then verify test (chat,core)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-decision-matrix-context-d1634ac04677 since 2026-11-18T10:40:08.857Z; pid 39200 [verify lint,typecheck (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e) then verify test (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e)] in D:\projects\ptah-extension\.claude-worktrees\display-detached-default since 2026-11-18T10:36:34.357Z (queue position 4)
[verify 2026-11-18T10:47:15.433Z] waiting for a slot: 3/3 held by pid 32732 [verify lint,typecheck (ui,chat) then verify test (ui,chat)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-advanced-page-5b3618ab7e1d since 2026-11-18T10:40:39.461Z; pid 35764 [verify lint,typecheck (chat,core) then verify test (chat,core)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-decision-matrix-context-d1634ac04677 since 2026-11-18T10:40:08.857Z; pid 39200 [verify lint,typecheck (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e) then verify test (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e)] in D:\projects\ptah-extension\.claude-worktrees\display-detached-default since 2026-11-18T10:36:34.357Z (queue position 4)
EXIT_CODE=-1
```

### `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\.ptah\specs\TASK_2026_2272_4859\verification\02-lint-typecheck.log`

```text
COMMAND: npm run verify -- -t lint,typecheck -p lane-routing,rpc-handlers,shared,ptah-electron
CWD: D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c

> @ptah-extension/source@0.0.0 verify
> node scripts/verify.mjs -t lint,typecheck -p lane-routing,rpc-handlers,shared,ptah-electron

[verify 2026-11-18T10:47:26.939Z] waiting for a slot: 3/3 held by pid 32732 [verify lint,typecheck (ui,chat) then verify test (ui,chat)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-advanced-page-5b3618ab7e1d since 2026-11-18T10:40:39.461Z; pid 35764 [verify lint,typecheck (chat,core) then verify test (chat,core)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-decision-matrix-context-d1634ac04677 since 2026-11-18T10:40:08.857Z; pid 39200 [verify lint,typecheck (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e) then verify test (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e)] in D:\projects\ptah-extension\.claude-worktrees\display-detached-default since 2026-11-18T10:36:34.357Z (queue position 4)

RESOURCE_LIMIT: cancelling this queued attempt after 20s; no lock admission.

EXIT_CODE=1; SIGNAL=null
```

### `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\.ptah\specs\TASK_2026_2272_4859\verification\03-full-gate.log`

```text
COMMAND: npm run verify -- -p lane-routing,rpc-handlers,shared,ptah-electron
CWD: D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c

> @ptah-extension/source@0.0.0 verify
> node scripts/verify.mjs -p lane-routing,rpc-handlers,shared,ptah-electron

[verify 2026-11-18T10:47:47.936Z] waiting for a slot: 3/3 held by pid 32732 [verify lint,typecheck (ui,chat) then verify test (ui,chat)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-advanced-page-5b3618ab7e1d since 2026-11-18T10:40:39.461Z; pid 35764 [verify lint,typecheck (chat,core) then verify test (chat,core)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-decision-matrix-context-d1634ac04677 since 2026-11-18T10:40:08.857Z; pid 39200 [verify lint,typecheck (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e) then verify test (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e)] in D:\projects\ptah-extension\.claude-worktrees\display-detached-default since 2026-11-18T10:36:34.357Z (queue position 4)

RESOURCE_LIMIT: cancelling this queued attempt after 20s; no lock admission.

EXIT_CODE=1; SIGNAL=null
```

### `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\.ptah\specs\TASK_2026_2272_4859\verification\queue-status.log`

```text
lock dir: C:\Users\<user>\AppData\Local\Temp\ptah-verify-lock
slots: 3, free memory: 2.1 GB (a second run needs 5.0 GB)
slot 0: pid 32732 [verify lint,typecheck (ui,chat) then verify test (ui,chat)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-advanced-page-5b3618ab7e1d since 2026-11-18T10:40:39.461Z
slot 1: pid 35764 [verify lint,typecheck (chat,core) then verify test (chat,core)] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-decision-matrix-context-d1634ac04677 since 2026-11-18T10:40:08.857Z
slot 2: pid 39200 [verify lint,typecheck (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e) then verify test (chat,chat-ui,core,canvas,command-center,rpc-handlers,shared,ptah-electron,ptah-electron-e2e)] in D:\projects\ptah-extension\.claude-worktrees\display-detached-default since 2026-11-18T10:36:34.357Z
queue 1: pid 35048 [shots-renderer-after] in D:\projects\ptah-extension\.claude-worktrees\feat-settings-advanced-page-5b3618ab7e1d since 2026-11-18T10:38:23.286Z
queue 2: pid 24740 [verify lint,typecheck (@ptah-extension/chat,@ptah-extension/core,ptah-electron-e2e) then verify test (@ptah-extension/chat,@ptah-extension/core,ptah-electron-e2e)] in D:\projects\ptah-extension\.claude-worktrees\fix-settings-providers-lanes-ae00bbe8bd36 since 2026-11-18T10:40:00.379Z
queue 3: pid 1896 [verify lint,typecheck (onboarding) then verify test (onboarding)] in D:\projects\ptah-extension\.claude-worktrees\skills-step-redesign since 2026-11-18T10:43:40.301Z
queue 4: pid 34312 [verify test (lane-routing,rpc-handlers,shared, related to main)] in D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c since 2026-11-18T10:45:14.645Z
```

### `D:\projects\ptah-extension\.claude-worktrees\feat-skill-ranking-decision-model-dec49e44aa6c\.ptah\specs\TASK_2026_2272_4859\verification\syntax-check.log`

```text
Syntax/transpilation: 10 changed TypeScript files, 0 errors. This is not semantic typechecking or test execution.
EXIT_CODE=0
```

