# Independent code review — CLI lane permission defaults

## Verdict

**CHANGES REQUIRED — 5/10.** The resolver validates manifest pairs and the UI filters selectable modes, but the parent cap, persistence, and reset paths have user-visible failure cases. This is below a sound 7–8 because plan parents can resume a wider lane and settings can diverge after a failed write; it is above a foundational 1–2 because fresh spawns generally resolve and validate through one shared function.

## Findings

### Blocking

1. **Resume bypasses the parent plan cap.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-lane-policy-resolver.ts:57-66` returns `resumePolicy` before applying `parentLevel === 'plan'`. `system-cli-lane-resumer.ts:39-41` and `ptah-cli-lane-resumer.ts:100` pass the previous effective policy as that snapshot. A plan chat can resume a previously yolo lane and run it at yolo. Apply the current trusted parent cap to the snapshot before manifest validation; keep the snapshot for all other fields. Add a plan-parent resume test for system and Ptah CLI lanes.

### Serious

2. **Codex writes can leave the canonical and legacy settings divergent.** `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:1158-1179` writes `codexSandboxMode` and `cliLaneDefaults` in separate awaits, with no transaction or rollback. A failed second write can return an error after the first setting changed; a failed legacy write after the canonical write makes Codex lane and chat readers disagree. Concurrent calls also read, merge, and replace the full map at `:1014-1036,1162`, so editing different CLI rows can lose an update. Serialize one read-modify-write operation and make the compatibility update atomic or recoverable; return read-back of the persisted state after failure.

3. **Reset to the built-in yolo default skips confirmation.** `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:84-91` confirms only a proposed choice with permission `yolo`. `cli-orchestration-matrix.component.ts:1327-1333` resets directly with a null patch. A user who saved plan can click Reset and immediately re-enable yolo on Codex, OpenCode, Grok, Cursor, or other yolo-capable CLIs without the promised confirmation. Route reset through the same confirmation when the manifest-derived default is yolo, and disclose the resulting effective mode in the reset action.

4. **Ptah CLI defaults are accepted without capability validation.** `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:1039-1044` skips `ptah-cli` because it has no adapter in `cliDetection`. The schema permits `{network:'deny'}` or a pair the provider manifest cannot enforce; the settings UI can persist this via RPC even though `ptah-cli-registry.ts:804-808` later resolves it and rejects a spawn. Validate against the shared Ptah CLI provider capability contract before saving, or refuse unsupported combinations at the RPC boundary.

### Moderate

5. **A Codex reset can reappear as saved after a partial failure.** `agent-rpc.handlers.ts:1021-1024,1161-1165` first removes the canonical row, then clears the legacy key. `getCliLaneDefaults()` at `:2051-2072` projects any surviving legacy value back into the returned map. If clearing legacy fails, read-back still shows the old saved choice despite the reset having modified the canonical setting. Couple the writes and explicitly verify read-back on reset.

6. **OpenCode overwrites an inherited inline config in the no-MCP case.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts:699-709` sets `OPENCODE_CONFIG_CONTENT` to only `{permission:'allow'}` for yolo when no Ptah MCP token is present. If the process inherited inline OpenCode configuration, that content is lost. Parse and merge the existing config before adding permission; retain its MCP and other keys, and report malformed input rather than silently replacing it.

7. **UI and backend can disagree about a partial saved choice.** `cli-lane-default-cell.component.ts:57-68` derives a displayed permission compatible with a saved network. The resolver at `cli-lane-policy-resolver.ts:59-69` instead takes the strongest built-in permission independently, then validates the pair. For a network-only saved value, the UI can show a plausible mode while spawn rejects the combination. Use the shared resolver for displayed effective choices, or explicitly display the rejected combination and refuse it at save time.

### Minor / style

8. **Large files grew further.** `agent-rpc.handlers.ts:1009-1049,1158-1179,2028-2072` adds merge, validation, projection and migration to an existing file of roughly 2,200 lines; `cli-orchestration-matrix.component.ts:1304-1334` adds save/reset logic to roughly 1,370 lines. Extract focused policy persistence and UI state helpers behind these facades.

