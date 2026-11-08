# CLI lane permission defaults: code review, round 2

## Verdict

**CHANGES REQUIRED — 6/10.** The resume cap, Ptah CLI validation, UI confirmation, shared pair selection, and extraction are materially improved. Two persistence failure paths and OpenCode's inherited MCP config still need correction. This is above the prior 5 because the original plan-cap escape is closed; it remains below 7 because settings can diverge and an inherited configuration is still lost. This is a source review; the coordinator owns scoped verification.

## Status of the nine prior findings

| # | Status | Code evidence and remaining impact | Test pin |
|---|---|---|---|
| 1. Resume plan cap | **FIXED** | `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:47-52` caps the snapshot before validation, including Codex network. | Resolver spec `:71-84` tests system and Ptah cases; no full resumer-to-adapter cap test. |
| 2. Codex two-key writes/concurrency | **PARTIAL** | `agent-rpc.handlers.ts:907-916` serializes handler calls. `agent-config/cli-lane-defaults-config.ts:107-122` restores the canonical key if the legacy write rejects. It never restores a legacy write that mutates and then rejects, and an initial canonical write that mutates then rejects bypasses rollback entirely. | Set-config spec `:273-295` covers concurrency and a legacy rejection before mutation only. |
| 3. Reset yolo confirmation | **FIXED** | `cli-lane-default-cell.component.ts:60,93-101` describes the built-in default and confirms a yolo reset before emitting. | Cell spec `:64-85` covers cancel/confirm. |
| 4. Ptah CLI validation | **FIXED** | `cli-lane-defaults-config.ts:90-96` uses the Ptah CLI capability constant; `libs/shared/src/lib/types/cli-lane-defaults.types.ts:53-62` rejects network deny. | Set-config spec `:298-302` pins rejection. |
| 5. Reset read-back after partial failure | **PARTIAL** | `cli-lane-defaults-config.ts:110-122` clears legacy and reads back on success. The rollback gap in finding 2 means a legacy write that clears then rejects can leave the old canonical row and cleared legacy key; read-back is not returned on failure. | Set-config spec `:241-270,285-295` covers successful reset and rejection before mutation, not partial mutation. |
| 6. OpenCode inherited config | **PARTIAL** | `opencode-cli.adapter.ts:710-723` parses and merges inherited JSON in the no-MCP yolo branch, refusing malformed JSON. The MCP branch at `:701-709` still replaces `OPENCODE_CONFIG_CONTENT` with a fresh object from `:616-638`. | Adapter specs exercise the no-MCP merge and MCP generation separately; no inherited-plus-MCP preservation test. |
| 7. UI/runtime partial-pair disagreement | **FIXED** | `cli-lane-default-cell.component.ts:57-70` and `cli-lane-policy-resolver.ts:54-58` call the same `resolveCliLaneDefaultPair` (`libs/shared/src/lib/types/cli-lane-defaults.types.ts:31-50`). Unsupported pairs are shown. | Shared helper spec and cell spec `:101-104` cover this. |
| 8. God-file growth | **FIXED** | Persistence moved to `agent-config/cli-lane-defaults-config.ts:1-123`; UI save/reset moved to `cli-lane-defaults.store.ts:1-32`. Facades still contain routing glue only. | Structural change; no dedicated test required. |
| 9. DOM casts | **FIXED** | `cli-lane-default-cell.component.ts:73-87` parses select strings with the shared Zod field schemas before emitting. | Cell selection spec `:87-99` covers a valid selection; no invalid DOM-value test. |

## New and remaining findings

### Serious

1. **The two-key write is recoverable only for a clean rejection.** `cli-lane-defaults-config.ts:111-120` assumes the first write succeeded and the second did not change storage. A provider can persist a value and then reject (for example, a failed post-write notification). A canonical write that rejects at `:111` leaves it changed with no rollback. A legacy write that mutates and rejects at `:113` is never restored. The handler returns failure while Codex chat and lanes may read different policies. Snapshot both raw keys, attempt restoration of both keys after either failure, verify read-back, and report an aggregate error if recovery cannot be established. Add tests with mutation-before-rejection for each key, including reset.

