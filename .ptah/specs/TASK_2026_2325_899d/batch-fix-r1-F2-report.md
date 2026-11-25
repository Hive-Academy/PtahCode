# Fix round 1 · F2

## Files changed

- `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts` and its adjacent spec
- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts` and its adjacent spec
- `libs/backend/agent-generation/src/lib/services/content-generation.service.ts` and its adjacent spec

## Findings and regression coverage

- **B1** — A successful System One call reports `used` with the configured, attempted and used pairs. Its choice-only answers leave all items unresolved for Normal, with empty `items` and `itemRejections`. Provider failure handling still precedes answer processing. Updated the System One regression to assert the entire result and one provider call. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:204`, `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts:429`. Plan lines 115–119 and decision D26.
- **B2** — `prepareItem` supplies zero eligible candidates when sanitized evidence is empty, using the existing pre-dispatch filter and `skipped/no-work` result. The mixed-request spec checks that empty and missing evidence items are absent from the prompt and that unsolicited answers for them do not produce rejections. The all-missing case asserts that the caller never opens or dispatches. The ambiguity regression remains independent. `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts:257`, `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts:312`, `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts:335`, `libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts:359`. Plan lines 115–119 and 440.
- **B4** — `resolveGuidanceRoute` calls `resolveSetup(workspacePath)`, returns its isolated snapshot and reports typed failure causes without invoking the workspace resolver. The reservation test checks that bound generation dispatches the Setup model and auth. Added invalid and unavailable fixtures that check there is no resolver fallback or SDK call. `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts:397`, `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts:609`, `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts:653`. Plan lines 156–157.
- **B5** — Content generation emits a warning before workspace model resolution when the launch lacks a Setup snapshot. The warning includes no model settings, workspace path or auth. Updated both the non-Setup and pinned Setup tests to assert the presence and absence of this warning. The abstention test verifies that the routing warning is the only one recorded when a generated section is empty. `libs/backend/agent-generation/src/lib/services/content-generation.service.ts:388`, `libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts:522`, `libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts:1074`, `libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts:1120`. Plan lines 151–155.

## Checks

- `ptah_get_diagnostics` scoped to the six changed files exceeded the tool's 1024 MB TypeScript memory limit. Used native project typechecks for coverage.
- `jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts` passed, 24 tests.
- `jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts` passed, 169 tests. An initial run caught the abstention warning assertion. The rerun passed after adjusting the assertion to allow only the routing warning. Node reported an ES module loader warning for the Jest config.
- `tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json` passed.
- `tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json` passed.
- `eslint libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.ts libs/backend/lane-routing/src/lib/decision-model/skill-ranking-caller.service.spec.ts libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.spec.ts libs/backend/agent-generation/src/lib/services/content-generation.service.ts libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts` exited 0 with 88 warnings and zero errors. The warnings concern existing non-null assertions, unused declarations, empty test generators and file length.
- Native checks ran under the verify lock via `node scripts/verify.mjs --exec --task <name> --`.

## Decisions

- **B1** — Continued dispatching System One as specified in F2 and treated the successful choice-only result as unresolved. Skipping dispatch would lose attribution for the successful call. D26 rules out synthesizing a reason. The adaptation is reversible if the protocol gains reasons.
- **B2** — Used sanitized evidence for eligibility. Raw evidence can become empty after redaction, as covered by the URL fixture. Reversible at `prepareItem`.
- **B4** — Retained the method and delegated to Setup because the required search across `libs` and `apps` found six existing spec callers and no runtime callers. Removing the optional requested-model argument prevents a chat-model override at this entry point. Reversible within the service and its spec.
- **B5** — Kept the existing option shape and added a warning at the point where non-Setup resolution begins. F2 calls for logging and the review identifies the existing wizard callers as snapshot-bearing. Reversible at the resolver call site.

## Open items

- B3 remains disputed. Its deprecated-registry regex was outside the F2 fix scope.
- Independent review belongs to the coordinating lane.

## Extra reads

- `CLAUDE.md` and `plugins/ptah-core/skills/orchestration/SKILL.md` for repository and orchestration requirements. This is the assigned implementation lane within the existing round.
- `implementation-plan.md` lines 110–120, 148–167 and 438–442, plus targeted matches. `decisions.md` decision D26.
- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` and `libs/backend/agent-sdk/src/index.ts` for the exported Setup resolution and snapshot contract.
- `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.ts` for strict Setup handling conventions.
- `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts` for the request outcome surface.
- `scripts/verify.mjs` and `scripts/verify-lock.mjs` for the focused check lock wrapper.
- `ptah_code_search_symbols` returned zero indexed hits for the guidance method and Setup resolver contract. Used targeted `rg` fallback for references and the contract. The source search included specs.
