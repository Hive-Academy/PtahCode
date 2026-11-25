# Batch Report — G-Onb-Store-Coverage (W9, TASK_2026_2325_899d)

Status: COMPLETE

## Files Changed
All edits stayed strictly within the 6 assigned write files:
- `libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts` (modified)
- `libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts` (modified)
- `libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts` (modified)
- `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts` (modified)
- `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.html` (modified)
- `libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts` (modified)

## Plan Items Done
- **Immutable `analysisPair` & `judge`, canonical `selectedCandidateIds` mapped to `selectionKey` at consent boundary, Install-only pre-selection (D5), and R19 unified coverage (`implementation-plan.md:177`, `decisions.md` R14/R19):**
  - `StackSkillStore` records frozen `analysisPair` (preserved across Re-run per R14) and cloned `judge`.
  - `applyRecommendationResult` pre-selects only valid non-deprecated `install` verdicts (empty when `method === 'none'`).
  - `selectedCandidateIds` holds canonical lowercased `source/skillId` keys; `selectedIds` / `selectedSelectionKeys` map to original-case `selectionKey` at the consent boundary while keeping legacy unjudged team-builder callers compatible.
  - `selectedCandidateIdsByItemId` unifies judge Install outcomes, item registry pool candidates, and per-item manual search results (`setItemSearchResults`), feeding `stackCoverage` and `coveredItemCount`.
  - `buildStackCoverage` and `buildJudgedStackCoverage` mark any item with selected coverage as `state: 'covered'` while preserving `originalSearchFailed: true` so chips show `"Covered - original search failed"` (replaces `stack-coverage.ts:63-94`).
- **R16 item rows & residual-pool `"Other candidates"` predicate (`implementation-plan.md:573`, `decisions.md` R16):**
  - `itemRows`, `displayedCandidateIdsInVerdictOrItemRows`, `residualCandidates`, `computeResidualCandidates(displayedIds)`, and `showOtherCandidatesSection` (`judge.method !== 'none' && verdictFilter === 'all' && residualCandidates.length > 0`).
- **F28 hidden-candidate counts (`implementation-plan.md:193,573`, `design-spec.md:263-264`):**
  - `hiddenPoolCandidateCount` counts every distinct run-pool candidate hidden by the active `verdictFilter` / `activeItemId` filter (not only `"Other candidates"`).
  - `verdictFilter` uses `SkillVerdictFilterValue` imported from `./skill-verdict-filter.component`; `verdictCounts` and `verdictFilterOptions` provide item-unit filter counts.
- **F29 / R17 mutual exclusion between consent and draft in both orders (`implementation-plan.md:194,575`, `decisions.md` R17/R20):**
  - `draftOpen`, `consentOpen`, `canOpenConsent`, `canOpenDraft`, `installBlockedReason` (`"Finish or cancel the open skill draft before installing"`), `draftBlockedReason` (`"Close the install consent dialog before opening a skill draft"`).
  - `openConsent` / `setStage('consent')` / `setPreviewing(true)` are guarded when `draftOpen()`; `openProposalDraft` / `openManualDraft` return `{ status: 'blocked', reason }` when `consentOpen() || previewing()`.
  - `toggle` / `toggleCandidate` clear `preview`, clear `approvedIds`, and close consent (`stage -> 'review'`).
- **F30 pinned open draft row across filter changes (`implementation-plan.md:195,569`, `design-spec.md:268-270`):**
  - `pinnedDraftProposalId`, `pinnedDraftItemId`, `visibleProposals`, and `visibleItemRows` keep the open draft's row/proposal pinned across verdict and item filter changes.
  - While `openDraft.busy === true`, `setDraftMode`, `updateDraftFields`, `closeDraft`, `requestCloseDraftForItemSearch`, `beginRetryDraftGeneration`, `openProposalDraft`, and `openManualDraft` reject without prompting a dirty dialog.
