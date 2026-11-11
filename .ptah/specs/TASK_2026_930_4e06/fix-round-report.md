# Batch B1 fix round

## Findings and changes

1. `child-setting-router.service.ts:18` truncates the brief to 8,000 characters before ranking or model dispatch. The router spec uses a 20,000-character brief.
2. `child-setting-rule.ts:10` tokenizes IDs at punctuation and digit boundaries. Pro and Flash are ranked by exact token; `child-setting-rule.spec.ts:44` covers Gemini IDs.
3. `child-setting-router.service.ts:85` starts the 3,000 ms timer before `openCaller()`. Its request handles late rejection at debug level (`:151`), and `finally` clears the timer. The router spec uses fake timers for a stalled caller.
4. Accepted the review's note about decision latency for an unmatched brief. No code change.
5. No code change.
6. `session-spawner.service.ts:442` logs the error message when routing or routed admission throws.
7. `session-spawner.port.ts:111` defines one source fallback helper for legacy records. The spawner UI payload (`session-spawner.service.ts:1495`) and MCP text (`session-tool-handlers.ts:137`) call it. Source fields remain optional on old snapshots.
8. No code change.
9. `chat/di.spec.ts:44` covers router binding present and absent. `chat-session-agent-child.spec.ts:332` covers a named account and catalog failure. The required-token guards are unchanged.
10. Prettier ran on every file changed in this round.

## Tests added and local execution

- `child-setting-router.service.spec.ts`: invalid labels `o99` and `x1`, timeout during caller opening, thrown call, valid model and effort labels, mixed explicit model, and long brief. The lane-routing target passed.
- `child-setting-rule.spec.ts:44`: Gemini model ranking. The lane-routing target passed.
- `session-spawner.service.spec.ts`: routed snapshot and sources, routed admission refusal, explicit refusal, optional router, route before Git, and UI payload. These new cases did not run locally because the suite failed to start on missing `marked`.
- `session-tools.spec.ts:386`: start result text with model and effort sources. This new case did not run locally because the suite failed to start on missing `marked`.
- `chat/di.spec.ts:44` and `chat-session-agent-child.spec.ts:332`: DI and catalog cases. These new cases did not run locally because their suites failed to start on missing `marked`.

## Verification

Command: `npm run verify -- -p @ptah-extension/lane-routing,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/vscode-lm-tools,@ptah-extension/shared`

Final run: exit code 1. All 10 lint and typecheck tasks passed. Per-target test result:

| Target | Result | Jest detail |
| --- | --- | --- |
| lane-routing | Passed | Both new spec files ran. |
| shared | Passed | No new tests in this round. |
| cli-agent-runtime | Failed on suite starts | 92 suites passed, 87 failed to start; 1,311 tests passed, 1 skipped, 0 failed. |
| rpc-handlers | Failed on suite starts | 112 suites passed, 129 failed to start; 2,925 tests passed, 6 skipped, 0 failed. |
| vscode-lm-tools | Failed on suite starts | 63 suites passed, 44 failed to start; 1,251 tests passed, 0 failed. |

The parent session inspected the three Nx logs. Every failed suite says `Could not locate module marked`; no test assertion failed. The new tests in those three targets did not run locally. The three failed target logs are outside this worktree, so I used the parent's exact Jest summaries.

## Open points

- An unmatched brief still makes one decision call when configured, up to 3,000 ms.
- The worktree lacks `node_modules/marked`. The new cli-agent-runtime, rpc-handlers, and vscode-lm-tools tests still need a run where that dependency is available.

