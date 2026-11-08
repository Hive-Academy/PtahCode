# Code Logic Review - TASK_2026_CLAUDE_CLI_MODEL_TIER

Verdict: REVISE (confidence MEDIUM). The turnUsage change is correct and safe. It does not address the likeliest cause of the reported symptom, and one test is only a characterization test.

## Findings

1. SERIOUS - `modelTier` is silently dropped for `cli: "claude"`.
   - `protocol-dispatcher.ts:1329-1330` forwards `modelTier`. A grep of non-spec files under `cli-agents/` finds no use of `modelTier` anywhere. `resolveModel` (`agent-spawn-environment.service.ts:179-196`) takes only `cli` and `request.model`.
   - With no `model`, `claude-cli.adapter.ts:184` uses `input.model || defaults.model || ''`. `claude-cli.adapter.ts:253` then deletes `options.model`, so the SDK default applies (Sonnet).
   - A caller passing `modelTier:"haiku"` with `cli:"claude"` therefore silently gets Sonnet. That matches the reported symptom.
   - The tool description (`tool-description.builder.ts:633-634`) says "Only applies to Ptah CLI agents". The `modelTier` schema field (`tool-description.builder.ts:709`) is offered with no per-CLI guard.
   - The dispatcher log (`protocol-dispatcher.ts:1278`) prints `modelTier: 'sonnet'` as a default even for system CLIs, which is misleading.
   - The report documents this but changes nothing. The fix covers only usage labelling, so the user's symptom can recur.
   - Recommended options (a decision for the coordinator, reversible):
     - (a) Map `modelTier` to `model` for `cli:"claude"` when `model` is unset.
     - (b) Return a warning or error when `modelTier` is passed with a system CLI, and log the real default instead of `'sonnet'`.
   - Otherwise state in the PR that the tier gap is left unresolved.

2. MODERATE - The `model` label is dropped on mixed turns, but consumers keep the previous label.
   - The `turnUsage` change (`ptah-cli-stream-loop.service.ts:820`) omits `model` when the SDK reports 2 or more model keys. The aggregate is correct to leave unlabelled, but the consumers handle the gap in different ways.
   - `cli-usage.utils.ts:66` (`usage.model ?? base.model`) keeps an earlier single-model label, so the lane total can show "haiku" after Sonnet tokens were added.
   - `lane-completion-outcome.ts:157` falls back to `info.model`, which is the requested alias (e.g. `haiku`), and records the whole aggregate cost under that model id. This is the same misattribution in the usage-analytics path.
   - `agent-monitor.store.ts:378` returns undefined cost when `model` is undefined and there is no `estimatedCostUsd`. The `costUsd` path still works.
   - No consumer crashes on undefined. Mixed usage is attributed to the wrong model in `lane-completion-outcome.ts` and shown with a stale label in `cli-usage.utils.ts`.
   - Better: emit per-model breakdown, or label with the dominant model, or make the completion outcome record `modelId: null` when mixed.

3. LOW - Cumulative delta logic is unchanged and correct.
   - `previousModelUsage` is the sum over all keys, so a changing key set only grows the cumulative total, and `Math.max(0, ...)` guards resets.
   - The single-key label is read from the current cumulative key set, so a delta turn can be labelled with a model that produced zero of that turn's delta. This is tolerable.
   - The unused `model` variable is still used by the fallback path (line 831), so it is not dead.
   - The fallback path still uses the stream `turnModel ?? sessionModel`, which is exactly the stale-label behaviour fixed on the primary path. It is acceptable only for old SDKs.

4. MODERATE - The adapter spec is not a regression test.
   - `claude-cli.adapter.spec.ts:326` passes `model:'haiku'` and expects the SDK `options.model` to be `haiku`. There is no production change in `claude-cli.adapter.ts`, so this passes before and after the fix.
   - It documents that `model` works. It does not cover the broken path, which is `modelTier` or no model with settings defaults.
   - Add a test for the chosen finding-1 behaviour.

5. OK - Stream-loop tests (`ptah-cli-stream-loop.service.spec.ts:706,709`).
   - The mixed-model `not.toHaveProperty('model')` assertion and the "stale stream model" test would both fail on the old code, because the old code stamped `turnModel` (sonnet).
   - The existing "attaches the turn usage" test still passes, since its `modelUsage` key is `claude-sonnet-4-6`.

6. MINOR - Test and formatting hygiene.
   - The new Haiku test uses `as unknown as SDKMessage` (`ptah-cli-stream-loop.service.spec.ts` ~line 722), which is against the repo rule. The spec already has 24 such casts, so it is a pre-existing pattern. A typed factory would be cleaner.
   - `ptah-cli-stream-loop.service.ts:820` and the spec `manyMessages([...])` lines exceed 80 columns and may fail prettier. The coordinator should run the lint step.
   - `modelUsageEntries.map(([, usage]) => usage)` could be `Object.values` plus a separate keys length.

