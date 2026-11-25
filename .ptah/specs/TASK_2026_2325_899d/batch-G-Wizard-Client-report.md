# Batch G-Wizard-Client report (W2)

## Files changed

- `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts` (modified)
- `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.spec.ts` (modified)

## Plan items done

Plan line 158 ("Client: drop chat/tab model fields from setup calls in
`wizard-rpc.service.ts` (`:157-158,186-187,206-207,267,350,430`); server remains
authoritative") — all six cited sites changed:

| Old line | Method | Change |
| --- | --- | --- |
| `:157-158` | `startBoundAgents` | Removed `model: tab?.overrideModel ?? this.modelState.currentModel() ?? undefined` and the `findBoundGenerationTab` lookup. |
| `:186-187` | `startBoundGuidance` | Same removal for `enhancedPrompts:runWizard`. |
| `:206-207` | `regenerateBoundGuidance` | Same removal for `enhancedPrompts:regenerate`. |
| `:267` | `submitAgentSelection` | Removed `model: this.modelState.currentModel() || undefined` from `wizard:submit-selection`. |
| `:350` | `deepAnalyze` | Removed the `model` field from `wizard:deep-analyze`. |
| `:430` | `runEnhancedPromptsWizard` | Removed the `model` field from `enhancedPrompts:runWizard`. |

Step 3 cleanup: removed the now-unused `ModelStateService` and `TabManagerService`
injections and the `findBoundGenerationTab` import from the service. The helper
file `bound-generation-tab.ts` stays: other setup-wizard and onboarding files
still import it.

Step 2: shared param types keep their optional `model?: string` fields
(`rpc-setup.types.ts:147,333,562,625`); no shared file was edited. The field is
now simply never sent by this service.

Step 5 (new RPC client methods): NOT added. The plan assigns
`wizard:get-setup-model` to `analyze-skills.page.ts` (F27, plan line 192/572),
`wizard:set-setup-model` to the Settings UI (plan line 172), and
`wizard:generate-skill-draft` to the onboarding draft components (plan lines
165/200). All belong to other groups, not to `wizard-rpc.service`.

Spec updates (brief step 4):

- Chat picker stub now returns `'picker-model'` (was `null`) and tab override
  stubs keep `'tab-model'`/`'opus'`, so every no-model assertion runs against
  live conflicting picker/override values (plan line 577, TD 2.5 client row).
- `startBoundGuidance`/`regenerateBoundGuidance`: exact payloads asserted
  without `model` (renamed test).
- Bound starts test rewritten: all three bound calls verified by method name
  and each payload checked with `not.toHaveProperty('model')`.
- Bound submit + resume test rewritten: `selectedAgentIds`/`resume` structure
  kept, `model` absent on both calls.
- `submitAgentSelection` preview-decisions test: `model: undefined` removed
  from the expected payload (exact-match assertion now proves absence).
- `deepAnalyze` default test: exact `{}` payload asserted (no model, no resume).
- Added a `runEnhancedPromptsWizard` describe with two tests asserting the
  payload has no model field (this method had no direct coverage before).

## Check commands and results

- `npx jest --config libs/frontend/setup-wizard/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.spec.ts`
  — **passed**: 1 suite, 38 tests passed, 0 failed.
- `npx tsc --noEmit --project libs/frontend/setup-wizard/tsconfig.lib.json`
  — **passed**: no output, exit 0.
- `npx eslint <the 2 changed files>` — **passed**: exit 0, 0 errors. 5
  pre-existing warnings (`explicit-member-accessibility` on
  `getBoundRunState`/`cancelBoundRun`/`startBoundAgents`/`startBoundGuidance`/
  `regenerateBoundGuidance`); these methods lacked the modifier before this
  batch and were left unchanged in style.

## Decisions

- **Keep the `ModelStateService`/`TabManagerService` stubs in the spec although
  the service no longer injects them.** Options: (a) delete the stubs, (b) keep
  them with live conflicting values. Evidence: brief step 4 requires proving
  each call sends no model "even when the chat picker and the tab override have
  values"; kept stubs make a regression that re-reads those services fail the
  assertions immediately. Reversible: yes.
- **Leave the five `explicit-member-accessibility` warnings untouched.**
  Options: (a) add `public` to the five methods, (b) leave them. Evidence: the
  warnings predate this batch; the batch scope is the model-field removal, and
  style-only edits inflate the diff for other reviewers. Reversible: yes.
- **No new client methods for the Setup pair / skill draft RPCs.** Options:
  (a) add thin methods here, (b) omit them. Evidence: plan lines 172, 192, 200,
  572 assign those calls to Settings UI and onboarding page/component groups;
  brief step 5 says do not add them when assigned elsewhere. Reversible: yes.

## Open items and needed changes in other groups

- None blocking. The server side that now ignores/omits the client `model`
  field is owned by `G-Generation-Handlers`, `G-Guidance-Backend`,
  `G-Analysis-Service` and `G-Setup-RPC-Integration` (plan section 6).
- Shared param types still declare the optional `model` field; per brief step 2
  they stay unchanged (the server ignores it). A later cleanup may remove the
  field from `rpc-setup.types.ts` once every caller is updated.

## Extra reads

- `libs/shared/src/lib/types/rpc/rpc-setup.types.ts` (read-only, to confirm the
  `model` request fields are optional so omitting them type-checks).
- Task folder documents: `implementation-plan.md` (batch table lines 250-291,
  section lines 150-215, TD 2.5 row line 577), `lane-brief-common.md`,
  `batches.md` (wave table).