- **R18 dirty-draft guards, `submitted` snapshot, duplicate Create & stale Preview guards, and TD 3.8 manual draft opener (`implementation-plan.md:190,198-201,567,569`, `decisions.md` R18/R23):**
  - All 4 R18 triggers (`preview-draft`, `manual-draft`, `item-search`, `retry-generation`) plus `close` return `{ status: 'confirm-dirty', trigger }` when `openDraft.dirty === true` unless `forceDiscardDirty: true` is passed.
  - `openManualDraft(itemId, options?)` opens `mode: 'edit'` with `skillDocumentSlug(item.name)` and deterministic `## Project evidence` (no generic template, D5) for any detected stack item.
  - `applyDraftPreviewResult` / `applyDraftPreviewError` guard against stale/late responses via `revision` + `previewRequestSeq`, and automatically open `mode: 'edit'` with deterministic `## Project evidence` + linked Build reasons on generation failure.
  - `beginCreateDraft` freezes `submitted = { name, description, body, slug }` and blocks duplicate/busy/invalid Create; `completeCreateDraft` derives path from `skillPath` or `submitted.slug`, records `createdPathsByKey`, closes the draft, and blocks second Create (`already-created`, F25); `failCreateDraft` keeps edits open, clears `busy`/`submitted`, and sets `createError`.
- **C5 (D35) `createdSkillSlugs` read-only signal:**
  - `createdSkillSlugs: Signal<readonly string[]>` tracks normalized slugs created in this run (populated by `completeCreateDraft` and `recordCreatedSkillSlug`, cleared on `reset()`), ready for `SkillDraftPreviewComponent`'s `[usedSlugs]` input.
- **Judged coverage status words, F23 measured 2-line strip, and parity GAP 27-29 (`implementation-plan.md:188,205`, `design-spec.md:106-112,131,246-248`):**
  - `StackCoverageStripComponent` renders judged verdict labels (`Install`, `Build`, `Install + Build`, `No skill needed`, `Not judged`), registry facts (`no match`, `not searched`, `search failed`, `N available`, `N selected`, `Covered - original search failed`), and dual-fact `aria-label`s (`"<name>, <kind>. Registry: ... Verdict: ..."`).
  - Enforces at most 2 lines of chips via one strip-level `ResizeObserver` (disconnected in `DestroyRef.onDestroy`) with a 12-chip fallback when layout geometry is unavailable; `"Show N more"` moves focus to the first newly shown chip.
  - Verified parity GAP 27 (loading skeletons + live status), GAP 28 (overflow + focus move), and GAP 29 (distinct chip identity for equal names of different kinds).

## Store API (for G-Onb-Rail, G-Onb-Review, G-Onb-Pages)

### Exported Types & Constants (`proposal/stack-skill.store.ts` & `proposal/stack-coverage.ts`)
- `StackSkillStage = 'intent' | 'review' | 'consent' | 'installing' | 'launching'`
- `SkillVerdictFilterValue` (imported from `./skill-verdict-filter.component` & re-exported; alias `SkillVerdictFilter`) = `'all' | 'install' | 'build' | 'no-skill' | 'not-judged'`
- `SkillVerdictFilterOption` (imported from `./skill-verdict-filter.component` & re-exported) = `{ readonly value: SkillVerdictFilterValue; readonly count: number }`
- `SkillDraftMode` (imported from `./skill-draft-preview.component` & re-exported) = `'preview' | 'edit'`
- `SkillDraftKind = 'proposal' | 'manual'`
- `DraftReplaceTrigger = 'preview-draft' | 'manual-draft' | 'item-search' | 'retry-generation' | 'close'`
- `SkillDraftSubmittedSnapshot = { readonly name: string; readonly description: string; readonly body: string; readonly slug: string }`
- `SkillDraftGenerationError = { readonly category: 'no-model' | 'empty-output' | 'timed-out' | 'provider-error' | 'invalid-output' | 'invalid-pair' | 'rpc-error'; readonly message: string; readonly retryable: boolean }`
- `OpenSkillDraft`: `{ key, kind, itemId, proposalId, coveredItemIds, mode, name, description, body, dirty, busy, previewLoading, revision, previewRequestSeq, submitted, generationError, createError, pairUsed }`
- `DraftTransitionResult`: `{ status: 'ok', draft } | { status: 'closed' } | { status: 'blocked', reason } | { status: 'busy' } | { status: 'confirm-dirty', trigger } | { status: 'already-created', path }`
- `SkillVerdictCounts`: `{ all, install, build, buildProposals, noSkill, notJudged }`
- `JudgeItemCandidateView`, `JudgeItemRowView`, `ResidualCandidateView`, `StackCoverageItem`, `StackCoverageVerdict`
- `INSTALL_BLOCKED_BY_DRAFT_REASON = 'Finish or cancel the open skill draft before installing'`
- `DRAFT_BLOCKED_BY_CONSENT_REASON = 'Close the install consent dialog before opening a skill draft'`

