# CI and PR #1521 review fixes

| Item | Verdict | Evidence |
| --- | --- | --- |
| Provider pool test failures | Fixed | `libs/backend/provider-session-contracts/src/lib/provider-session.types.ts:75` requires `policy`, and the production builder supplies it at `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-open-request.ts:261`. The fakes now build complete typed requests at `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-pool.spec.ts:110` and `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-pool.fake-acp.spec.ts:108`. The build-count test also reuses the typed fixture. |
| Multiple Claude tabs sharing a canonical ID | Fixed | `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-registry.service.ts:493` enumerates live tab records for the spelling being resolved. The Electron resolver returns `ambiguous` when there is more than one match at `apps/ptah-electron/src/di/live-chat-session-resolver.ts:33`. The registry regression covers two owners and removal of one owner. |
| Attribution before Claude binds | Fixed | Electron marks the pre-bind ID provisional at `apps/ptah-electron/src/di/live-chat-session-resolver.ts:16`. `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:1281` declines provisional attribution through the shared helper used by cron, harness proposals, worktree capture, and session organization. The same tab remains discoverable by the live resolver. |
| Codex predecessor teardown failure | Fixed | `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:506` preserves the failed stop when acknowledgement re-arms the same predecessor. At line 1242, a failed runtime close followed by a missing or different runtime continues to fail the stop. The regression covers a second acknowledgement and flush, verifies the tab closer is never called, and verifies the durable state stays `closePending`. This guard tracks retries within the running service. |

## Verification

All 296 focused Jest tests passed across nine suites. Each invocation used the owning Jest config with `--runInBand --coverage=false --runTestsByPath`.

| Project | Suites | Tests | Result |
| --- | ---: | ---: | --- |
| Electron live chat resolver | 1 | 7 | Passed |
| RPC handlers provider session pool and fake ACP history | 2 | 38 | Passed |
| Agent SDK registry, eviction, and restart identity | 3 | 104 | Passed |
| CLI agent runtime handoff and acknowledgement | 2 | 105 | Passed |
| VS Code LM tools Ptah API builder | 1 | 42 | Passed |

- `npx eslint` on the 11 changed TypeScript files exited 0 with nine warnings, covering file length and existing non-null assertions. ESLint skipped the module-boundary rule because the Nx project graph cache was unavailable.
- `npx tsc --noEmit --project` passed for `apps/ptah-electron/tsconfig.app.json`, `apps/ptah-extension-webview/tsconfig.app.json`, `libs/backend/platform-cli/tsconfig.lib.json`, and `libs/backend/cli-engine/tsconfig.lib.json`.

Ptah's reverse dependency graph was still indexing during inspection. Impact was checked with targeted source searches and Git's tracked-file inventory. Repository skill discovery used the workspace's `.claude/skills` files, as the session exposed no separate CLI skill loader.
