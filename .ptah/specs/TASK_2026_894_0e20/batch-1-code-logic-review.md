# Batch 1 – Code Logic Review (removal of codexAutoCompactTokens / codexToolOutputTokenLimit)

## Verdict
**APPROVED, 7/10.** The removal is complete and the new mapping is correct for defaults and valid input. I found no Blocking or Serious defects. Four Moderate/Minor issues remain, mainly stale fallbacks and doc text.

Evidence for the score: `rg` over `libs apps` finds no remaining reference to either key. The default of 127500 is computed correctly. A stored `0` degrades to a warning plus the default, with no crash. A 7 rather than an 8 because of the `120000` fallbacks and the new `?` typo in the docs.

## Findings

1. **Moderate** – `apps/ptah-electron/src/di/codex-lane-composition.ts:147` and `libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.ts:160`
   - Evidence: the fallback used when `options.laneBudgets` is absent is still `autoCompactTokens: 120000`. The new global default is 127500, which is `CODEX_DEFAULT_LANE_BUDGETS`.
   - Impact: any lane started without budgets uses the old 120000. This is inconsistent with the spec requirement of floor(0.85 × 150000).
   - Fix: import `CODEX_DEFAULT_LANE_BUDGETS` (or the shared defaults) into both files. If a cross-lib import is not allowed, change the literal to `127500`.

2. **Minor** – `libs/shared/src/lib/types/rpc/rpc-agents.types.ts:403-404` and `:652-653`
   - Evidence: the field removal left the two orphaned JSDoc blocks ("Codex lane `model_auto_compact_token_limit` …" and "`tool_output_token_limit` …") stacked above `laneRepeatCallStopAt`.
   - Impact: a stale doc comment that mentions the removed fields. TypeScript attaches only the last JSDoc block, so there is no functional effect.
   - Fix: delete the four orphaned doc lines.

3. **Minor** – `apps/ptah-docs/src/content/docs/settings/context-management.md:92`
   - Evidence: the text reads `floor(**Budget warning ratio** ? **Agent handoff context**)`. The `?` is a literal U+003F, not a multiplication sign.
   - Impact: the rendered doc is wrong.
   - Fix: use `×` or `*`.

4. **Minor** – `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-lane-budgets.ts:70`
   - Evidence: `Math.floor((ratio ?? 0.85) as number * ((context ?? 150000) as number))`.
     - Precedence is correct: `as` binds tighter than `*`, so it parses as `((ratio ?? 0.85) as number) * (...)`.
     - Ranges are looser than the registry: ratio is accepted in (0, 1) against a registry range of 0.01–0.99, and context is accepted for any positive integer against 1000–2,000,000. A stored 0.5 with context 1 gives `floor(0.5) = 0`. Codex then omits the key (the thread config uses a truthy check), which is a silent "Codex default".
     - Float rounding can floor one token low for some ratios (for example `0.29 × 100` gives 28.999…). 0.85 × 150000 is exactly 127500, so the default is fine.
     - The `as number` casts are redundant for TypeScript purposes. The coding standard discourages casts, but they are narrowed by the validity checks above.
   - Impact: edge cases only.
   - Fix (optional):
     - Validate against the registry min/max, or clamp the result to at least 1.
     - Use `Math.floor(ratio * context + 1e-9)`, or narrow the variables instead of casting.

## Five logic questions
1. **Completeness.** Pass. `rg "codexAutoCompactTokens|codexToolOutputTokenLimit"` over `libs apps` (and the repo root, excluding hidden dirs) returns nothing. The following were removed:
   - `ADVANCED_SETTINGS` entries;
   - the `KNOWN_CONFIG_KEYS` and `FILE_BASED_SETTINGS_KEYS` entries;
   - `SCOPED_SETTING_KEYS`;
   - the RPC fields;
   - the handler's validation, getConfig and setConfig;
   - the doc table rows.
   - `FILE_BASED_SETTINGS_DEFAULTS` had no entries for them.
2. **Mapping.** Pass.
   - `resolveLaneBudgets` reads `agentBudget.warnRatio`, `agentBudget.handoffContextTokens` and `compaction.toolOutputBudgetTokens`.
   - The defaults match the registry: 0.85, 150000, 2500.
   - Warnings are deduplicated through `warnedLaneGuard`.
   - Previously `resolveCodexLaneBudgets` was only used in specs. In production the raw values passed straight through and were not validated. It is now wired in, which is an improvement.
3. **0 behaviour.**
   - A stored `toolOutputBudgetTokens` of 0 (or a negative, non-integer or string value) gives a warning plus 2500, with no throw.
   - Ratio or context set to 0 gives a warning plus 127500.
   - The registry min is 100 and 1000, so 0 was never a legal value for the global keys.
   - `codex-execution-profile.ts` still accepts nonnegative values downstream, which is harmless.
4. **RPC contract.** No remaining reader or sender of the removed fields in `libs/frontend`, `apps/ptah-electron`, `libs/backend/platform-cli` or `libs/backend/cli-engine`. `rg` shows only the `autoCompactTokens` lane-budget plumbing, which is internal and unchanged. The frontend renders the `codex-agents` group from the registry, so it needs no change; the group now contains only `codexWebSearch`.
5. **Import of an old file.** Pass. `settings-import.service.ts:111-115` never applies `data.config`. It only pushes every key into `skipped`, so legacy keys cannot fail an import. Export just stops emitting them.

## Tests
I did not run the tests. By reading the diff:
- `codex-lane-budgets.spec.ts` asserts the 127500 default, the invalid-input fallback and warnings (`toolOutputTokenLimit: 0` gives a default plus a warning).
- `agent-process-manager.service.spec.ts` asserts that `handoffContextTokens: 100000` gives 85000, so it reads the global key.
- `settings-routing.spec.ts`, `file-settings-keys.spec.ts`, `settings-export.types.spec.ts`, `advanced-settings.types.spec.ts` and `agent-rpc.handlers.set-config.spec.ts` were updated to the removal.
- Not covered:
  - finding 1 (the composition fallbacks);
  - the float and zero-floor edge in finding 4.

## Checked
- Full `git diff` of all 16 files.
- `rg` for the removed keys and for `autoCompactTokens`, `laneBudgets` and `resolveCodexLaneBudgets` consumers.
- Registry ranges for the three global keys.
- The settings import and export paths.
- The docs diff.
- Not run: diagnostics, tests and builds (per instruction).
- Remaining uncertainty: the handler diff middle section was only partly visible in the output. The grep evidence shows no remaining references.