7. NOTE - The root cause is not proven for the original incident.
   - If the user passed `model:"haiku"`, Ptah did forward it (`agent-process-manager.service.ts:925`, `claude-cli.adapter.ts:184`).
   - The Sonnet usage may then be SDK subagents or Task calls, or the stale label bug. That is plausible and now fixed for attribution.
   - A live check with `cli:"claude"`, `model:"haiku"` and a one-word task is still advisable.
   - Resume (`resumeSessionId`) keeps the original session model in the SDK, which the report did not check.

## Round 1 re-review

Verdict: APPROVE (confidence MEDIUM). Findings 1, 2 (shared part), 4 and 5 are resolved. Three non-blocking notes follow.

Resolution of earlier findings:
- F1 resolved. `agent-spawn-environment.service.ts:186-187` uses `requestModel?.trim() || (cli === 'claude' ? modelTier : undefined)`, so an explicit model wins and other CLIs ignore the tier. `agent-process-manager.service.ts:925-929` passes the tier. The tool description and the dispatcher log were corrected.
- F2 partly resolved. `cli-usage.utils.ts:67` no longer keeps a stale label. `lane-completion-outcome.ts:157` is deferred to the other batch (agreed out of scope).
- F4 resolved. Tier-only and explicit-wins tests were added.
- F6 formatting: the adapter line 184 (`const model = input.model?.trim() || input.modelTier || defaults.model || '';`) exceeds 80 columns. Run lint.

Questions asked:
- Tier beats the configured claude setting: correct. `MODEL_CONFIG_KEYS` has no `claude` entry (it only lists codex, copilot, cursor, antigravity, opencode, pi, grok, ...), so the manager's setting lookup never applied to claude. The setting is read only by the adapter (`defaults.model`), and the manager passes the resolved model as `input.model` (`agent-process-manager.service.ts:1062`). An explicit per-spawn tier outranking a global default is the right priority.
- Adapter fallback order `input.model?.trim() || input.modelTier || defaults.model`: correct order, but `input.modelTier` is dead from the spawn path. The manager only forwards `model: resolvedModel`; `modelTier` appears in the manager only at line 928, not in the adapter input. The `ClaudeCliCommandOptions.modelTier` addition is reachable only by direct adapter callers. It is harmless, but it is a second source of truth. Drop it or note it.
- Resume: a tier on a resumed lane now sets `options.model` where before it was ignored. The SDK may switch the model on resume. This matches how an explicit `model` already behaves, but an unrequested resume with a stale tier can change model silently. Low risk; the tool description could say the tier applies on resume.
- ptahCliId lanes are unchanged. They go through the Ptah CLI stream-loop path and `resolveModel` only touches `cli === 'claude'`.

New notes:
1. MODERATE: `cli-usage.utils.ts:67` clears the model label whenever a later usage carries `costUsd` without `model`. A CLI that reports its model once and later sends cost-only updates now loses the label. Check the other producers (codex, grok, cursor) of `CliOutputSegment.usage` before shipping. A narrower fix is to clear only for the aggregate Claude path, or to mark mixed usage explicitly.
2. MINOR: the preflight in `agent-process-manager.service.ts:812` calls `resolveModel(input.cli, input.model)` without the tier. The blocked-model check therefore never sees a tier alias. Blocked models are specific ids, so this is only an inconsistency.
3. MINOR: the one-off live Haiku-tier check from `report.md` is still outstanding.

## Round 2 re-review

Verdict: APPROVE (confidence MEDIUM-HIGH). The three requested checks pass, and no new defect was found.

- Preflight: `agent-process-manager.service.ts:810,812-817` now passes `modelTier` into `resolveModel` before `assertLaneModelAllowed`, so it is consistent with `doSpawnSdk` (line 925-929). The new spec at `agent-process-manager.service.spec.ts` ~1862 covers a tier-resolved blocked model. Only the Ptah CLI SDK-handle caller uses this path, and `resolveModel` ignores the tier for non-claude CLIs, so there is no behaviour change today.
- Adapter field removed: `claude-cli.adapter.ts:184` is `input.model?.trim() || defaults.model || ''`. A grep of `modelTier` in the runtime, agent-sdk and apps shows no remaining adapter use. The remaining hits are the manager, the spawn environment, the Ptah CLI registry and spawn options (separate `ptahCliId` path), `sdk-query-options-builder.ts` and specs. `claude-cli.adapter.spec.ts:316` asserts that `modelTier` is not leaked into SDK options. The `.trim()` on `input.model` is a harmless improvement.
- `cli-usage.utils.ts:67,79`: the label is cleared only when the report carries token fields (`hasTokenUsage`), and cost-only or duration-only reports keep it. This resolves round 1 note 1. Codex cost-only updates keep the label. The OpenCode and Antigravity token reports never carry a model, so there is nothing to lose. Claude's mixed-turn aggregate clears a prior single-model label, as intended.
- Minor, not blocking: a model-less token report from a CLI that labeled earlier reports would now clear the label. No producer found does this.
- Still outstanding, not part of this round: `lane-completion-outcome.ts:157` (other batch) and the paid live Haiku-tier check.
