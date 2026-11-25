# P2 review slice B2 fix report

D42's six findings are implemented in the supplied `skill-judge` worktree.

## Files changed

Under `libs/frontend/onboarding/src/lib/`:

- `proposal/stack-skill.store.ts` and `proposal/stack-coverage.spec.ts`
- `proposal/skill-draft-preview.component.ts`
- `proposal/stack-skill-review.component.ts`, `.html`, and `.spec.ts`
- `proposal/unmatched-stack-list.component.ts` and `.html`
- `proposal/skill-not-judged-row.component.ts`
- `proposal/stack-coverage-strip.component.ts` and `.spec.ts`
- `analyze/project-skill-draft.component.ts` and `.spec.ts`

## Findings and regression coverage

Paths below are relative to `libs/frontend/onboarding/src/lib/`. Plan references are to `implementation-plan.md`.

| Finding | Change and location | Regression coverage | Plan |
| --- | --- | --- | --- |
| 1. Stale search data after Re-run | A successful replacement clears current and retained per-item search results, retained general search results, and custom selection keys. The D40 busy and dirty guards run before the resets. `proposal/stack-skill.store.ts:569`, `:602`. | `proposal/stack-coverage.spec.ts:527` verifies that prior manual cards disappear, the selection-bar total source returns to baseline, and the item returns to no match with zero available. The dirty replacement test checks that the old search results remain while confirmation is pending. | Lines 177, 571–572 |
| 2. Discarded edits survive a failed retry | Retry reads the matching proposal and restores its initial name and description with an empty body. A failed retry then regenerates the evidence fallback. `proposal/stack-skill.store.ts:834`, `:846`. | `proposal/stack-coverage.spec.ts:901` verifies all three edited fields are preserved until confirmation and checks that a second failure shows the proposal defaults and fallback evidence. | Lines 198–201, 569 |
| 3. Malformed standalone Create success receipt | Create requires a nonblank string path. An invalid receipt shows the inline Create error, keeps the edited draft, and releases the busy state. `analyze/project-skill-draft.component.ts:88`. | `analyze/project-skill-draft.component.spec.ts:88` covers missing, empty, and whitespace-only paths through the same retained-edits assertions as RPC failure. | Lines 204–205, 569, as refined by D42 |
| 4. Preview/Create byte equality | One helper trims the name and description and preserves the body verbatim. Preview serialization, the emitted submission, and the store snapshot all use it. `proposal/skill-draft-preview.component.ts:28`, `:163`, `proposal/stack-skill.store.ts:1008`. | `proposal/stack-skill-review.component.spec.ts:404` compares rendered Preview bytes with the shared serializer applied to the Create snapshot, including padded metadata and a delimiter-prefixed body. `analyze/project-skill-draft.component.spec.ts:44` verifies trimmed metadata also reaches the standalone RPC. | Section 3.5, lines 452–472 |
| 5. Manual opener stays enabled after Create | Judged unmatched rows receive created item IDs, and Not-judged rows receive a per-item flag. Both disable activation with `aria-disabled="true"` and keep the native button focusable. `proposal/stack-skill-review.component.ts:207`, `.html:203` and `:232`, `proposal/unmatched-stack-list.component.ts:84`, `.html:63`, `proposal/skill-not-judged-row.component.ts:50`. | `proposal/stack-skill-review.component.spec.ts:378` covers Build, No-skill, and Not-judged rows, including focus restoration and ignored repeat clicks. | Lines 567, 569 |
| 6. Expanded coverage collapses on selection | Expansion is linked to an ordered item-key signature. Coverage changes can refresh measurement while preserving expansion, and reordering the keys collapses it. `proposal/stack-coverage-strip.component.ts:50`, `:98`. | `proposal/stack-coverage-strip.component.spec.ts:79` covers focus on expansion, a new array with changed coverage, and a reordered array. | Lines 188, 205 |

## Checks

- Focused Jest passed with 8 suites and 83 tests, including the team-builder review suite.

  ```sh
  npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath \
  libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/skill-draft-preview.component.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/skill-not-judged-row.component.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts \
  libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.spec.ts
  ```

- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` passed.
- Scoped `ptah_get_diagnostics` timed out on TypeScript on both attempts and did not recognize the two HTML templates. The scoped TypeScript and Angular Jest checks supplied verification.
- ESLint exited 0 with zero errors and one `max-lines` warning for the already over-limit `stack-skill.store.ts` (1,033 counted lines, limit 700).

  ```sh
  npx eslint \
  libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts \
  libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/skill-draft-preview.component.ts \
  libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts \
  libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts \
  libs/frontend/onboarding/src/lib/proposal/unmatched-stack-list.component.ts \
  libs/frontend/onboarding/src/lib/proposal/skill-not-judged-row.component.ts \
  libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts \
  libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts \
  libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.ts \
  libs/frontend/onboarding/src/lib/analyze/project-skill-draft.component.spec.ts
  ```

## Decisions

- **Draft metadata normalization.** Share a pure helper in the existing preview module or add a new module. The existing module owns the draft-value shape and is in the lane's write scope. The helper preserves the serializer's verbatim body contract and accepts both the preview input and store draft structurally. Reversible.
- **Created-state inputs.** Pass store paths to each child or pass only the item IDs and a per-row boolean. The latter keeps the store key format and receipt paths in the review container. Reversible.
- **Coverage expansion.** Use an item-key signature as the source of a writable linked signal or store previous keys in the measurement effect. The linked signal models expansion directly as state tied to item identity and keeps measurement on input changes. Reversible.

## Open items and cross-lane changes

- Electron screenshot verification was outside this lane's focused-check scope. The Angular Jest fixtures verified rendered draft bytes, opener ARIA and focus behavior, and coverage expansion.
- D40's page-side work is an independent lane per `decisions.md:44–46`.

## Extra reads

- `CLAUDE.md` for focused lane verification rules and `decisions.md:44–46` for D40 and D42.
- `proposal/stack-coverage.ts` for the draft snapshot and search-result coverage paths, `proposal/stack-coverage-strip.component.html` for chip selectors, and `proposal/skill-build-row.component.ts` / `.spec.ts` for the existing focusable-disabled opener convention.
- `ptah_search_files` returned no hits for the hidden task brief glob. Read the two known brief paths through `ptah.files.read`. The dependents graph was incomplete, so targeted source searches and the prescribed team-builder suite checked the affected call paths.
