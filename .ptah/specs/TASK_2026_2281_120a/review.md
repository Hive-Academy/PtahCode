# Review: TASK_2026_2281_120a (child-session model floor)

**Verdict: PASS WITH FIXES.** I found no blocker. The main requirements hold. These are the weak spots, in order of severity: deep-work fallback, silent loss of the floor when the router fails, and misleading status reasons.

I reviewed by reading the code. I did not run jest, tsc or eslint; I relied on the implementer's report for those results.

## Findings

| # | Severity | File:line | Problem | Suggested fix |
| --- | --- | --- | --- | --- |
| 1 | major | `lane-routing/.../child-model-tier.ts:35-43`, used from `child-setting-rule.ts:43` | `childModelCandidates` returns an empty list when no model exists at or above the floor tier. For a deep-work rule (tier 2) with no Opus/pro-class model in the catalog, the result is empty. That covers a catalog with only Sonnet, or a third-party catalog such as GLM or Kimi. The spawner then uses the host default model (`child-setting-resolution.ts:89`), and the default can be a small model. A balanced model is available and meets the (a) floor, but it is never tried. The plan (line 136) says "next stronger, never weaker", so this follows the plan, but it contradicts outcome (a). The tests only cover "missing balanced promotes to strong". | For deep rules, fall back downward to tier 1 (never to tier 0) when tier 2 is empty. Keep the tier-0 exclusion. Add a test with a Sonnet-only catalog and a deep phase. |
| 2 | major | `child-setting-resolution.ts:74-111` (catch at 106), `child-setting-router.service.ts:18-25,44` | If `router.route` throws, nothing is applied: the model and the effort are both left to the host default, and the failure is only logged as a warning. This happens when the router is null, when the Zod parse fails, or when a single catalog id is over 200 characters (`models: z.array(z.string().max(200))` rejects the whole input). Code work then silently gets the unrouted default effort, possibly low, with no floor. No `settingReason` is recorded either. | In the catch, set effort to `high` when the caller gave none, with `effortSource: 'ranking'`. Set `settingReason` to a rule such as `router-unavailable`. In Zod, drop or filter bad model ids instead of throwing. |
| 3 | minor | `child-setting-rule.ts:48` | When the caller pins a model, `models` is `[]`. The reason then reports `catalog-empty` even though a catalog exists and the model was pinned. This misleads the "why" shown in status (outcome d). For a full pin the reason is `pin`, so only a partial pin is affected. | Compute `catalog-empty` only when the caller did not pin a model. |
| 4 | minor | `child-model-tier.ts:14-16` | `version()` strips only a trailing 8-digit date. Ids with a dashed date suffix, such as `gemini-2.5-pro-preview-05-06` or `gpt-4o-2024-08-06`, parse as extra version components. The preview or dated id then outranks the GA id. | Strip `-\d{4}-\d{2}-\d{2}` and `-\d{2}-\d{2}` suffixes too. |
| 5 | minor | `child-model-tier.ts:27-32` | The 1M-window preference only works for ids in the native `claude-cli` static list, or for `claude-haiku-4-5` and `claude-3*`. Copilot ids (`claude-sonnet-4.6`, 200k) and other third-party ids have an unknown window. A same-tier pair of 200k and 1M models there is not filtered, and only version order separates them. Outcome (f) is only met for native ids. | Document this limit, or read the window from the profile's model metadata when it is available. |
| 6 | minor | `child-setting-rule.ts:35` | Text guessing still exists in the `deep-work-text` rule, but it only runs when there is no kind, and it can only raise the tier to strong. It cannot produce small/low. This is acceptable. The `design` keyword also matches ordinary prose, so some unknown-kind work is over-spent, which is harmless. | None, or restrict the match to the label line. |
| 7 | minor | `child-setting-router.service.ts:63-64,186` | `floor` is derived from `fallback.effort === 'low'`, so coordination is the only route to floor 0. That is correct. But the clamp treats `childModelTier(...) ?? -1` as below the floor, so an alias such as `default` from the decision model is clamped. That is correct behaviour; I mention it only so it is not mistaken for a bug. | None. |

## Checked and found correct

