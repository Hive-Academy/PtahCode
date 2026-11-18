# Independent code review

Verdict: **changes required**.

Reviewed the 16-file uncommitted diff and its consumers by reading source. Did not rely on lane-report.md. No source edits, test runs, verification commands, builds, installs, commits, or pushes were performed.

## Findings

### P2 — Runtime-default Claude sessions lose the repeated-compaction handoff trigger

**Changed location:** `libs/backend/agent-sdk/src/lib/helpers/auto-compact-control.ts:67`.

Changing the Claude default to null also changes a policy input, not just the SDK settings payload. At `libs/backend/agent-sdk/src/lib/sdk-agent-adapter.ts:1327`, each compact boundary derives `effectiveAutoCompactWindowTokens` solely from `resolveAutoCompactControl(...).effectiveWindow`. With neither a user threshold nor an environment override, this now always supplies null for Claude. `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget.service.ts:417` passes that value into the budget evaluation, and `libs/backend/agent-sdk/src/lib/helpers/session-budget/session-budget-stage.ts:160-165` requires a non-null effective window before `handoffAfterCompactions` can promote the session to handoff.

Consequently, default Claude sessions can repeatedly compact without ever activating that handoff trigger, even when the runtime knows its threshold and compaction leaves at least half that window occupied. For example, with a 200k runtime window, three compactions leaving 100k tokens and spend still in the normal band previously promoted to handoff; after this change the stage stays normal. Spend-based escalation still works, but the separate repeated-compaction safeguard is silently disabled. The existing stage test at `session-budget-stage.spec.ts:217-227` explicitly demonstrates the different null versus numeric behavior; the changed resolver/argv tests do not exercise this integration.

**Suggested fix:** Keep the outgoing `autoCompactWindow` absent, but supply the budget policy with the actual runtime auto-compaction threshold (for example through the existing `getContextUsage()` capability), including any session tighten override. Add a regression covering a Claude session with no configured threshold: after enough compact boundaries with a sufficiently large remaining context, its budget stage must still promote to handoff. Do not restore the forced 200k SDK setting as the fix.

## Checked and found correct

- Enumerated production consumers of `AdvancedNumberSetting`, `ADVANCED_SETTINGS`, `findAdvancedSetting`, `validateAdvancedSettingValue`, `AdvancedSettingValidation`, and `FILE_BASED_SETTINGS_DEFAULTS` across libs and apps. The defaults derivation excludes null; agent-budget defaults remain numeric, with an explicit guard in `agent-budget-policy.ts`. The legacy agent-budget migration accesses only descriptors whose defaults remain numbers.
- `settings:set` validates the optional threshold and converts its null reset value to undefined. Both Electron and CLI workspace providers route the existing allow-listed key to the shared file settings manager. Its unflatten-and-JSON serialization omits the undefined threshold property, so clearing removes the key rather than persisting null (an empty parent object may remain).
- Configuration notifications reach the threshold watcher. `applyAutoCompactConfig` sends a null flag window on clear, while preserving a session-budget override. Tighten reads the runtime threshold before and after applying a target; unsuccessful tighten reverts safely to null when no user window exists. These paths already support nullable windows.
- `compaction-config-provider.ts` treats stored null as unset and rejects out-of-range/noninteger stored thresholds with a warning and runtime fallback. The renderer leaves stored null blank; invalid stored numbers remain visible with a stored-value notice. It does not render the string "null" or calculate a numeric value from null.
- Renderer draft/save comparisons normalize absent saved values to null. Empty optional input validates as a reset; both Undo back to unset and Undo after clearing carry the correct wire values. Invalid previous values are excluded from Undo. The field retains a label and described help explaining the empty/default behavior; the placeholder is supplemental. OnPush, signals, built-in control flow, and the absence of new innerHTML usage are preserved.
- Export skips undefined thresholds. Configuration import is currently unsupported and skips config entries, so it introduces no new null write path. No separate production registry consumer for settings search or global reset was found in the requested trees.
- Context meters use model context-capacity data rather than this removed fallback. Idle compaction explicitly handles an unknown effective window; memory-curator has no numeric dependency on `A1_DEFAULT_WINDOW`.
- Changed specs retain exact payload, reset, validation, and Undo assertions; default-expectation changes match the intended SDK behavior. The budget integration above remains uncovered. Specs were read, not executed.
- The new documentation's setting name, range, unset default, and distinction from idle compaction match the implementation. A duplicated explanatory paragraph is nonblocking and is not raised as a finding.

## Review limits

This was a read-only source review while verification was running. No runtime behavior or rendered UI was exercised. The CLI exposes no native skill-loading/discovery interface; the local Angular frontend patterns SKILL.md was read directly for template review. Ptah AST inspection rejected its initial argument; targeted native file reads and rg were used as the fallback.
