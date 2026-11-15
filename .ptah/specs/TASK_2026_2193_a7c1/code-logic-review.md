# Code logic review: TASK_2026_2193_a7c1

Scope: stack-summary.extractor.ts, skill-recommendation.service.ts, multi-phase-analysis.service.ts, analyze-skills.page.ts,
stack-skill.store.ts, project-skill-draft.component.ts, stack-skill-consent component, route redirects, step links, wording.
No test was run. I read the code and traced the failure paths. The RPC handler and the manifest/guard specs are out of scope (known).

## Verdict: CHANGES REQUESTED (no Blocker, 1 Major, 4 Minor)

Score: 7/10. The main flow is sound. One state bug hides an error message. Several smaller gaps remain.

## Five logic questions (short answers)

1. Does the happy path work? Yes by trace: analysis -> RPC -> review -> preview -> install -> guidance.
2. Does failure stay safe? Mostly. The legacy extractor never throws (JSON.parse is inside try, regex is bounded). Per-item search failures are not reported as "unmatched" (skill-recommendation.service.ts:97).
3. Is stale async state handled? Yes for load, search, preview, install (version guard). Draft create uses a revision guard.
4. Is consent kept? Yes. Install is blocked until every `hasScripts` preview is approved (analyze-skills.page.ts:168). Consent records use the preview hash.
5. Is a write possible without a click? No. `harness:create-skill` is called only from `create()` (project-skill-draft.component.ts:54). No `[innerHTML]` is used in onboarding.

## Findings

### Major

**M1. The "Choose a completed analysis first." error is erased on first render.**
`analyze-skills.page.ts:93-99` sets the error in `ngOnInit`. The constructor effect (`:78-89`) runs afterward.
On its first run, `key` is `"\u0000"` and `identity` is `''`, so the guard does not return. The effect then calls `this.state.reset()`, which sets `error` to `null`.
Result: a user without a loaded analysis sees an empty page with no message. The spec has no test for this case.
Fix: seed `identity` with the same format as `key` (for example `private identity = '\u0000';`), or move the error into a computed value or a separate signal that `reset()` does not clear. Add a spec for "no analysis loaded shows the error".

### Minor

**m1. One bad block drops valid items of the other phase.**
`stack-summary.extractor.ts:29-41` returns an empty summary when one phase block is malformed or has a wrong `sourcePhase`.
A single model mistake in architecture-assessment removes valid project-profile items. The warning is logged, but the user sees "none".
Fix: `continue` (skip that phase, record the warning) instead of `return`. Keep the legacy fallback only when no phase gave a block.

**m2. Short or generic terms can match unrelated skills.**
`skill-recommendation.service.ts:104-109`: `recommend()` requires `keyword.length >= 2` (`:157`), but `recommendAnalysis()` has no such guard.
Items such as `C++`, `C#`, `R` give the term `c` or `r`. Any skill with the token `c`, `r` or `go` matches. The evidence is then only the item name.
Fix: skip matching (treat as unmatched) when `term.length < 2`. Require the full token for terms shorter than 3 characters.

**m3. Dead extraction work after analysis.**
`multi-phase-analysis.service.ts:425-439` reads both phase files and runs the extractor. The result is only written to a debug log.
`toResponse` also logs the extractor warning a second time (`analysis-storage.service.ts:726-729`). This costs file reads and noise.
Fix: remove the block, or store the summary in the manifest if a later consumer needs it.

**m4. Draft is reset when the recommendation result is reloaded.**
`project-skill-draft.component.ts:37-45`: the effect resets name, description and content whenever the `item` input reference changes.
After "Retry skill search", `summary` gets new item objects with the same `kind+name`. `@for` keeps the component, so the input changes and the user's edit is lost without notice.
Fix: reset only when `item().kind + item().name` changes (use a `computed` key), not on reference change.

### Observations (no change required)

- `analyze-skills.page.ts:180-184`: after a partial install failure, `installed` is set and the review stage returns. A second Continue re-installs all selected skills. Acceptable, but consider showing which skills succeeded.
- `skill-recommendation.service.ts:96`: an item whose name appears twice with different kinds is searched twice and may add two failure rows. Cosmetic.
- `searchFailures.reason` is raw `error.message` (`:90`). It goes to the UI. Prefer a fixed string such as "Search failed" or "Search timed out".
- `searchWithTimeout` leaves its timer running for 8 s if `search()` throws synchronously (`:44-50`). Harmless.
- Draft create overwrites an existing skill with the same slug without a warning (backend `createSkillPlugin`). The UI slug rule matches the backend sanitiser, so the shown destination is correct.

## Checked and correct

- Extractor: Zod `strictObject`, 30 item cap, name 100 and evidence 300 limits, 16 KB block cap, exactly one block per phase, input caps (200 KB, 1000 lines) in legacy mode. The legacy path has no throwing call.
- Recommendation: dedupe by `source/skillId` keeping the higher score. A failed search is separate from "no match". Concurrency is 4 with an 8 s timeout. The team-builder `recommend()` keeps its package.json path and only adds the timeout wrapper (diff shows one changed line).
- Page: `version` and `searchVersion` guard late responses. Workspace or run change resets the store and cancels old responses. `onDestroy` increments `version`.
- Routes: `analyze/agents` and `analyze/generate` use `redirectTo: 'analyze/skills'`. Angular keeps query params on a redirect, so `tab` and `analysis` survive. Step links carry `analysis`, `tab`, `run` inside the analyze flow.
- Team builder uses `StackSkillStore` and the extracted review and consent components with no behavior change.
- Wording: no stale "choose or generate agents" text in onboarding or chat settings sources. The remaining hits are the legacy route mapping in `core/routing/onboarding-routes.ts` (intended) and specs.

## Decisions

- Treated the extractor strictness (drop the whole summary on invalid data) as a design choice, not a defect. It is reported as m1 because the loss is wider than needed. Reversible.