2. **OpenCode still discards inherited inline config whenever Ptah MCP is present.** `opencode-cli.adapter.ts:701-709` calls `buildMcpConfigContent`, which creates only `permission` and `mcp.ptah` at `:623-638`; it ignores `process.env.OPENCODE_CONFIG_CONTENT`. An existing provider/plugin/MCP entry disappears from the child process, including in normal plan runs. Parse and validate inherited JSON in both branches, merge `mcp.ptah` into the inherited `mcp` object, and refuse malformed JSON with a diagnostic. Pin inherited-plus-MCP and malformed-plus-MCP tests.

### Moderate

3. **An explicit spawn request can be rejected by a stale saved pair before the override wins.** `cli-lane-policy-resolver.ts:54-60` calls the shared pair resolver on saved values and throws at `:58` before applying `input.request`. If a previously valid saved pair becomes unsupported after a CLI update, even a fully specified, supported explicit permission/network request is rejected. Resolve the final field-by-field request first and validate that final pair, while still rejecting unsupported saved fields that actually contribute to it. Add an explicit-override-versus-stale-saved test.

4. **The settings commit check can report success without checking a complete row.** `providers-settings-state.service.ts:921-927` compares only fields present in the patch. When a row update implicitly retains an old field, the read-back does not check that retained field; a partial or concurrent external change can be reported as committed. Compare the complete expected row after merge against read-back or use the RPC's returned persisted map. This is most relevant to partial row edits and Undo.

## Boundary and style notes

- `cli-detection.service.ts:177` changed solely to inject the existing logger into the OpenCode adapter so malformed config can be reported; this is related to the feature.
- `ptah-api-builder.service.ts:551-558` uses an optional injected `CodexChatAdapter` token. The new parent-level lookup at `:721-726` does not introduce a new `container.resolve`; the existing service already resolves other tokens at `:708,1239-1269`. `agent-namespace.builder.ts:550-565` strips caller-supplied `parentLevel` and `resumePolicy` before forwarding. The raw parent identity is sourced from the MCP transport at `:364-372` for MCP calls.
- The new UI cell is standalone, OnPush, and signal-based (`cli-lane-default-cell.component.ts:10-14,47-70`). The store does not optimistically mark a choice saved (`cli-lane-defaults.store.ts:13-30`); the component resets a select to its persisted effective value before emitting (`cli-lane-default-cell.component.ts:73-87`). Confirmation has text and button controls. There is no new `any`, `@ts-ignore`, `as unknown as`, or deep cross-project import in these extracted files.
- No source or spec files were edited during this review. I inspected `git diff main`/`git status --untracked-files=all` and source/spec paths; I did not run builds, tests, or diagnostics because the coordinator is running verification. No skill loader/catalogue was exposed to this lane, so no optional skill was loaded.

## Five logic questions

1. **Silent failure:** a settings provider that mutates then rejects can leave Codex canonical/legacy state divergent (finding 1).
2. **Unexpected action:** reset now confirms a yolo built-in; a stale saved pair can still block an explicit supported spawn (finding 3).
3. **Wrong input answer:** partial-row read-back may claim success without verifying the full persisted row (finding 4).
4. **Dependency failure:** OpenCode MCP injection overwrites inherited inline configuration, including for plan (finding 2).
5. **Missing requirement:** recovery after a partially applied settings write needs an explicit rollback/read-back contract (finding 1).

## Behavior changes for users (PR description)

