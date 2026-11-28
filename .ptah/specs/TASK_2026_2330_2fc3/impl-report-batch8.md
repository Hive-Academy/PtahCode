# Batch 8 implementation report

## Changed files

All six source and spec files are under `libs/frontend/onboarding/src/lib/`.

- `analyze/generation-step.store.ts`
- `analyze/generation-step.store.spec.ts`
- `analyze/project-guidance.page.ts`
- `analyze/project-guidance.page.spec.ts`
- `focus/onboarding-focus-router.service.ts`
- `focus/onboarding-focus-router.service.spec.ts`

## Acceptance evidence

### Task 8.1

- `analyze/generation-step.store.ts:94` gets the Setup record by ID. The store validates the record's workflow and workspace before handing its canonical RPC binding to the workflow store. `analyze/generation-step.store.spec.ts:267` covers binding success and rejection for missing records, foreign workflows and workspace mismatches.
- `analyze/generation-step.store.ts:1` and `analyze/project-guidance.page.ts:1` import Setup record APIs. Both consumers have dropped `findBoundGenerationTab` and the guidance page has dropped `GenerationWorkflowLauncherService`. The helper file remains for Batch 14.
- `focus/onboarding-focus-router.service.ts:29` resolves the Setup run, activates its workspace when needed, then navigates using `stepTarget(record)`. The focus specs cover running generation, chained guidance, completed guidance, missing targets and unsuccessful navigation. See `focus/onboarding-focus-router.service.spec.ts:56`.

### Task 8.2

- `analyze/project-guidance.page.ts:607` resolves the route identity from `SetupRunStore`. It attaches to an existing record on entry and creates a record when the user starts guidance from a recordless page. Owner navigation uses `stepTarget` at `analyze/project-guidance.page.ts:940`. The specs cover entry, explicit start and a new record selected by same-page navigation at `analyze/project-guidance.page.spec.ts:248`.
- `analyze/project-guidance.page.ts:677` resolves the Setup agent record from the guidance parent or the existing `gen` route value. `analyze/project-guidance.page.ts:761` compares `pending.agentRunId` with that record's ID. The fixture and hand-off cases use `agentRunId` at `analyze/project-guidance.page.spec.ts:133`, `:374` and `:415`. Additional cases cover a different parent ID and a late hand-off on a recordless route.
- `analyze/project-guidance.page.ts:429` consumes `enhanceStream()` and filters by workspace, record ID and backend attempt. The inline transcript at `analyze/project-guidance.page.ts:177` uses the shared tree builder for structured events and renders compact guidance events as text. `analyze/project-guidance.page.spec.ts:296` verifies visible text updates and filtering.
- `analyze/project-guidance.page.ts:224` displays **Retry** for an interrupted Setup record. `analyze/project-guidance.page.ts:726` binds even when the interrupted attempt is no longer available in the backend. `analyze/project-guidance.page.spec.ts:392` verifies the button invokes guidance regeneration, which uses the existing record retry path.

## Checks

| Check | Result | Log |
| --- | --- | --- |
| Focused Jest, three requested specs | 3 suites passed, 59 tests passed, 0 snapshots | `.ptah/tmp/batch8-jest.log` |
| TypeScript, onboarding library project | Exit 0, 0 errors | `.ptah/tmp/batch8-tsc.log` |
| ESLint, six changed source/spec files | Exit 0, 0 errors, 12 warnings (11 explicit-member-accessibility and 1 max-lines) | `.ptah/tmp/batch8-eslint.log` |

Scoped `ptah_get_diagnostics` reported zero diagnostics in the six requested files. Its broader compiler pass repeated 14 errors in out-of-scope specs and shared files that also appeared in the first diagnostics pass.

## Template

The inline template in `analyze/project-guidance.page.ts` changed. The guidance transcript occupies the existing leading log pane, and the interrupted action is rendered in the existing run panel. Angular TestBed verified the pane's DOM order, its live updates and the Retry control. Electron screenshots were unavailable because there was no running renderer session in the lane. Electron visual review remains scheduled for Phase D under D9.

## Callers outside the write set

- The Batch 7 guidance hand-off readers, fixtures and tab checks listed in its report were all in the Batch 8 write set and were migrated.
- `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1099` still creates a guidance chat tab and passes its ID. Batch 10 must pass a Setup record ID. A raw chat tab ID with no corresponding Setup record now takes the guidance recovery path.
- `libs/frontend/onboarding/src/lib/onboarding.routes.ts:80` still redirects `analyze/generate` to skills. Batch 9 owns the new generation page.
- `libs/frontend/onboarding/src/lib/home/onboarding-resume.store.ts:212` and `libs/frontend/chat-ui/src/lib/services/generation-workflow-launcher.service.ts:79` still call `onboardingGenerationTarget`. Their migrations belong to Batches 11 and 13. Webview entry-token and tab-validator wiring are Batch 14.
- The existing focus provider and onboarding routes retain their exported router and page classes.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Use Setup record IDs across focus and guidance, preserving `tab` for the route and `tabId` for the RPC wire field. | Change route/RPC field names or preserve the established wire shape. | Plan components 2 and 3 and the existing `bindingFor(record)` and `stepTarget(record)` APIs. | Yes |
| Attach on entry and reserve a new record on explicit Start when no record exists. | Reserve a record on visit or reserve it when work starts. | `SetupRunStore.start` reserves a live record, and the hand-off waits for an existing reservation. Delaying reservation preserves manual start and avoids an idle reservation competing with a pending hand-off. | Yes |
| Use the existing execution renderer for structured events and a text transcript for compact events. | Change the shared analysis component or render the scoped stream in the existing guidance log pane. | The analysis component consumes phase state, the guidance producer emits compact events, and the assignment limits writes to onboarding consumers. | Yes |

The repository's `angular-frontend-patterns` skill guided the Angular changes. The `ptah_get_dependents` index did not cover these files. The caller sweep used `ptah_grep` and narrow native `rg` where Ptah file search or text search had no usable result.

## Clarifications Needed

- Workspaces with preexisting saved guidance and no Setup guidance record reach the idle start view. If saved-guidance controls must be available for that legacy case, the recommended follow-up is a workspace-scoped read and action API in `GuidanceGenerationStore`. Its current saved-guidance methods require a run binding. The alternative is to cover that case through the legacy record migration when a corresponding binding can be recovered.