### Read-Only Signals on `StackSkillStore`
- **Legacy / shared:** `intent: Signal<string>`, `stage: Signal<StackSkillStage>`, `selectedIds: Signal<ReadonlySet<string>>` (consent-boundary `selectionKey`s), `previewing: Signal<boolean>`, `loading: Signal<boolean>`, `error: Signal<string | null>`, `recommendations: Signal<SkillRecommendation[]>`, `searchResults: Signal<SkillShEntry[]>`, `retainedSearchResults: Signal<SkillShEntry[]>`, `searchQuery: Signal<string>`, `searching: Signal<boolean>`, `searchError: Signal<string | null>`, `guidanceFacts: Signal<ProjectGuidance[]>`, `ownerDecisionPrompt: Signal<string>`, `ownerDecision: Signal<'match' | 'raise' | null>`, `guidanceNote: Signal<string>`, `preview: Signal<WizardSkillConsentPreview[]>`, `approvedIds: Signal<ReadonlySet<string>>`, `installed: Signal<string[]>`, `previewScriptCount: Signal<number | null>`
- **Judged run & selection:**
  - `analysisPair: Signal<Readonly<ModelPair> | null>`
  - `judge: Signal<SkillJudgeResult | null>`
  - `judgedMode: Signal<boolean>`
  - `selectedCandidateIds: Signal<ReadonlySet<string>>` (canonical lowercase `source/skillId`)
  - `selectedSelectionKeys: Signal<readonly string[]>`
  - `candidateById: Signal<ReadonlyMap<string, SkillJudgeCandidate>>`
  - `selectionKeyByCandidateId: Signal<ReadonlyMap<string, string>>`
  - `itemSearchResultsByItemId: Signal<ReadonlyMap<string, readonly SkillShEntry[]>>`
  - `retainedItemSearchResultsByItemId: Signal<ReadonlyMap<string, readonly SkillShEntry[]>>`
- **Coverage (R19):**
  - `manualCandidateIdsByItemId: Signal<ReadonlyMap<string, ReadonlySet<string>>>`
  - `selectedCandidateIdsByItemId: Signal<ReadonlyMap<string, ReadonlySet<string>>>`
  - `stackCoverage: Signal<readonly StackCoverageItem[]>`
  - `coveredItemCount: Signal<number>`
- **Filters, R16 item rows & F28 hidden counts:**
  - `verdictFilter: Signal<SkillVerdictFilterValue>`
  - `activeItemId: Signal<string | null>`
  - `verdictCounts: Signal<SkillVerdictCounts>`
  - `verdictFilterOptions: Signal<readonly SkillVerdictFilterOption[]>`
  - `itemRows: Signal<readonly JudgeItemRowView[]>`
  - `visibleItemRows: Signal<readonly JudgeItemRowView[]>` (F30-pinned)
  - `visibleProposals: Signal<readonly SkillBuildProposal[]>` (F30-pinned)
  - `displayedCandidateIdsInVerdictOrItemRows: Signal<ReadonlySet<string>>`
  - `residualCandidates: Signal<readonly ResidualCandidateView[]>`
  - `showOtherCandidatesSection: Signal<boolean>`
  - `hiddenPoolCandidateCount: Signal<number>`
