## Findings (step 1)

- `session-tool-args.schema.ts:37-60`: Zod accepts any nonempty `model` up to 200 characters; there is no `effort` field or model catalog validation.
- `session-spawner.service.ts:377-432`: before the change, the model traveled into the host launch input and a transient runtime. `session-child.registry.ts:33-42` derives its record from the snapshot, which had neither model nor effort. `session-spawner.service.ts:1577-1624` copied the transient model on succession, so a live child handoff retained it, but the record could not restore it after runtime loss. The edited snapshot and record now keep both selections.
- `child-chat-session-host.adapter.ts:83-108` passes `model` to `ChatSessionService.startAgentChildSession`; `chat-session.service.ts:1328-1368` passes it into launch options. `chat-session.service.ts:1594-1613` uses the selected model when omitted and accepts an optional `effort` launch option. The edit adds effort to that same options path.
- `chat-runtime-profile.service.ts:120-139` delegates model selection to `WorkspaceProviderProfileResolver.resolveExecutionProfile`. `chat-runtime-profile.service.ts:158-159` reports a substitution when that resolver chooses another model. `sdk-query-options-builder.ts:1957-2036` checks a cached third-party catalog when available, but skips first-party and missing-cache checks; an unknown explicit ID was therefore not consistently refused at the tool boundary. `sdk-model-service.ts:678-704,1452-1469` exposes the runtime model catalog and resolver. Accepted concrete IDs vary by account/runtime; static model IDs cannot be inferred safely.
- `libs/shared/src/lib/types/ai-provider.types.ts:156` defines chat `EffortLevel` as low, medium, high, xhigh, max. `agent-spawn-args.schema.ts:96` accepts a string for CLI lane effort; `lane-spawn-policy.ts:328-442` maps the six advertised names, including minimal, per CLI. The chat SDK cannot represent minimal as an explicit effort.
- `session-tool-handlers.ts:200-269`: start and status output use `formatChild`; the snapshot currently contains neither model nor effort.

## Design

The child start input, spawner record and runtime, host adapter, and chat launch now carry chat-supported effort. The snapshot stores model and effort; the existing status/start formatter prints both, using `default` for omission. The Zod tool schema limits effort to the chat SDK values. The runtime model-catalog check remains incomplete.

## Changed files

- `session-tool-args.schema.ts`, `session-tools.ts`, `session-tools.spec.ts`: effort schema, guidance, validation/status tests.
- `session-spawner.port.ts`, `child-chat-session-host.port.ts`, `session-spawner.service.ts`: effort contract, persisted selections, succession pass-through.
- `child-chat-session-host.adapter.ts`, `chat-session.service.ts`: pass effort to the normal chat launch options.
- `session-tool-handlers.ts`: show model and effort in start/status output.
- This report.

## Decisions

- Use the existing chat `EffortLevel` type and refuse `minimal`: the chat launch API does not support it (`ai-provider.types.ts:156`). Options were silent remapping to low or explicit refusal; explicit refusal preserves the caller's intent. Reversible by adding SDK support for minimal. Parent informed.
- Store selections on the existing child snapshot/registry record rather than a second persistence layer. `session-child.registry.ts:33-42` derives the record shape from the snapshot. Reversible.

## Known gaps

- **Unmet model requirement:** explicit model IDs still are not checked against the selected account/runtime catalog before provisioning, and unknown IDs do not yet receive a coded refusal plus accepted values. This needs a host-side validation contract that uses the resolved account's catalog, not a global/static list. Model substitution can still occur downstream. No test for this requirement was added.
- **Unmet effort refusal text:** Zod rejects unsupported effort values, but the generic argument-error response does not yet use a dedicated `invalid-effort` refusal code.
- `session-handoff.service.ts` and `session-handoff-closer.ts` were untouched as required. Live child succession copies model and effort; top-level handoff behavior beyond that boundary was not altered.
- Skill discovery was unavailable in this lane; no optional skill was loaded.

## Verification

- Command: `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers` (one foreground run; exit code 1).
- Projects: `@ptah-extension/vscode-lm-tools`, `@ptah-extension/cli-agent-runtime`, `@ptah-extension/rpc-handlers`.
- Lint/typecheck: 6 succeeded, 0 failed. Tests: 0 of 3 project targets succeeded, 3 failed. Cached Jest logs show a shared environment failure: `moduleNameMapper` points `marked` to missing `node_modules/marked/lib/marked.umd.js`. `cli-agent-runtime`: 86 suites failed, 91 passed (1306 tests passed); `vscode-lm-tools`: 44 suites failed, 63 passed (1251 tests passed); `rpc-handlers`: 129 suites failed, 111 passed (2881 tests passed). The failures are import-resolution errors before the affected suites run; this result does not prove the changed tests pass.
- Tail of verification output: `NX 3 tasks: 0 succeeded, 3 failed`; `nx run @ptah-extension/cli-agent-runtime:test`; `nx run @ptah-extension/vscode-lm-tools:test`; `nx run @ptah-extension/rpc-handlers:test`; `lock released after 787.0s, exit code 1`.
- `ptah_get_diagnostics` after edits was unavailable: TypeScript check still running after its 45s timeout; scoped verify provided the typecheck result.
