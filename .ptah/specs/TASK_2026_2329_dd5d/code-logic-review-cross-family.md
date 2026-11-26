# Cross-Family Code-Logic Review — TASK_2026_2329_dd5d

- **Review family**: cross-family independent pass (`git diff main...618c95010 -- libs`, main `6a99ab936` → head `618c95010`), worktree `fix-setup-wizard-nav-skill-review-0acbb324f0de`.
- **Prior reviews treated as context** (not duplicated): `code-logic-review.md` (Backend/Frontend `APPROVED` after fix rounds), `code-logic-review-final-pr.md` (`APPROVED`, 1 Minor `[m1]` Tailwind `/70` no-op, deferred backend `M1`).
- **Method**: whole-diff review of changed sources in the three task areas, boundary-by-boundary; changed public contracts traced to external callers. No builds, Nx, or test runs (coordinator runs `npm run verify`); spec files were read only where the task asked for an exact-class check. Electron-first: the wizard/analysis paths reviewed are the Electron webview (`apps/ptah-extension-webview`) and its backend libs.

## 1. Area 1 — Setup navigation, workspace changes, active analysis, live stream/timer, stale state

Traced end to end:

- **Backend active-run registry**: `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts` replaces the single `activeAbortController` with an `ActiveRunRecord` (`getActiveRun`, `isRunningForWorkspace`, `findJoinableRun`, `trackAbortedRunSettlement`). A second start for the same workspace joins the live promise instead of aborting it (re-checked both before and after the Setup resolution await). An aborted run's settlement is awaited (`settlingByWorkspace`) before a new checkpoint opens for the same workspace, which removes the wipe/write race on the slug directory. Normalization (`normalizeWorkspacePath`, lowercase on win32) matches the frontend runner's comparison rules.
- **RPC surface**: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` — `getResumableRun` reads the active run before/after `findLatestResumableRun`, re-reads both when the active run disappears while storage still says `running` (settlement race), and reports `analysisActive`/`activeAnalysisStartedAt` (additive optional fields, `rpc-setup.types.ts:376-383`). The freshness handler excludes the active run (`excludeRunId`/`excludeSlug`, `analysis-freshness.service.ts:145-188`) so an in-flight run never marks the workspace's last finished analysis stale. `listAnalyses` stamps `isActive: true` on the matching slug and `analysis-storage.service.ts:682` surfaces `manifest.lifecycle`.
- **Frontend runner**: `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts` adds `_backendActive`, per-workpace guards (`isRunningForWorkspace`, `isResultForWorkspace`), a token-bounded 2.5 s completion watcher for a backend-hydrated run, and workspace-scoped `startedAt`/`runGeneration`. `cancel()` and `reset()` clear the watcher and backend-active state; the watcher pauses on workspace switch without clearing `_backendActive`, so Home still reports the other workspace's live run.
- **Page wiring**: `analyze-workspace.page.ts` re-derives `isAnalysisActive` from the workspace path, reopens the elapsed clock from the run's real `startedAt` (not page open), keeps `interrupted` false while a local or backend-hydrated run is live, disables `Use` on saved rows during a run, and filters `visibleSaved`/`isSelectableSavedAnalysis` to completed, non-active entries — the "shows as interrupted" symptom is addressed at both list and run-panel level. `analysis-found-card.component.ts` hides the incomplete-analysis card while a run is active and swaps `Re-run` for `View progress`. `analyze-skills.page.ts:1135-1143` `back()` preserves the `analysis` query param. `onboarding-workspace.store.ts` only skips `wizard.reset()`/`runner.reset()` when a live analysis exists for the prior or next path.
- **Cross-workspace contract**: a run started for workspace A while B runs aborts A's backend run (`new_analysis_started`) and the runner's stale-token `finally` leaves B's signals intact; A's UI degrades to resumable, B's stays live. Verified no signal cross-talk on rapid A→B switches.

**Assessment**: correct. No blocking or serious defect found in this area.

## 2. Area 2 — System One / structured skill-ranking dispatch, validation, budgets

- **Budgets**: `skill-ranking-caller.service.ts` — RPC cap raised to 42 s (`DECISION_RPC_CAP_MS`), per-request budget `min(explicit target timeout | configured timeout | 20 s default, cap)` applied after `openCaller`, deadline timer re-scheduled, and `maxTimeoutMs` forwarded into `dispatchFor`. Structured dispatch now races with `dispatch.timeoutMs + DECISION_RETURN_MARGIN_MS` (`model-call.ts:308-311`) instead of a fixed deadline, and the structured adapter allows up to 3 turns (`structured-decision.adapter.ts:73-78`) plus a bounded-brace JSON fallback (`extractJsonObject`) — this is the substantive fix for "decision model not properly working" (single-turn + missing `structured_output` previously produced `invalid-output`).
- **Fitting**: `fitSkillQuestions` narrows candidate width (steps 25→1) until the estimated serialized System One payload (or `{prompt, jsonSchema}` for structured) fits `REQUEST_SIZE_LIMIT_BYTES`; System One caps at `PROVIDER_OPTION_LIMIT[provider] - 1` (the `-1` reserves the `none` option). Verified `systemOneProvider` (`decision-caller.ts:248-257`) returns only `ollama`|`jev`, both present in `PROVIDER_OPTION_LIMIT` (`routing-constants.ts:130-134`) — the `undefined - 1 → NaN` slice path cannot occur.
- **Validation**: new `validateSystemOneItems` maps `ChoiceValidation` outcomes per item; `low-confidence` and `none` become unresolved (Normal-model fallback), bad output and unknown candidate IDs become item rejections. The structured path now rejects candidates cut by width fitting (`offeredEligible.includes`, `skill-ranking-caller.service.ts:614`, `:649`), and `matchingCandidates` resolves `cN` aliases only within the offered window. `rank()` is wrapped so a rejection after the timeout wins the race cannot become an unhandled rejection.
- **Consumers**: `skill-judge.service.ts` (`prepareItems`) and `skill-recommendation.service.ts` sort candidates by installs with full deterministic tie-breaks; `compareRecommendations` puts installs above `score` (deliberate, matches the user request). Deprecation detection is tightened to explicit skill deprecation (`hasSkillDeprecationNotice`), avoiding false "deprecated" marks from skills that mention deprecated APIs.
- **DI**: `register.ts` resolves `PLATFORM_TOKENS.WORKSPACE_PROVIDER` inside the `DecisionCaller` factory; registration order confirmed (`phase-1-infra.ts:117` before `registerLaneRoutingServices` at `phase-2-libraries.ts:412`; `container.ts:631` before `:899` in cli-engine).

**Assessment**: correct. Width-fitted `order` arrays are shorter than the full eligible list when truncation occurs — an accepted, logged degradation, not a defect.

## 3. Area 3 — Download (install count) ordering in UI, RPC and backend, with ties

Every comparator normalizes non-finite/negative installs to 0 and breaks ties deterministically (`skillId` → `source` → `name`, plus `candidateId` in the judge comparator):

- Backend client: `skills-sh-api-client.ts:90-98` (`compareSkillShEntriesByInstallsDesc`, exported) sorts search results before and after the frontmatter probe; sorted data is what gets cached.
- RPC: `skills-sh-rpc.handlers.ts` sorts all four paths (`search`, CLI-parse fallback, `getPopular` including the curated fallback and cache, `detectRecommended`) after enrichment; `enrichWithInstallStatus` now copies instead of mutating.
- Judge: `prepareItems` sorts the candidate map and per-item `candidateIds`; judge results and fallbacks sort `candidates` (`skill-judge.service.ts:466`, `skill-recommendation.service.ts:247`).
- UI: `skill-sh-browser.component.ts` sorts recommended and search displays after dedupe; `stack-coverage.ts` sorts judge item candidates, manual and residual candidates; `stack-skill.store.ts` sorts every result array on set and orders the preselected consent set by installs; `stack-skill-review.component.ts` sorts install/residual/filtered/other/selected card lists.

**Assessment**: correct; ordering is installs-descending with stable ties at every layer, so layers reinforce rather than fight each other.

## 4. Independent check — final two static state border bindings and exact class test

- **Bindings**: `libs/frontend/onboarding/src/lib/home/resume-banner.component.ts:24-25` uses `[class.border-state-run]="state() === 'running'"` and `[class.border-state-need]="state() !== 'running'"` — plain utilities, no `/70` alpha modifier. The `[m1]` no-op-alpha finding from `code-logic-review-final-pr.md` therefore no longer applies to the final state.
- **Tailwind config**: `apps/ptah-extension-webview/tailwind.config.js:33-34` defines `state-run`/`state-need` as raw `var(--state-ink-*, oklch(...))` colors in the palette; plain `border-state-run`/`border-state-need` utilities emit rules from these tokens (no `<alpha-value>` needed). Content globs (`tailwind.config.js:7-10`, `createGlobPatternsForDependencies`) cover the onboarding lib, and `[class.<utility>]` binding extraction from Angular templates was verified against the real Tailwind 3.4.19 pipeline in the prior final-PR pass; the coordinator has since verified generated CSS for these exact classes.
- **Exact class test**: `resume-banner.component.spec.ts:21` (`border-state-need` default `resumable`), `:41` (`border-state-run` for `running`), `:58` (`border-state-need` for `cancelling`) assert the exact class names on the section element, matching the template bindings one-to-one.

**Result: PASS.** The final bindings are the suggested plain-utility form, the tokens support them, and the focused spec pins the exact classes.

## 5. Deferred harness `searchPage` follow-up vs affected paths

- The known backend `M1` (`SkillsShApiClient.searchPage` sorts only the fetched `offset + limit + 1` window when upstream pagination is unsorted) is consumed by `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/harness-namespace.builder.ts:692-693` — the webview e2e harness tool. It is **not** on a production skills surface.
- The Marketplace `smithery-surface.component.ts:1533` `searchPage` is a different method calling `mcpDirectory:search` (Smithery MCP directory), not skills.sh — unaffected.
- The wizard skill browser, `getPopular`, `detectRecommended`, the judge and the recommendation service all use the fully-sorted `search`/judge paths reviewed in section 3. **No Marketplace or wizard path is affected by the deferred pagination issue.**

## Five logic questions

*(Limitation: the exact question wording lives in the full role definition at `.claude/agents/code-logic-reviewer.md`, which this lane could not re-read; the answers below cover the five standard review questions.)*

1. **Does the implementation meet the requested behaviour?** Yes. All three reported bugs are fixed with named evidence: navigation no longer marks a live run interrupted (section 1), decision-model skill review dispatches with workable budgets and validates both provider families (section 2), and download-count ordering is deterministic end to end (section 3).
2. **What happens at each boundary?** RPC responses carry additive optional fields only; frontend guards use `typeof` capability checks so older runner mocks and minimal DI containers degrade, not throw. Backend optional-service resolution (`getActiveAnalysisRun`, `resolveOptionalAnalysisRunner`, `resolveOptionalWorkspaceStore`) catches and returns null.
3. **What happens when things fail?** Bounded poll retries (5) then stop; judge failures return a category and fall back to Normal/heuristic ranking; structured adapter falls back to JSON extraction then fails as `invalid-output`; width fitting degrades to fewer candidates before failing `payload-too-large`.
4. **Are there races or stale state?** The settlement races are handled (backend re-read pattern; frontend token/watcher guards; stale-token `finally` ownership checks). The remaining stale-state windows are Minor findings below.
5. **What did the tests prove, and what did they not?** The coordinator verified generated CSS, the focused banner spec, and the full suite set via `npm run verify`; this review did not re-run them (memory-safe rules). What specs cannot prove — sustained-RPC-outage UX and cross-workspace watcher recovery — is covered by findings M1/M2 below.

## Findings (severity-ranked, file:line)

### Blocking
None.

### Serious
None.

### Moderate
None.

### Minor
1. **`[M1]` Backend-watcher completion poll ignores `resumable.generation`** — `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts` (`pollBackendActive`, `analysisActive === false` branch): a generation resumable offer that appears or changes while a backend-hydrated analysis is being watched is not surfaced (`resumable.generation` is read only at one-shot discovery). Impact: the generation resume offer appears after the next discovery (page reopen / Home refresh) instead of immediately. Non-blocking; discovery-time capture covers the common case.
2. **`[M2]` Watcher exhausts retries while UI keeps showing "running"** — `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts` (`handleBackendPollError`, `MAX_BACKEND_POLL_ERRORS = 5`): after 5 consecutive poll failures the watcher stops but `_backendActive` stays true, so the analyze page shows a live run with no in-page recovery; recovery comes from `onboarding-resume.store.refresh()` (which re-syncs and can restart the watcher) or a workspace switch. A sustained RPC outage is the only trigger; bounded degradation is defensible, but the page gives the user no signal.
3. **`[M3]` Pre-checkpoint `isActive` marking gap (observation)** — `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (`getWizardAnalyses`): `isActive` is stamped only when `activeRun.slug !== null`; during the short window before the checkpoint opens the slug is the predicted one and the list is unmarked. No user-visible impact found: the run's entry is typically not yet on disk then, and the `lifecycle !== 'completed'` filter is the second guard. Recorded for completeness.

