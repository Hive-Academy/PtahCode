# G-Onb-Review implementation report

## Files changed

- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts`, `.html`, and `.css` wire the judged results, selection and draft interactions.
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts` covers the composed review with the real store and child components.
- `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts` adds `openBlankManualDraft(options?: { readonly forceDiscardDirty?: boolean }): DraftTransitionResult` under the coordinator's D39 scope extension.

## Plan items done

| Plan reference | Implementation and evidence |
| --- | --- |
| 175–195, 474–555 | Full-width judged grid and sticky bar binding. Coverage and filters read the judged store. Angular tests exercise judged and team-builder layout variants, pinning and hidden count reset. At a 16 px root the grid math gives four Install columns at 1100 px and five at 1440 px. |
| 567, 569 | Per-item and blank manual draft openers use the store's consent, busy and dirty guards. Preview replacement, manual replacement, per-item search, generation retry and Cancel use the same discard confirmation. |
| 568–569, 575 | Store-controlled preview with used slugs, generation and creation messages, mode changes, typed requests, and focus return on Cancel or successful Create. Busy creation guards both preview actions and replacement. |
| 570–573, 578 | Method attribution comes from the recorded judge result. No-judge and outage states expose per-item search, registry candidates and failed-search disclosure. Other candidates follow the store predicate. The tests exercise rejection reason disclosure and selection. |
| D39, design spec 48 and 60 | Find more skills exposes a blank manual draft in judged mode, including the empty result. It starts with empty fields, no item association and a unique key. Creation uses the shared duplicate-slug path and displays the resulting path. |

## Checks

- `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/proposal/team-builder-skill-review.component.spec.ts` passed all 30 tests across both suites.
- `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` passed.
- `npx eslint libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts` returned zero errors and the store's existing `max-lines` warning.
- Scoped `ptah_get_diagnostics` reached its 45-second TypeScript limit and reported HTML and CSS as unsupported. The focused native TypeScript check passed and Jest loaded the Angular template.

## Decisions

| Decision | Options and evidence | Reversible |
| --- | --- | --- |
| Activate judged mode through an optional review `store` input | The optional input gives the analyzed page its own scope and preserves the existing team-builder entry point. Passing every judged signal separately would increase the bindings and make state ownership harder to follow. | Yes |
| Use the native modal dialog for dirty-draft confirmation | Existing webview code documents host limitations with global browser confirmations. Native `dialog` supplies keyboard dismissal, focus containment and an accessible name in the renderer. | Yes |
| Keep Install in a single candidate grid | One canonical card can show several covered items and reasons, as specified by R19. Registry fallbacks remain item-scoped and continue sharing the same store selection identity. | Yes |
| Open the standalone editor with a unique store key | Per-item keys preserve the existing already-created guard. Coordinator decision D39 allows a new blank draft after an earlier blank skill is created, and C5 still checks duplicate slugs. | Yes |

## Contract for G-Onb-Pages

- Bind `[store]="state"` and `[runId]` to the loaded analysis manifest run ID. The judged layout activates once `state.judge()` is present, including method `none`.
- `(draftPreviewRequested)` emits `SkillDraftPreviewAction`, containing `{ params: WizardGenerateSkillDraftParams, revision, previewRequestSeq }`. The review opens or retries the draft before emitting. Call generation with `params` and settle via `applyDraftPreviewResult` or `applyDraftPreviewError` with the same revision and sequence.
- `(draftCreateRequested)` emits `SkillDraftCreateAction`, containing `{ revision, submitted: { name, description, body, slug } }`. The review calls `beginCreateDraft` before emitting. Use the submitted fields for the create RPC and the same revision for `completeCreateDraft` or `failCreateDraft`.
- `(itemSearchRequested)` emits `{ itemId, query }`. Populate `state.setItemSearchResults(itemId, skills)` and reuse the page's searching and error state. General search continues through `(searchRequested)`.
- Keep `(selectionToggled)` wired to the page/store selection toggle. Keep the page-level F29 guard before consent. If the page replaces the review while displaying consent, retain the review or show its blocker alongside consent so the user can read the reason.

## Open items

- Electron visual review remains for the integrated page. The lane's focused-check instructions prohibit launching the app. I inspected the approved judged and draft-preview screenshots for the wide Install and Build grids, inline expanded preview and bottom rail. Jest verifies DOM bindings and interactions. Width, height and sticky behavior in the Electron scrollport still need rendered verification at 1100×1000 and 1440×1000.
- The Install card omits script notes because the judge result and registry entry carry no script metadata. The existing install-consent metadata remains the source of script detail.
- The unmatched list currently emits search by name only. When two visible unmatched items share the same name, search falls back to the general registry search to avoid associating the results with the wrong item. A future item-aware output on that part would remove the ambiguity.
- The anchor receives focus after a draft closes when it remains rendered. If a verdict or stack-item filter hides the originating row once it unpins, focus moves to the review heading.

## Extra reads

- Repository guidance from `CLAUDE.md` and the focused onboarding setup in `team-builder-skill-review.component.spec.ts`.
- Scoped store and coverage definitions in `stack-skill.store.ts` and `stack-coverage.ts`, plus the shared judge/Setup RPC types for exact field names.
- `implementation-plan.md` batch table and Coordinator amendment C1, and `decisions.md` D35 for created-slug checks. The lane did not open the prototype HTML.
- Targeted reads of the unmatched template, the existing Analyze Skills bindings, and neighboring renderer confirmation and focus implementations. The authorized design screenshots were inspected as reference assets.
- `ptah_search_files` returned zero hits for the task folder dot-directory glob. I used one `rg --files` fallback to locate it. The dependency graph was still building when inspected. `angular-frontend-patterns` was disabled by the brief and the host exposed no skill loader. I followed the neighboring Angular components.