- **(a) Floor:** The `rankChildSettings` rule table (`child-setting-rule.ts:24-50`) never produces tier 0 or `low` unless `workKind === 'coordination'` and `phaseKind` is not a code or deep phase. A coordination workKind combined with an implement or review phase falls through to the code or deep rule. Deep phases and the `investigation`, `design` and `security` kinds map to tier 2 at `high`. Code kinds and phases map to tier 1 at `high`.
- **(b) Coordination only:** Small tier with low effort comes from `workKind === 'coordination'` and nowhere else. The old regex on "coordinat"/"git" is gone.
- **(c) Unknown kind:** The default is tier 1 at `high` (`unknown-kind-floor`).
- **(d) Why:** The reason `{ rule, input }` is carried through the router, the spawner snapshot and the start/status formatter. The spawner records `routed-model-refused` when all candidates are refused. Legacy records show `reason unavailable`. Only finding 3 is a gap.
- **(e) Pins:**
  - The router keeps a pinned model or effort per field (`child-setting-router.service.ts:46-61`).
  - If both are pinned it returns early with no decision call.
  - The resolution layer admits a pinned model before routing, then tries candidates in order. A model pin is not replaced by `routed.model`.
  - Pin-only validation is unchanged.
- **Tier ordering:**
  - `claude-sonnet-5-5` ([5,5]) sorts above `claude-sonnet-5` ([5]), which sorts above `claude-sonnet-4-6`. A trailing 8-digit date is stripped.
  - Dots (Copilot `claude-opus-5.5`) work because only digit runs are matched.
  - `default` returns no tier. `fable` is tier 3 and pin-only for automatic selection, which is also enforced in the decision options.
  - The tier tokens `pro`, `flash`, `mini` and `lite` are split on separators and digits, so ids like `gpt-4o-mini` or `gemini-2.5-flash` classify correctly.
- **(f) 1M window:** Within a tier, 200k-window ids are excluded when a 1M id exists. This holds for native ids (finding 5 covers the rest).
- **Decision model clamp:**
  - The options offered to the decision model are limited to the floor.
  - `clampChildSettingDecision` re-clamps both model and effort.
  - A below-floor answer reverts to the ranked value with rule `decision-model-below-floor`.
  - Timeout and error paths return the ranked result.
- **(g) Native ids and aliases:**
  - `nativeChildModelIds` unions the SDK catalog, the static models and the default tiers.
  - `resolveNativeTierAlias` resolves opus/sonnet/haiku through `defaultTiers` and fable through the highest `claude-fable-N-M` id.
  - `isNativeChildModelProfile` reproduces the previous native test exactly. Named accounts and third-party profiles still go through `getModelsForProviderProfile` or `getSupportedModels`.
  - The shared entry has `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` and `claude-fable-5-2`.
- **Retry on refusal:** The candidate loop de-duplicates ids, tries each in order, and records `routed-model-refused` while keeping the effort floor.
- **Tests:** No test case was removed. `it(`/`test(` counts per changed spec, before and after: spawner 111→111, router 9→16, rule 5→13, chat-session-agent-child 46→50, contract sweep 37→37, session-tools 71→78. Only blank lines were removed.
- **Project rules:**
  - No `any`, `as any` or `as unknown as`, and no `console` use in the new or changed lib sources I grepped.
  - Error handlers use `catch (error: unknown)`, and none are empty.
  - No new file is near 700 lines. `session-spawner.service.ts` went 3066→3015, `chat-session.service.ts` 3486→3474 and `session-tool-handlers.ts` 827→826, so none of the already oversized files grew.
  - `libs/shared` is unchanged. The new code uses the public barrel `getAnthropicProvider`, with no deep imports.
  - No Windows home path appears in the tracked files I grepped.
- **Schema boundary:** `workKind` is a closed Zod enum in both the tool schema and the router `Input`.

## Notes and uncertainty

- The implementer reports that no stdio session-start dispatcher exists in this checkout. I did not verify that, and I treat it as an accepted plan deviation.
- I did not run any test, tsc or eslint. Findings 1 and 2 are traced by reading and are not demonstrated by a failing test.
