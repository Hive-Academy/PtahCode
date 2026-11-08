# CodeRabbit PR #995 backend findings

Branch: `feat/cli-permission-defaults`. Changes are uncommitted. No frontend files were edited.

## 1. Settings map reload

**Confirmed.** `file-settings-keys.ts:115` routes `agentOrchestration.cliLaneDefaults` to the settings file, but the object registry at `file-settings-keys.ts:319-322` omitted it. `file-settings-manager.ts:798-804` flattens any unregistered object, so a reloaded manager could no longer read the map at its root key.

**Change:** Registered the map as an object-valued setting. Added `file-settings-manager.spec.ts` coverage that writes three CLI rows, constructs a fresh manager, and reads the identical map. Files: `libs/backend/platform-core/src/file-settings-keys.ts`, `libs/backend/platform-core/src/file-settings-manager.spec.ts`.

**Test command/result:** `npm run verify -- -t test -p @ptah-extension/platform-core -- --testPathPatterns=file-settings-manager.spec.ts` passed (1 Nx task; exit 0). The shared verifier first waited 526 seconds for memory.

**PR reply:** Confirmed. The file loader flattened `cliLaneDefaults` into leaf keys after restart. I registered it as a whole object and added a multi-CLI disk reload regression test.

## 2. Codex tab parent level

**Confirmed.** `ptah-api-builder.service.ts:715-726` resolved tab IDs to real session IDs for ownership, but passed the raw tab ID to `CodexChatAdapter.getPermissionLevel`, which indexes its live sessions by thread ID (`codex-chat-adapter.ts:194-198`).

**Change:** Added `parent-lane-permission.ts`, which looks up the trusted lifecycle record, reads the Codex adapter by its real session ID, and caps an unresolved session-bound caller at `plan`. The namespace only calls this lookup when a caller session exists (`agent-namespace.builder.ts:366-372`), so parentless spawns remain possible. Test: `parent-lane-permission.spec.ts`, covering tab-to-thread and unknown bound session/parentless cases. Files: `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.ts`, its spec, and `ptah-api-builder.service.ts`.

**Test command/result:** `npm run verify -- -t test -p @ptah-extension/vscode-lm-tools -- --testPathPatterns=parent-lane-permission.spec.ts` passed (1 Nx task; exit 0).

**PR reply:** Confirmed. The parent permission lookup now resolves a Codex tab to its thread before reading the live level. If a bound session cannot be resolved, its lane is capped at plan; calls with no parent remain parentless.

## 3. Resume parent level

**Confirmed.** `system-cli-lane-resumer.ts:27-49` passed the saved policy but no `parentLevel`; `ptah-cli-lane-resumer.ts:90-101` did the same. `agent-lane-resume.service.ts:36-68` forwarded explicit resume requests without re-reading parent state. The RPC path enters that service (`agent-rpc.handlers.ts:1772-1798`).

**Change:** Added a trusted live parent-level callback at the runtime DI composition point (`register-agent-messaging.ts`). It reads the SDK lifecycle record and Codex adapter, using the real session ID, and caps unknown bound sessions at plan. System cold resumes, Ptah CLI cold/explicit resumes, and system explicit resumes now pass its current result. A missing parent remains parentless. Tests were added in `system-cli-lane-resumer.spec.ts`, `ptah-cli-lane-resumer.spec.ts`, and `agent-lane-resume.service.spec.ts`. Files also include the new `parent-lane-level.ts` port and the three runtime implementation files.

**Test command/result:** `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- '--testPathPatterns=(opencode-cli.adapter|system-cli-lane-resumer|ptah-cli-lane-resumer|agent-lane-resume.service).spec.ts'` passed on rerun (4 suites, 105 tests; exit 0). The first run exposed a parentless lookup mistake in the new test, which was fixed before the passing rerun.

**PR reply:** Confirmed. All resume entry points now resolve the current parent level from the live host session rather than the lane record. Unknown bound sessions are capped at plan, including Codex tab parents.

## 4. OpenCode built-in default

**Confirmed.** `opencode-cli.adapter.ts:701-704` rejected any resolved permission when `--standalone` was absent or the help probe failed, including the new built-in `yolo` default. The old launch uses `--auto` (`opencode-cli.adapter.ts:695-697`).