### Deferred / known follow-ups (unchanged, non-blocking)
- Backend `M1`: `SkillsShApiClient.searchPage` prefix-window sort — harness-only (section 5).
- Comparator duplication across `skill-sh-browser.component.ts`, `stack-coverage.ts`, `skills-sh-api-client.ts`, `skills-sh-rpc.handlers.ts`, `skill-judge.service.ts` — consolidation candidate in `@ptah-extension/shared` (prior style note).

## Decisions

- **Treated coordinator-run verification as authoritative for tests/CSS generation** (options: re-run vs trust evidence). Evidence: CLAUDE.md memory-safe rules forbid lanes re-running heavy checks; the final-PR review documents the exact commands and results. Reversible: a later phase can re-run.
- **Answered the five logic questions in substance despite not re-reading the role file** (options: skip vs answer from the visible role summary). Evidence: the condensed role mandates the section; the denial blocked only the wording lookup, not the analysis. Labeled as a limitation in that section.
- **Scored against severity bands, not a target share** — see verdict.

## Verdict

**`APPROVED` — score 8/10 (sound)**. **0 Blocking, 0 Serious, 0 Moderate, 3 Minor** non-blocking findings. Evidence separating this score from the bands either side: the three reported bugs are fixed with race-aware state machines and deterministic ordering at every layer (above 5-6 "real gaps"); the Minor findings are bounded-degradation UX edges rather than logic defects, and the deferred items are correctly scoped away from production paths (below 9-10 "exemplary"). The independent border-binding check passes: the final `resume-banner.component.ts:24-25` bindings are plain utilities supported by the Tailwind palette (`tailwind.config.js:33-34`) and pinned by exact-class assertions (`resume-banner.component.spec.ts:21,41,58`).

**Unfinished / not covered by this review**: no production edits (review-only role); spec and app files outside `git diff main...618c95010 -- libs` were not re-verified in this pass; no test, build, Nx or serve command was run (memory-safe rules — the coordinator owns `npm run verify`).
