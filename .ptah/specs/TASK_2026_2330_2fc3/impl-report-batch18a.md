# Batch 18A implementation report

## Findings

- **Phase C F1 — Fixed.** Reconcile hydrates an active backend analysis through the runner even when Analyze is closed. Runner signals settle the observed records in their originating workspace. A confirmed inactive backend lets a restored record recover a matching completed result or become interrupted. An unavailable status response preserves the record. Changes in `libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts:28`, `:129`, and `:181`, and `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:193`. Specs in `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:334`, `:353`, `:379`, and `:427` cover absent manifests, saved recovery, hydration without the page, and completion after switching workspaces.
- **Phase C F2 — Fixed.** Continue from Skills completes the review and opens guidance without recording work before it begins. It can reopen an existing live guidance run. Start guidance creates the record and links it to the skill review when available. Changes in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1332` and `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:862`. Specs in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts:451` and `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts:271`.
- **Phase C F3 — Fixed.** Skills resolves the analysis ID carried by Home's cancelled generation link, generation's preview and cancellation links, and Done's review link. Done and the cancelled generation page retain the binding in their links. Analyze uses the manifest slug for its recordless forward link. Back prefers the loaded slug where available and Analyze can resolve a run ID after reload. The review calls these UUIDs, while new analyses generate ULIDs at `libs/backend/agent-generation/src/lib/services/wizard/analysis-run-checkpoint.ts:175`. Changes in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:582` and `:1382`, `agent-generation-run.page.ts:185` and `:228`, `analyze-done.page.ts:258`, `analyze-workspace.page.ts:1056` and `:1289`, and `analysis-step.store.ts:199` in the same directory. The authorized load handler adds an exact manifest-ID fallback at `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:978`. Specs in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts:473`, `agent-generation-run.page.spec.ts:267` and `:283`, `analyze-done.page.spec.ts:132`, and `analyze-workspace.page.spec.ts:1643` and `:1652`.
- **Phase C F4 — Fixed.** Guidance releases and clears the prior binding, stores, and detected stack on workspace change. It shows workspace mismatch for a foreign tab and guards actions against a stale binding. Changes in `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts:560`, `:617`, and `:936`. Spec in `libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts:251`.
- **Phase C F7 — Fixed.** A new analysis starts with an empty output ID while dependent workflows keep their upstream analysis IDs. Change in `libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts:498`. Spec in `libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts:1049`.
- **Phase C F8 — Fixed.** Analyze displays the targeted failed record when there is no active analysis. Home counts team-builder installs as skills. Changes in `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts:691` and `:1042`, and `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.ts:74`. Specs in `libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts:1605` and `libs/frontend/onboarding/src/lib/home/setup-runs-list.component.spec.ts:463`.
- **17b M1 — Fixed for Analyze Skills.** The page retains the active install ID, requests backend cancellation on workspace change or destroy, and ignores late replies for the previous view. Changes in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:530`, `:1215`, and `:1301`. The parameterized regression spec in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts:863` covers both lifecycle events, the exact cancellation ID, and a late success.
- **17b M2 — Fixed.** Failed and cancelled installs show confirmed installed skill names alongside the reason and stay on Review Skills. Change in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts:1268`. The parameterized regression spec in `libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts:824` covers the selection-save failure payload without a failed skill and a cancelled reply.
- **17b M4 — Fixed.** The exported normalizer canonicalizes separators, folds drive and UNC paths, keeps drive roots absolute, and preserves POSIX case. The analysis runner uses the same workspace comparison. Changes in `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts:122` and `libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts:71`. Spec in `libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts:74`.

## Decisions

- Extended the existing authorized load RPC with a scoped manifest-ID lookup. The frontend saved-analysis list exposes filenames and timestamps, so resolving Back after reload through that list alone would require fetching manifests individually. The fallback reuses the storage service's exact run-ID lookup and keeps normal slug requests on their existing path. This is reversible without changing persisted records or the RPC schema.
- Recovered a recorded analysis by its known run ID when available. Without an ID, used the newest completed saved entry at or after the record's creation time and verified the loaded manifest. The review permits interrupting an unrecoverable record. This can be changed without a persistence migration.
- Used forward slashes for normalized workspace keys, recognizing drive paths and UNC share paths as Windows-style. Existing persisted keys and record paths already pass through the normalizer on read, so no format version change is needed.

## Verification

### setup-wizard-jest

```sh
npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.spec.ts libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.spec.ts
```

Passed. 240 tests in 4 suites. [Log](../../tmp/batch18a-setup-wizard-jest.log)

### onboarding-jest

```sh
npx jest --config libs/frontend/onboarding/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.render.spec.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.spec.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-done.page.spec.ts libs/frontend/onboarding/src/lib/home/setup-runs-list.component.spec.ts
```

Passed. 202 tests in 8 suites. [Log](../../tmp/batch18a-onboarding-jest.log)

### setup-wizard-tsc-lib

```sh
npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json
```

Passed. [Log](../../tmp/batch18a-setup-wizard-tsc-lib.log)

### setup-wizard-tsc-spec

```sh
npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.spec.json
```

Exit 2. The diagnostics are the two existing guidance-handoff test fixture errors and ten existing BigInt target errors. No new diagnostics. [Log](../../tmp/batch18a-setup-wizard-tsc-spec.log)

### onboarding-tsc-lib

```sh
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.lib.json
```

Passed. [Log](../../tmp/batch18a-onboarding-tsc-lib.log)

### onboarding-tsc-spec

```sh
npx tsc --noEmit --project libs/frontend/onboarding/tsconfig.spec.json
```

Exit 2 with the existing baseline. No new diagnostics. [Log](../../tmp/batch18a-onboarding-tsc-spec.log)

### eslint

```sh
npx eslint libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.ts libs/frontend/onboarding/src/lib/analyze/agent-generation-run.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-done.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-done.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-skills.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.ts libs/frontend/onboarding/src/lib/analyze/analyze-workspace.page.spec.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.ts libs/frontend/onboarding/src/lib/analyze/project-guidance.page.spec.ts libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts libs/frontend/onboarding/src/lib/home/setup-runs-list.component.ts libs/frontend/onboarding/src/lib/home/setup-runs-list.component.spec.ts libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.ts libs/frontend/setup-wizard/src/lib/services/setup-run-persistence.spec.ts libs/frontend/setup-wizard/src/lib/services/setup-run.store.ts libs/frontend/setup-wizard/src/lib/services/setup-run.store.spec.ts libs/frontend/setup-wizard/src/lib/services/setup-run/setup-run-analysis.coordinator.ts libs/frontend/setup-wizard/src/lib/services/wizard-analysis-runner.service.ts libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts
```

Passed with zero errors and 42 warnings. [Log](../../tmp/batch18a-eslint.log)

Ptah's scoped diagnostics request timed out. The focused TypeScript commands above supplied the compiler results. The onboarding Jest suites checked rendered status panels, guidance recovery, navigation links, and install messages in the DOM. Electron visual verification was unavailable because no running renderer was connected and the verification scope excluded build and serve commands.
