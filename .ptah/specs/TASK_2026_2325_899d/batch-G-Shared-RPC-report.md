# G-Shared-RPC batch report

## Files and contracts

All plan references point to `implementation-plan.md` in this task folder.

| File | Contract | Plan lines |
| --- | --- | --- |
| `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` | `ModelPair` and the four variants of `SetupPairState`. | 40–41 |
| Same | `SkillJudgeStageCategory`, including `pre-dispatch-error`, and `SkillJudgeStageRecord` with configured, attempted and used pair fields. | 42–43, 389–391 |
| Same | `SkillJudgeOutcome` with Install, Build and No Skill verdicts. `SkillJudgeItem` with registry state and failure, candidate IDs and assessments, outcomes and stage attribution. | 44–45, 440 |
| Same | `SkillJudgeCandidate` with the existing `SkillShEntry` and case-preserving selection key. `SkillBuildProposal` with optional `proposalRef`. `SkillJudgeResult` with method, counts and item, candidate, proposal and stage arrays. | 46–48, 438–445 |
| Same | `WizardGetSetupModelParams` and `WizardGetSetupModelResult` carry the empty request and Setup state response. | 51, 163 |
| Same | `WizardSetSetupModelParams` and `WizardSetSetupModelResult` carry the provider/model pair and the receipt with `committed`, `state` and `commitSeq`. | 52, 368–370, 679 |
| Same | `WizardGenerateSkillDraftParams` and `WizardGenerateSkillDraftResult` carry per-item evidence and build reasons, with a discriminated success or failure response. | 53, 165 |
| `libs/shared/src/lib/types/rpc/rpc-setup.types.ts` | Added `PhaseResultV4.input.provider?: string`, `MultiPhaseManifestV4.analysisPair?: ModelPair`, and `MultiPhaseAnalysisResponse.analysisPair?: ModelPair \| null`. `WizardRecommendAnalysisSkillsResult` now requires `judge: SkillJudgeResult` and `analysisPair: ModelPair \| null`. | 49–50 |
| `libs/shared/src/lib/types/rpc.types.ts` | Re-exported the judge module through the existing shared barrel. Added `wizard:get-setup-model`, `wizard:set-setup-model` and `wizard:generate-skill-draft` to the typed map and runtime registry. The existing `wizard:recommend-analysis-skills` entry picks up the revised result type. | 50–53, 59, 163–165, 240, 346 |
| `libs/shared/src/lib/types/rpc/rpc-error-codes.types.ts` | Added `SETUP_MODEL_INVALID`, `ANALYSIS_LOAD_FAILED` and `SKILLS_RECOMMEND_FAILED` to `RPC_USER_ERROR_CODES`. | 59, 587–588 |
| `libs/shared/src/lib/types/rpc/rpc-auth.types.ts` | Added `setup.provider` and `setup.model` to `SCOPED_SETTING_KEYS` with `appScopable: false` and `supportedTargets: ['global']`. | 59 |

## Checks

The native commands ran in the task worktree via `node scripts/verify.mjs --exec --task <name> -- <command>`, using the installed binaries from the enclosing checkout.

- `ptah_get_diagnostics` scoped to the five changed source files reported zero errors and zero warnings.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` passed, exit 0.
- `npx eslint` with all five source paths in the table passed, exit 0. It reported two unused-import warnings and the existing file-length warning in `rpc.types.ts`. ESLint skipped `@nx/enforce-module-boundaries` because a cached project graph was unavailable.
- `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath` with the paths below passed all 50 tests in four suites, exit 0. Node emitted an ES module loading warning for the TypeScript config during startup.
  - `libs/shared/src/lib/types/messages/agent-messaging.schemas.spec.ts`
  - `libs/shared/src/lib/types/rpc/host-source-registry.contract.spec.ts`
  - `libs/shared/src/lib/types/rpc/rpc-lane-plan-limits.contract.spec.ts`
  - `libs/shared/src/lib/types/rpc/rpc-provider-accounts.spec.ts`

## Expected downstream breaks

- `libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-recommendation.service.ts` and `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` currently construct recommendation results without `judge` or `analysisPair`. Their return objects need both fields for typechecking.
- The three newly declared methods require ownership through the Setup handler's advertised method list and handler registration. `libs/backend/rpc-handlers/src/lib/host-profile/manifest.spec.ts` asserts exact coverage against `RPC_METHOD_NAMES`, and `register-rpc-surface.ts` invokes that invariant during development registration. The invariant is expected to fail until the Setup integration supplies the methods.
- The onboarding analysis fixture in `libs/frontend/webview-e2e-harness/src/lib/scenarios/onboarding/onboarding-analyze.fixtures.ts` currently has an untyped recommendation payload. The fixture batch must supply `judge` and `analysisPair` before applying the planned `satisfies` check, and include `commitSeq` in its Setup save response. Onboarding mocks that start constructing typed recommendation responses will also need both required fields.

Downstream projects and host integration were inspected at source level.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Put the new judge and Setup/draft request and result types in `rpc-skill-judge.types.ts`. Use the existing `StackSummaryItem` and `SkillShEntry` through type-only imports. | Co-locate the new types or distribute the Setup/draft contracts into `rpc-setup.types.ts`. | Plan lines 39 and 346 name both modules and specify the public re-export. Co-location keeps the new contracts in one module and the imports emit no runtime dependency. | Yes, while preserving public exports. |
| Use the `Result` suffix for the three new result types. | `Result` or `Response` are both present in adjacent contracts. | Amendment 3.2 specifies `WizardSetSetupModelResult`. The adjacent analysis recommendation contract uses `Result`, so the three new methods use it consistently. | Yes, with coordinated import updates after adoption. |
| Include `commitSeq` in the public receipt. | The original two-field shape or the amended three-field shape. | Lines 368–370 supersede line 52. C1 line 679 explicitly preserves the receipt and sequence. | No without amending the binding plan and updating consumers. |
| Keep `proposalRef` on `SkillBuildProposal` and use `proposalId` to link Build outcomes. | Expose the normalized RPC result or also export the model transport shape. | Lines 44–48 define the public result. Lines 419–445 assign transport and validation to `G-Skills-Judge`. | Yes, with a separate transport contract if a later batch establishes a shared use. |

## Extra reads

- Plan lines 163–165 for exact method strings, line 209 for fixture integration, and lines 671–679 for C1. Targeted matches for judge types, `proposalRef`, setup methods, setting keys, and error codes were used to cross-check ownership and amendments.
- Read the task status, the `G-Shared-RPC` batch row, the local orchestration skill, and the focused-check and verify-lock guidance in `CLAUDE.md`. The host did not expose a skill loader, so the repository skill was read from its filesystem path.
- Inspected the changed files, the existing `SkillShEntry` and shared barrel declarations, the registry specs, recommendation producers and fixtures, and the backend manifest, registration invariant, and Electron and CLI surface specs.
- `ptah_search_files` returned zero hits for the task plan. Used `rg --files` to locate the task documents. No `ptah_grep` tool was listed, so used `rg -n` for plan and registry string searches. `ptah_ast_analyze` recovered with parse errors for the RPC and Setup files, so checked the relevant source ranges with `sed`. `ptah_get_dependents` returned an incomplete graph with zero hits, so checked method literals and type names for downstream use with `rg`.