- **F29 mutual exclusion:**
  - `draftOpen: Signal<boolean>`
  - `consentOpen: Signal<boolean>`
  - `canOpenConsent: Signal<boolean>`
  - `canOpenDraft: Signal<boolean>`
  - `installBlockedReason: Signal<string | null>`
  - `draftBlockedReason: Signal<string | null>`
- **Draft & C5 created slugs:**
  - `openDraft: Signal<OpenSkillDraft | null>`
  - `pinnedDraftProposalId: Signal<string | null>`
  - `pinnedDraftItemId: Signal<string | null>`
  - `createdPathsByKey: Signal<ReadonlyMap<string, string>>`
  - `createdSkillSlugs: Signal<readonly string[]>`

### Methods on `StackSkillStore`
- **Judged run & filters:**
  - `applyRecommendationResult(result: WizardRecommendAnalysisSkillsResult): void`
  - `setAnalysisPair(pair: ModelPair | null): void`
  - `setJudge(judge: SkillJudgeResult | null): void`
  - `setVerdictFilter(filter: SkillVerdictFilterValue): void`
  - `setActiveItemId(itemId: string | null): void`
  - `resetVerdictFilter(): void`
  - `resetFilters(): void`
  - `computeResidualCandidates(displayedCandidateIds: ReadonlySet<string>): readonly ResidualCandidateView[]`
- **Selection, per-item search & consent:**
  - `toggle(id: string): void`
  - `toggleCandidate(candidateId: string): void`
  - `isCandidateSelected(keyOrSkill: string | Pick<SkillShEntry, 'source' | 'skillId'>): boolean`
  - `setSelectedIds(value: ReadonlySet<string>): void`
  - `setSelectedCandidateIds(value: ReadonlySet<string>): void`
  - `setItemSearchResults(itemId: string, value: readonly SkillShEntry[]): void`
  - `clearItemSearchResults(itemId?: string): void`
  - `openConsent(previews: readonly WizardSkillConsentPreview[]): boolean`
  - `closeConsent(): void`
  - `approve(id: string): void`
- **Draft lifecycle & C5:**
  - `openProposalDraft(proposalId: string, options?: { readonly forceDiscardDirty?: boolean }): DraftTransitionResult`
  - `openManualDraft(itemId: string, options?: { readonly item?: StackSummaryItem; readonly forceDiscardDirty?: boolean }): DraftTransitionResult`
  - `requestCloseDraftForItemSearch(options?: { readonly forceDiscardDirty?: boolean }): DraftTransitionResult`
  - `beginRetryDraftGeneration(options?: { readonly forceDiscardDirty?: boolean }): DraftTransitionResult`
  - `closeDraft(options?: { readonly forceDiscardDirty?: boolean }): DraftTransitionResult`
  - `setDraftMode(mode: SkillDraftMode): boolean`
  - `updateDraftFields(patch: Partial<Pick<OpenSkillDraft, 'name' | 'description' | 'body'>>): boolean`
  - `applyDraftPreviewResult(request: { readonly revision: number; readonly previewRequestSeq: number }, result: WizardGenerateSkillDraftResult): boolean`
  - `applyDraftPreviewError(request: { readonly revision: number; readonly previewRequestSeq: number }, message: string): boolean`
  - `beginCreateDraft(): { readonly revision: number; readonly submitted: SkillDraftSubmittedSnapshot } | null`
  - `completeCreateDraft(revision: number, skillPath?: string): string | null`
  - `failCreateDraft(revision: number, message: string): boolean`
  - `createdPathFor(key: string): string | null`
  - `recordCreatedSkillSlug(slugOrName: string): void`
