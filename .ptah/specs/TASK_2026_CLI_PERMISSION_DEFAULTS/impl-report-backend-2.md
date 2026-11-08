# Backend follow-up report

## Task A — native modes

- Grok yolo now advertises native `--always-approve` with network allow. The profile inserts the flag before `stdio`; ACP permission response policy remains explicit and unchanged.
- OpenCode yolo now advertises `--auto` with `permission: "allow"` merged into the existing `OPENCODE_CONFIG_CONTENT` MCP object. A resolved policy requires `--standalone`; plan removes `--auto`. The adapter no longer sends `--auto` implicitly.
- Cursor yolo now uses SDK `mode: 'agent'` and local `sandboxOptions.enabled: false` on create and resume. The same agent carries that policy through follow-up turns. Plan remains unsupported pending local no-mutation proof. Pi remains unsupported with an explicit native flag explanation. The existing resolver derives yolo defaults from these manifests.
- Grok plan/ask/auto-edit lack verified native per-lane controls; OpenCode ask/auto-edit lack a verified approval bridge; Cursor ask/auto-edit lack verified SDK bindings. Network deny remains unsupported for all four because none has proven per-lane network isolation. Pi has no native permission flag; its sandbox is an opt-in extension.
- Files: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/{grok/grok-acp-profile,grok-cli.adapter,opencode-cli.adapter,cursor-cli.adapter,pi-cli.adapter}.ts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts`, their adapter/profile/policy specs, and `messaging/lane-resumers/system-cli-lane-resumer.spec.ts`.
- Tests: typed Cursor create/resume/follow-up fakes and plan refusal, parse-only Grok argv/profile assertions, OpenCode argv and merged MCP JSON assertions, and the full CLI runtime suite (162 suites passed; one unrelated pinned-version assertion failed).

## Task B — Codex chat parent cap

- The native `CodexChatAdapter` now exposes the current permission level of a live session through a read-only lookup. `PtahAPIBuilder` uses it after the existing SDK lifecycle lookup in `getParentLevel`. The lookup key is the host-authenticated MCP caller session ID, never caller-supplied permission data. No new DI service or registration is needed: the existing `SDK_TOKENS.CODEX_CHAT_ADAPTER` registration is read through its canonical symbol.
- Regression coverage checks absent, live, changed, and closed native session lookup. A builder regression checks fallback from absent SDK lifecycle to the native level; the existing agent namespace regression checks that a trusted plan level overrides caller metadata.
- Files: `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts` and `.spec.ts`; `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts` and `.spec.ts`.
- Tests: native session lookup and builder fallback regressions passed in the agent-sdk and vscode-lm-tools full runs; two unrelated Windows symlink privilege tests failed in agent-sdk.

## Task D — saved default reset

- Added write-only `CLI_LANE_DEFAULTS_PATCH_SCHEMA` and `CliLaneDefaultsPatch`; read-side `CLI_LANE_DEFAULTS_SCHEMA` remains non-null. The existing serialized `agent:setConfig` queue removes rows on `null`, removes individual fields on `null`, and keeps omitted rows and fields.
- Codex row reset, or clearing its last two fields, removes the canonical row and clears the legacy `codexSandboxMode` key with `undefined`. The file settings provider removes an undefined value; its read path then returns the built-in default (`danger-full-access`). This prevents `agent:getConfig` from projecting a phantom saved Codex row. Added RPC regressions for row, field, omitted, canonical reset, legacy-only projection and reset, and two-field reset.
- Files: `libs/shared/src/lib/types/cli-lane-defaults.types.ts` and `rpc/rpc-agents.types.ts`; `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts` and `agent-rpc.handlers.set-config.spec.ts`.
- Tests: row null, field null, omitted values, Codex reset/read-back with no saved row, legacy-only projection/reset, and two-field reset passed in the full rpc-handlers suite (238/238 suites).

## Verification

- `grok agent --always-approve --no-leader stdio --help`: pass, exit 0, parse-only; no model request.
- `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=agent-rpc.handlers.set-config.spec.ts --coverage=false --maxWorkers=2`: pass, 1/1 Nx task. The verifier did not print a `Running target test for N projects` header.
- `npm run verify -- -t test -p @ptah-extension/rpc-handlers`: pass, 238/238 suites; 6309 passed, 8 skipped, 6317 total tests. 1/1 Nx task succeeded after 496s queue time and 5m48s test runtime. The verifier did not print a `Running target test for N projects` header; it explicitly ran `verify test (@ptah-extension/rpc-handlers)` and reported one Nx task.
- `npm run verify -- -t test -p @ptah-extension/vscode-lm-tools`: pass, 103/103 suites; 3455/3455 tests. 1/1 Nx task succeeded after 118s queue time and 3m45s runtime. Jest warned that one worker needed forced exit during teardown; the suite did not hang.
- `npm run verify -- -t test -p @ptah-extension/shared`: pass, 143/143 suites; 4163/4163 tests. 1/1 Nx task succeeded after 41s queue time and 29.5s runtime.
- `npm run verify -- -t test -p @ptah-extension/platform-core`: fail, 56 suites passed, 2 failed; 1040 tests passed, 2 failed, 4 todo, 1046 total. The failures are `kernel-session-driver-lock.spec.ts` (`resetAndDestroy()` on a Windows handle raises `TypeError: This handle type cannot be sent`) and `control-endpoint.spec.ts` (control endpoint acquire returns false). Both specs and `kernel-session-driver-lock.ts` have byte-identical SHA-256 hashes in the main checkout and this worktree; the failures are unrelated to these edits. The suite completed in 45.6s, so neither is a hang.
- `npm run verify -- -t test -p @ptah-extension/cli-engine`: pass, 28/28 suites; 267/267 tests. 1/1 Nx task succeeded after 51s queue time and 1m45s runtime.
- `npm run verify -- -t test -p @ptah-extension/agent-sdk`: fail, 222 suites passed, 2 failed, 2 skipped; 5467 tests passed, 2 failed, 5 skipped, 5474 total. Both failures are Windows `EPERM` creating directory symlinks in `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts`. Both specs are byte-identical to main; the native Codex adapter specs passed.
- `ptah_get_diagnostics` scoped to edited agent-sdk and vscode-lm-tools files: clean, 0 errors and 0 warnings. Scoped shared, rpc-handlers, and cli-agent-runtime diagnostics remained unavailable after repeated 45-second TypeScript worker waits. Their full test suites reached Jest, with no TypeScript errors after the Cursor manifest correction. The verifier did not print `Running target test for N projects` for any full suite; every command targeted exactly one named project and reported one Nx task.

## Task C — full suites and stalled-suite diagnosis

The first CLI runtime full-suite attempt was stopped while waiting for a verifier lock, before any test began. The next `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime` acquired a slot and finished in 3m8s: 39 suites failed, 124 passed, 163 total; 1 test failed, 1 skipped, 2544 passed, 2546 total. Most failed suites were blocked by TS2322 from an invalid Cursor manifest state (`unverified`); the one assertion failure expected no `resumePolicy` in the resume call. Both were corrected. A subsequent full CLI run acquired a slot after 476s of verifier contention and finished in 1m43s: 1 suite failed, 162 passed, 163 total; 1 test failed, 1 skipped, 3391 passed, 3393 total. The sole failure is the existing pinned SDK version assertion: the test and both worktree/main `package.json` require `@anthropic-ai/claude-agent-sdk` 0.3.318, but this worktree's installed `node_modules` contains 0.3.278. It is local dependency drift, unrelated to this branch's source. Every requested full suite ran. None remained active for 15 minutes after acquiring a slot, so no `--detectOpenHandles` isolation was needed. The only forced Jest worker exit was in the passing vscode-lm-tools suite. No branch-caused hanging spec was found. Main comparison was read-only: the CLI pinned test, platform-core lock specs/implementation, and agent-sdk symlink specs match main source; branches were not switched or stashed.

## Decisions

- Codex native permission lookup uses the live adapter state, rather than a second registry. Evidence: `CodexChatAdapter` already retains each session and its `turnPermissionLevel`; reversible by removing the method and optional DI reader.
- Codex reset clears the legacy key. Evidence: `IWorkspaceProvider.setConfiguration` accepts `undefined`, and `PtahFileSettingsManager.get` uses the caller default when no stored value exists; reversible if the legacy reader is retired.
- Cursor plan is represented as unsupported with an explicit unverified reason. Evidence: the manifest state type has only `supported` and `unsupported`, and local no-mutation proof is unavailable; reversible when a local executor test proves the SDK mode.

## Deviations

- No model requests were made; Grok verification was parse-only, and Cursor used typed SDK fakes. The installed Anthropic SDK version mismatch and Windows symlink privilege failures were left unchanged because their sources match main and they are outside this backend change.
- No skill-loading tool was available to this lane, so no optional skill instructions were loaded.

## Open issues

- Refresh this worktree's installed Anthropic SDK to the pinned `0.3.318` before expecting a clean full CLI runtime suite.
- Run platform-core session driver lock tests in an environment that supports the Windows socket operations they require; run agent-sdk symlink tests with Windows symlink privilege. Their current failures are not caused by these changes.
- Scoped shared, RPC, and CLI TypeScript diagnostics were unavailable because the Ptah compiler worker exceeded its 45-second response window.
