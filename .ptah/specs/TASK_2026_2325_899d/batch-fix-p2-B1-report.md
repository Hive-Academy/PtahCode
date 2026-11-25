# P2 B1 fix report

## Files changed

- `libs/frontend/core/src/lib/services/providers-settings-state.service.ts` and its spec.
- `libs/frontend/core/src/lib/services/providers-commit.service.ts` and its spec.
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts` and its spec.

## Findings and plan references

1. **External Setup changes and Undo.** `providers-settings-state.service.ts:264` derives the committed pair from the fresh Setup state and reconciles only a ready read in the current generation and workspace. `providers-commit.service.ts:116` retains the highest local receipt sequence independently of the cached receipt. A differing settled read clears stale feedback and Undo, and the next save uses the loaded pair. The regression at `providers-settings-state.service.spec.ts:280` covers an unchanged reread, external Clear, rejection of an older receipt, and Save plus Undo back to `committed === null`. Plan lines 169–173 and 369–376.
2. **Setup dismissal and Undo.** `provider-consumer-assignments.component.ts:420` requires saved feedback and an Undo entry. Closing the Setup editor clears invalid or failed draft feedback via `provider-consumer-assignments.component.ts:846` and `providers-commit.service.ts:134`. The parameterized spec at `provider-consumer-assignments.component.spec.ts:502` covers dismissal and the absence of stale Undo on both outside error states. The successful Undo path remains covered at line 406. Plan lines 169–173.
3. **Overlapping saves.** `providers-commit.service.ts:169` gates failures by request order. The pending write count keeps Setup in the saving state until outstanding writes settle. The regression at `providers-commit.service.spec.ts:177` resolves an older save before rejecting the newer save with `SETUP_MODEL_INVALID` and checks the invalid feedback. Plan lines 372–376 and 382.
4. **Setup reopening.** `provider-consumer-assignments.component.ts:199`, `:721`, and `:833` guard the trigger, deep-link effect, and click handler during saving. `provider-consumer-assignments.component.spec.ts:437` verifies the trigger's disabled state, blocks click reopening, and confirms the deep link opens once saving settles. Plan lines 171–173.
5. **Post-commit refresh.** `providers-settings-state.service.ts:1117` includes Setup in the overall refresh outcome. `providers-settings-state.service.spec.ts:1972` verifies an acknowledged save still reports `refreshFailed: true` when the Setup read fails. Plan lines 169–173 and review finding 5.

## Checks

- The first scoped `ptah_get_diagnostics` result identified two spec typing issues in the requested files, both corrected. The final call and retry each reached Ptah's 45-second timeout. The focused native checks below completed.
- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts libs/frontend/core/src/lib/services/providers-commit.service.spec.ts` passed, 193 tests across 2 suites.
- `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.spec.ts` passed, 26 tests.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` passed.
- `npx eslint libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts libs/frontend/core/src/lib/services/providers-commit.service.ts libs/frontend/core/src/lib/services/providers-commit.service.spec.ts libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.spec.ts` passed with 0 errors and 2 existing `max-lines` warnings in the component and state service.

## Decisions

- **Baseline reconciliation.** Kept the existing receipt-ordering contract and discarded only the cached receipt when a settled read differs. The loaded row already carries the new committed pair, so a second pair cache would duplicate state. The RPC contract and the external Clear regression support this choice. Reversible within the two services.
- **Saving state.** Used the number of pending Setup writes to derive saving status. A single boolean cleared by the first completion would let the editor reopen while another write is pending. The overlapping-save regression covers this case. Reversible within the commit service.
- **Route fixture.** Supplied the required `authMethodIsUnset: false` field for the existing API-key route mock after Ptah flagged it. The fixture explicitly selects API-key auth. The change is local to the spec.

## Open items

Live Electron review belongs to the coordinator under this lane's focused-check scope. No cross-group source changes are needed for the five findings.

## Extra reads

- `.claude/skills/angular-frontend-patterns/SKILL.md`, its effects reference, and `.claude/skills/ui-ux-designer/SKILL.md` for repository skill guidance.
- `libs/frontend/core/src/lib/services/providers-settings-sections.ts` for the existing read publication and generation contract.
- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` for the Setup state variants.
- Task decision D41 and the relevant implementation-plan excerpts.