- **Legacy setters & reset:** `setPreviewing`, `setIntent`, `setStage`, `setLoading`, `setError`, `setRecommendations`, `setSearchResults`, `setSearchQuery`, `setSearching`, `setSearchError`, `setGuidanceFacts`, `setOwnerDecisionPrompt`, `setOwnerDecision`, `setGuidanceNote`, `setPreview`, `setApprovedIds`, `setInstalled`, `reset`.

## Checks
1. **Jest (scoped specs):**
   - Command: `npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts`
   - Result: **PASS** — 2 passed suites, 23 passed tests, 0 failed (`JEST_EXIT=0`).
   - Note: No separate `stack-skill.store.spec.ts` exists in the repo; full behavioral unit tests for `StackSkillStore` were added to `stack-coverage.spec.ts` to keep all edits within the 6 allowed files.
2. **TypeScript typecheck:**
   - Command: `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json`
   - Result: **PASS** — 0 errors (`TSC_EXIT=0`).
   - Note on `ptah_get_diagnostics`: Called twice scoped to the 5 changed TS files; both calls returned `TypeScript check still running after 45s` (unavailable within timeout). `npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json` verified the entire `onboarding` library cleanly.
3. **ESLint:**
   - Command: `npx eslint libs/frontend/onboarding/src/lib/proposal/stack-skill.store.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage.spec.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.ts libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.html libs/frontend/onboarding/src/lib/proposal/stack-coverage-strip.component.spec.ts`
   - Result: **PASS** — 0 errors, 1 warning (`max-lines` on `stack-skill.store.ts`: 992 non-comment lines vs 700 advisory limit; kept in one file because this lane is restricted to the 6 existing files). `ESLINT_EXIT=0`.

## Decisions
| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep `selectedIds` as a computed consent-boundary `ReadonlySet<string>` backed by canonical `selectedCandidateIds` | Separate mutable sets (drift risk); computed `selectedIds` mapping canonical IDs through `selectionKeyByCandidateId` | `implementation-plan.md:177` (canonical `selectedCandidateIds` mapped to `selectionKey` only at consent boundary) and `team-builder-start.page.ts` (`selectedIds()` exact-case usage) | Yes |
| Preserve `createdSkillSlugs` & `createdPathsByKey` across in-run `applyRecommendationResult` (Re-run), clear on `reset()` | Clear on Re-run; keep during same run and clear on `reset()` | Skills created via `harness:create-skill` remain on disk across Re-run of the same analysis; C5 (D35) warns before overwriting a slug created in this run | Yes |
| Derive judged `selectedCandidateIdsByItemId` strictly from `judgeItem.outcomes`, `judgeItem.candidateIds`, and `manualCandidateIdsByItemId` (not legacy `recommendations` evidence strings) | Include legacy `splitStackEvidence(rec.evidence)` fallback; rely strictly on typed judge & manual maps | Prevents stale string evidence from wrongly marking a `search-failed` item covered; matches `implementation-plan.md:177` typed map rule | Yes |
| Use `item.itemId ?? `${item.kind}:${item.name}`` as chip filter key and `descriptionId` source in `StackCoverageStripComponent` | Always `kind:name`; prefer `itemId` when present | Preserves unjudged team-builder `kind:name` filter keys (`stack-skill-review.component.ts:109`) while giving judged items stable `itemId` identity (GAP 29) | Yes |
| Place `StackSkillStore` unit tests inside `stack-coverage.spec.ts` | Skip store tests; create 7th file; colocate in `stack-coverage.spec.ts` | Brief restricts write files to 6 existing files and explicitly checks for existing store specs | Yes |