9. **The UI boundary uses casts instead of schema parsing.** `cli-lane-default-cell.component.ts:71-82` casts select values to permission/network types, although DOM values are strings. Membership checks prevent invalid emission, but parsing with the shared enums would satisfy the boundary rule and keep the reason for rejection explicit.

## Five logic questions

1. **Silent failure:** concurrent map writes lose another CLI row (`agent-rpc.handlers.ts:1014-1036,1162`); the UI may still show a valid-looking partial choice (`cli-lane-default-cell.component.ts:57-68`).
2. **Unexpected user action:** Reset can enable yolo without confirmation (`cli-orchestration-matrix.component.ts:1327-1333`); resuming under a plan chat can restore yolo (`cli-lane-policy-resolver.ts:57`).
3. **Wrong input answer:** a Ptah CLI unsupported policy can be saved (`agent-rpc.handlers.ts:1041`); a network-only saved pair can be displayed differently from runtime resolution (`cli-lane-default-cell.component.ts:57-68`).
4. **Dependency failure:** an interrupted settings write leaves canonical and legacy Codex values divergent (`agent-rpc.handlers.ts:1158-1179`); malformed saved defaults cause parsing to throw (`cli-lane-policy-resolver.ts:58`).
5. **Missing requirement:** resetting to an auto default needs the same risk confirmation as selecting it (`cli-lane-default-cell.component.ts:84-91`).

## Behavior changes for users

- With no saved choice, the strongest manifest-supported pair is now selected. OpenCode, Grok, and Cursor gain full-auto/yolo behavior; OpenCode receives `--auto` and permission allow, Grok receives `--always-approve`, and Cursor disables its local sandbox.
- Codex defaults to yolo/full access through the built-in policy when no legacy value is saved. Existing legacy Codex values are projected into the new lane default and continue to influence the lane; a reset clears that legacy value if both writes succeed.
- Claude, Copilot, Antigravity, and Ptah CLI providers also use the strongest advertised mode when no default is saved. This may change previously native/SDK-dependent behavior; Copilot's separate `copilotAutoApprove` bridge remains separate. Pi has no verified permission mode, so no built-in permission is synthesized.
- Explicit spawn permission or network values take precedence field by field. Unsupported resulting pairs are refused rather than silently widened. A plan chat caps fresh lane permissions to plan where the manifest supports plan; the resume exception is the blocking finding above.
- Settings now offers per-CLI saved defaults and null reset. Ptah CLI providers share one default; the UI shows only manifest-supported options and asks for confirmation on a selected yolo option.

## Review scope and evidence

Read `git status --short --untracked-files=all`, `git diff main`, the implementation plan and three implementation reports, the native-flags research, repository guidance, and changed resolver, RPC, adapter, host wiring, and Settings UI paths. I did not run builds or tests because the coordinator is doing scoped verification. `ptah_code_search_symbols` returned a zero-symbol index, so native `rg` was used for usages. No skill catalogue or loader was exposed to this lane, so the Angular skill could not be loaded. The implementation reports describe passing targeted tests; this review judges the source paths above.

The worktree also contains unrelated changes versus `main` in docs, canvas, and an older task folder; they are outside this feature review. Untracked source/spec files under `cli-agent-runtime`, `frontend/chat`, and `shared` are part of this feature and must be included if it is committed. Untracked `permission-routing-audit.md` and `research-report.md` in this task folder need an explicit inclusion decision; the named implementation reports, plan, and native-flags research are task artifacts, not source. Do not sweep the unrelated worktree changes into this feature commit.

## Decisions

- Treat reset to a manifest-derived yolo default as a yolo action. Alternative: exempt reset. Evidence: reset invokes no confirm while setting yolo does. Reversible UI rule.
- Treat a saved resume snapshot as subject to the current parent plan cap. Alternative: preserve snapshot unconditionally. Evidence: the stated parent cap and resolver early return. Reversible resolver ordering.