**Change:** Pass `permissionSource` from the resolved policy through `AgentProcessManager` to `CliCommandOptions`. For built-in `yolo` only, unavailable standalone uses legacy `--auto`; the returned SDK handle reports a legacy fallback description without claiming enforced permission or network. Saved/explicit `yolo` and parent-plan still refuse with a source-specific reason. Tests in `opencode-cli.adapter.spec.ts` cover old help, probe failure, saved yolo, and parent-plan. An isolated retry of the account-binding suite exposed an existing spawn fixture with `effectivePolicy` but no `requested` field; the source forwarding now handles this optional field. Files: adapter, adapter spec, interface, process manager.

**Test command/result:** Included in the focused CLI runtime command above. It passed on rerun; the first run exposed a test input that used OpenCode's unsupported `plan` + `deny` pair, and the case now uses supported `plan` + `allow` to reach the standalone check.

**PR reply:** Confirmed. Built-in OpenCode defaults now retain the previous `--auto` launch when standalone is unavailable or its probe fails. The effective record identifies the legacy fallback. Explicit and saved yolo, and plan, still refuse without standalone.

## 5. Unrelated Codex settings writes

**Confirmed.** `cli-lane-defaults-config.ts:90-105` merged against `readCliLaneDefaults`, which derives a Codex row from the legacy key, and `saveCliLaneDefaults` always wrote both keys. A non-Codex patch therefore persisted a derived Codex row and rewrote the legacy setting.

**Change:** For patches that do not touch Codex, merge against the raw saved map and write only that map. Codex edits still use the derived legacy row for partial-row merges and keep the two-key sync and rollback. Added regression coverage in `agent-rpc.handlers.set-config.spec.ts` asserting no derived row and no legacy write. Files: `cli-lane-defaults-config.ts` and the spec.

**Test command/result:** `npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --testPathPatterns=agent-rpc.handlers.set-config.spec.ts` passed (1 Nx task; exit 0).

**PR reply:** Confirmed. Non-Codex patches now leave both the legacy Codex key and the canonical Codex row untouched. Codex-specific patches still synchronize the two settings.

## Decisions

- Unknown *bound* parent session: cap at `plan` rather than treating it as unrestricted. Evidence: the resolver already enforces parent-plan caps, and the MCP namespace distinguishes parentless calls before invoking the level lookup. Reversible: yes.
- OpenCode built-in fallback: retain the previous `--auto` launch and report it as a legacy fallback with no guaranteed effective permission/network. Explicit choices continue to require standalone. Reversible: yes.

## Verification status

`ptah_get_diagnostics` was invoked after edits with changed-file scope. Its initial TypeScript compiler calls reported `Unavailable` after 45 seconds while concurrent worktrees exhausted memory; the final scoped call on the last changed source file returned 0 errors and 0 warnings. All requested focused regression tests passed after shared-memory waits.

The requested one-shot five-project command was run: `npm run verify -- -p @ptah-extension/platform-core,@ptah-extension/agent-sdk,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers,@ptah-extension/vscode-lm-tools`. Eight of ten lint/typecheck tasks passed. The two typechecks reported the same new error: the SDK lifecycle record permits `realSessionId: null`. The helper type was corrected, and `npm run verify -- -t typecheck -p @ptah-extension/vscode-lm-tools,@ptah-extension/rpc-handlers` then passed (2/2 tasks, exit 0).

The five-project test phase passed for rpc-handlers and vscode-lm-tools. Platform-core failed on the two known Windows session-lock tests; agent-sdk failed on the two known PluginLoader symlink `EPERM` tests. CLI runtime passed 162 suites and 3337 tests, but its `agent-process-manager.account-binding.spec.ts` suite did not start because the Jest worker hit its child-process retry limit under concurrent load. The isolated retry reproduced a `TypeError` at the new `permissionSource` forwarding line because the fixture's `effectivePolicy.requested` is absent. After making that access optional, `npm run verify -- -t test -p @ptah-extension/cli-agent-runtime -- --testPathPatterns=agent-process-manager.account-binding.spec.ts` passed (exit 0). `npm run verify -- -t typecheck -p @ptah-extension/cli-agent-runtime` also passed (exit 0).