- Without a saved choice, each CLI lane uses its strongest *manifest-supported* permission/network pair. OpenCode, Grok, and Cursor now default to full auto: OpenCode uses `--auto` and permission allow, Grok uses `--always-approve`, and Cursor disables its sandbox. Codex's built-in default is full access when no legacy setting exists. Claude, Copilot, Antigravity and Ptah CLI providers also take their strongest advertised mode; Pi has no verified permission mode and receives none.
- Existing `codexSandboxMode` values are projected into Codex lane defaults. Setting/resetting a Codex lane default updates/clears the legacy setting. The separate Copilot auto-approve bridge setting remains independent.
- Explicit spawn permission/network fields override defaults field by field, subject to manifest validation and the parent plan cap. Resume reuses its prior policy snapshot, then applies the current parent plan cap. Codex plan lanes deny network.
- Settings > CLI tools adds per-CLI saved defaults, supported options, confirmation for full auto (including reset to a full-auto built-in), Undo, and reset. Ptah CLI providers share one default.

## Feature commit file list

Stage the feature paths below explicitly, including untracked source and specs. Do not stage unrelated docs, screenshots, canvas files, or `.ptah/specs/TASK_2026_892_7d2e/`.

- `apps/ptah-electron/src/di/codex-lane-composition.{ts,spec.ts}`
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.{ts,spec.ts}`
- `libs/backend/cli-agent-runtime/src/index.ts`; `src/lib/cli-agents/{agent-process-manager.service.ts,agent-spawn-environment.service.ts,cli-detection.service.ts,cli-lane-policy-resolver.ts,cli-lane-policy-resolver.spec.ts,lane-spawn-policy.ts}`; `src/lib/cli-agents/cli-adapters/{cursor-cli.adapter.ts,cursor-cli.adapter.spec.ts,grok-cli.adapter.ts,opencode-cli.adapter.ts,opencode-cli.adapter.spec.ts,pi-cli.adapter.ts,grok/grok-acp-profile.ts,grok/grok-acp-profile.spec.ts}`; `src/lib/cli-agents/messaging/lane-resumers/{ptah-cli-lane-resumer.ts,system-cli-lane-resumer.ts,system-cli-lane-resumer.spec.ts}`; `src/lib/ptah-cli/{ptah-cli-registry.ts,ptah-cli-registry-permission-routing.spec.ts}`
- `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts`; `libs/backend/platform-core/src/{file-settings-keys.ts,file-settings-keys.spec.ts}`
- `libs/backend/rpc-handlers/src/lib/handlers/{agent-rpc.handlers.ts,agent-rpc.handlers.set-config.spec.ts,agent-config/cli-lane-defaults-config.ts}`
- `libs/backend/vscode-lm-tools/src/lib/code-execution/{ptah-api-builder.service.ts,ptah-api-builder.service.spec.ts,namespace-builders/agent-namespace.builder.ts,namespace-builders/agent-namespace.builder.spec.ts}`
- `libs/frontend/chat/src/lib/settings/ptah-ai/{cli-orchestration-matrix.component.ts,cli-orchestration-matrix.component.spec.ts,cli-lane-default-cell.component.ts,cli-lane-default-cell.component.spec.ts,cli-lane-defaults.store.ts}`; `libs/frontend/core/src/lib/services/{providers-settings-state.service.ts,providers-settings.types.ts}`
- `libs/shared/src/index.ts`; `libs/shared/src/lib/types/{agent-process.types.ts,cli-lane-defaults.types.ts,cli-lane-defaults.types.spec.ts,rpc.types.ts,rpc/rpc-agents.types.ts}`
- `.ptah/specs/TASK_2026_CLI_PERMISSION_DEFAULTS/`: `implementation-plan.md`, `research-native-permission-flags.md`, `permission-routing-audit.md`, `research-report.md`, `impl-report-backend.md`, `impl-report-backend-2.md`, `impl-report-frontend.md`, `impl-report-review-fixes-backend.md`, `impl-report-review-fixes-frontend.md`, `code-review.md`, `code-review-round-2.md`. These are feature task documents; include them if task evidence is committed with the feature.

## Decisions

- Treat a mutation followed by write rejection as an unsuccessful transaction requiring both-key recovery. A narrower alternative assumes rejected writes never mutate. The storage interface does not guarantee that assumption; this is reversible in the helper.
- Treat fully specified explicit spawn fields as overriding stale saved fields. The alternative rejects any stale saved setting, even when unused. The stated precedence favors the explicit request; this is reversible in the resolver.