## Open Items & Needed Changes in Other Groups
- **`G-Onb-Rail` (`skill-selection-rail.component.ts/.html`):** Accept `installBlockedReason = input<string | null>(null)` from the review component / `StackSkillStore.installBlockedReason()` and disable Install with the visible reason while a draft is open (F29).
- **`G-Onb-Review` (`stack-skill-review.component.ts/.html`):**
  - Wire `StackCoverageStripComponent` to `store.stackCoverage()` and `store.activeItemId()` in judged mode; keep `buildStackCoverage(...)` for unjudged team-builder mode.
  - Wire `SkillVerdictFilterComponent` to `store.verdictFilter()`, `store.verdictFilterOptions()`, and `store.hiddenPoolCandidateCount()`.
  - Wire `SkillDraftPreviewComponent` to `store.openDraft()`, `store.createdSkillSlugs()` (`[usedSlugs]`), `store.setDraftMode(...)`, and `store.updateDraftFields(...)`.
  - Disable `"Preview draft"` and `"Write a skill by hand"` and display `store.draftBlockedReason()` when non-null (F29).
  - Use `store.visibleItemRows()` and `store.visibleProposals()` so open drafts remain pinned across filter changes (F30), and render `"Other candidates"` iff `store.showOtherCandidatesSection()` (R16).
- **`G-Onb-Pages` (`analyze-skills.page.ts`):**
  - Replace select-all (`analyze-skills.page.ts:250-257`) with `state.applyRecommendationResult(response.data)`.
  - Guard `preview()` against `state.draftOpen()` (F29) and use `state.openConsent(...)` / `state.closeConsent()`.
  - Route `wizard:generate-skill-draft` responses through `state.applyDraftPreviewResult` / `state.applyDraftPreviewError`, and `harness:create-skill` through `state.beginCreateDraft` / `state.completeCreateDraft` / `state.failCreateDraft`.
- **Advisory (`max-lines`):** If desired during a later cleanup pass, draft-state transition helpers in `stack-skill.store.ts` can be extracted to a sibling helper file once the 6-file batch restriction is lifted.

## Extra Reads
- `.claude/skills/angular-frontend-patterns/SKILL.md` (loaded assigned Angular signals/OnPush skill from repository `.claude/skills/` after verifying host skill catalogue did not list it)
- `.ptah/specs/TASK_2026_2325_899d/parity-inventory.md` (verified GAP 27-29 & row 32 details)
- `.ptah/specs/TASK_2026_2325_899d/brief-G-Onb-Build-Draft.md` and `brief-G-Onb-Judge-Parts.md` (verified C5 `usedSlugs` and verdict filter contracts)
- `.ptah/specs/TASK_2026_2325_899d/design-spec.md` lines 113-237 (verified section 5 chip `aria-label` format & section 12 handoff)
- `libs/shared/src/index.ts` and `libs/shared/src/lib/utils/skill-document.ts` (verified `@ptah-extension/shared` exports for `skillDocumentSlug` and `validateSkillDocument`)
- `libs/shared/src/lib/types/rpc/rpc-setup.types.ts` (verified `WizardRecommendAnalysisSkillsResult`)
- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts` lines 1-120, 200-320, 380-470 (verified `selectionKey` / `candidateId` casing conventions)
- `libs/frontend/onboarding/src/lib/proposal/skill-verdict-filter.component.ts` and `skill-draft-preview.component.ts` (aligned `SkillVerdictFilterValue`, `SkillVerdictFilterOption`, `SkillDraftMode`, and `usedSlugs` contracts)
- `libs/frontend/onboarding/src/lib/proposal/stack-skill-review.component.ts/.html`, `team-builder-start.page.ts`, `skill-selection-rail.component.ts`, `analyze/analyze-skills.page.ts`, `analyze/project-skill-draft.component.ts`, `libs/frontend/onboarding/src/index.ts`, `libs/frontend/onboarding/jest.config.ts`, `tsconfig.lib.json`, `tsconfig.spec.json` (read-only consumer and config verification)
