# Batch 7 implementation report

## Changed files

All source paths below are relative to `libs/frontend/setup-wizard/src/`.

- `lib/services/generation-handoff.store.ts` and `lib/services/generation-handoff.store.spec.ts`
- `lib/services/setup-generation-open.handler.ts` and `lib/services/setup-generation-open.handler.spec.ts`
- `lib/services/setup-run-entry.service.ts` and `lib/services/setup-run-entry.service.spec.ts` (new)
- `app.ts` (service export)

## Acceptance

### 7.1 Generation handoff

- The pending handoff uses `agentRunId`, the Setup record ID. Scheduling sets a five-second deadline and arms one timer. Start now, Skip, replacement schedules and service destruction clear the timer. `lib/services/generation-handoff.store.ts:16`, `:46`, `:57`, `:67`, `:97`
- The reactive check and the synchronous check at launch skip a cancelled or dismissed parent. The handoff removes `tabClosed`, `openedTab` and the chat-ui launcher dependency. `lib/services/generation-handoff.store.ts:1`, `:41`, `:46`, `:71`, `:111`
- Guidance starts with `SetupRunStore.start('project-guidance', workspacePath, { parentId, … })`, using the agent record as parent and carrying its analysis identity. An existing live guidance run is reused. The bound RPC reports acceptance to the store and follows a backend-reported owner on a blocked start. `lib/services/generation-handoff.store.ts:157`, `:172`, `:189`
- The countdown starts guidance in the background. Manual Continue resolves the run’s route through `targetOf`. `lib/services/generation-handoff.store.ts:71`, `:84`, `:121`

### 7.2 Host open handler

- The handler validates the push and active workspace, then calls `SETUP_RUN_ENTRY.openWorkflow(workflow, 'host')`. Hosts without the provider open Setup Home. The spec asserts zero calls to either tab creation method for accepted host pushes. `lib/services/setup-generation-open.handler.ts:23`, `:31`, `:53`, `lib/services/setup-generation-open.handler.spec.ts:64`

### 7.3 Setup entry service

- The service implements the core port and exposes the store’s badge signals. `openSetup` routes to the active record through `targetOf` or opens Setup Home. `lib/services/setup-run-entry.service.ts:16`, `:20`, `:23`, `:49`
- `openWorkflow` opens the matching non-terminal record or the workflow’s entry route. It performs navigation only, including on repeated calls. The spec binds the service to `SETUP_RUN_ENTRY` with `useExisting`. `lib/services/setup-run-entry.service.ts:30`, `lib/services/setup-run-entry.service.spec.ts:50`, `:100`
- The webview’s app config imports from `@ptah-extension/setup-wizard/app`. The service is exported on that entry point for the Batch 14 provider wiring. `app.ts:7`, `apps/ptah-extension-webview/src/app/app.config.ts:111` (workspace-relative)

## Checks

- Focused Jest passed 25 of 25 tests across three suites, with zero snapshots. The handoff suite has 11 tests, the handler suite has 8, and the entry suite has 6. `.ptah/tmp/batch7-jest.log`
- Setup Wizard library TypeScript check passed with zero diagnostics. `.ptah/tmp/batch7-tsc.log`
- ESLint passed on seven files with zero errors and zero warnings. `.ptah/tmp/batch7-eslint.log`
- Ptah diagnostics reported zero issues in the requested files and eight TS2737 BigInt target errors in three dependency files (`capability-id-codec.ts`, `attention-identity.ts` and `pairing-code.ts`). The requested project TypeScript check passed.
- This batch changes service logic. Route selection and query parameters were checked in Jest. The Electron visual review is scheduled for Phase D.

## Callers outside the write set

Paths in this section are workspace-relative.

- `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:581` still reads `pending.agentTabId` and compares it to the legacy `gen` query value. Batch 8 needs to read `pending.agentRunId` and compare against the Setup agent record identity.
- `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts:41`, `:129` and `:134` still model or set the old `agentTabId` field. The fixtures need the same Batch 8 migration.
- The guidance page still checks for a chat tab at `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:510`, and `libs/frontend/onboarding/src/lib/analyze/generation-step.store.ts:97` also calls `findBoundGenerationTab`. These existing checks need the planned Batch 8 move to Setup records before the pages can render tab-free bindings. Both still use `bound-generation-tab.ts`.
- The caller sweep used `ptah_grep` across `libs/frontend` and `apps/ptah-extension-webview`. No external callers of the removed `tabClosed` or `openedTab` members were found. An `rg` pass confirmed the empty webview result.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Use the Setup parent record ID and preserve the single pending countdown. | Key by record ID or backend run ID. | `SetupRunRecord.id` is the store lookup and `parentId` identity. `backendRunId` belongs to the RPC binding. The existing guidance page reads one pending countdown. | Yes |
| Use skill review as the agent workflow entry when there is no live run. Live records use `targetOf`, including D7’s preview state at `analyze/generate`. | Route to `analyze/skills` or through the retired `analyze/agents` redirect. | The existing launcher opens skill review, and the retired agent entry redirects there. D7 maps a live preview record to the generation route. | Yes |
| Keep entry navigation separate from record creation and view attachment. | Navigate to the entry or allocate a record there. Attach in the service or let the rendering view own attachment. | The core port opens the workflow entry when no record exists. Store attachment marks a run as viewed until released. The open request accepts origin without rewriting the provenance of an existing run. | Yes |
| Export through `/app` in this batch. | Export now through `/app` or defer to Batch 14. | The existing webview config already uses the app entry. Provider registration and validation are in Batch 14. | Yes |
| Preserve D3’s normal configure conversation. | Keep that chat flow or bring it into Setup. | D3 gives the configure conversation a normal chat tab. The Batch 7 write set covers agent generation and guidance entry. | Yes |
