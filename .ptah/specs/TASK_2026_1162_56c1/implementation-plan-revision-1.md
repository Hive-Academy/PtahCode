# Implementation Plan Revision 1 — Phase 3: Setup skills by tech stack

## Response to codex review (5 critical findings)

### P3-F1: NestJS acceptance test — DECISION REQUIRED

**Finding:** No `@nestjs/*` dependencies found in this worktree. skillsSh detector requires `@nestjs/core`.

**Recommendation:** Change acceptance to test what this workspace actually has. This workspace has:
- Angular (confirmed via `@angular/*`)
- Nx (confirmed via `@nx/*`)
- NestJS: NOT PRESENT in this branch

**Action:** Propose to user and parent: accept Angular, Nx, and exclude Fastify/Vitest only. If full repo testing needed, use main checkout in a separate task.

### P3-F2: Install flow — NEW BATCH ADDED

**New B6:** Install flow wiring (moved, not new concept)
- Files: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (register install methods)
- Files: `libs/backend/harness-sync/src/lib/state/skill-sync-gate.spec.ts` (propagation)
- Files: `libs/backend/rpc-handlers/src/lib/handlers/skills-sh-rpc.handlers.ts` (existing API)
- Tests: install flow end-to-end, propagation, Markdown rewriting
- Acceptance: installSkills RPC works, output matches skillsSh:install, propagation fires

### P3-F3: B1 expanded — RPC contract and registry

**Expanded B1: RPC contract, stubs, and registry**
- Add files: `libs/shared/src/lib/types/rpc.types.ts` (add WizardRecommendSkillsParams, WizardSearchSkillsParams, WizardProjectGuidanceParams, WizardInstallSkillsParams)
- Add files: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (register methods: wizard:recommend-skills, wizard:search-skills, wizard:get-project-guidance, wizard:install-skills-with-consent)
- Add files: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts` (add Zod schemas for new RPC payloads)
- Tests: RPC method registration, method registry, schema validation
- Acceptance: All four new methods compile, return correct types, old agent methods still work

### P3-F4: Consent enforcement — NEW BATCH

**New B7: Script consent enforcement**
- Detect script content in skill files (hardcoded list of script indicators: `npm postinstall`, `build scripts`, etc.)
- Store consent decision: `SkillConsentRecord { skillName, version, consentDate, userId }`
- Enforce in install path: reject install if script detected and no consent record
- Files: `libs/backend/agent-generation/src/lib/services/skill-consent.service.ts` (new)
- Files: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (consent check in install)
- Tests: script detection, consent storage, enforcement (refuse without consent, allow with consent), version binding
- Acceptance: Install with script fails without consent, succeeds with consent, consent version-bound

### P3-F5: B4 and B5 split — BATCH REORGANIZATION

**Original B4 splits into B3a, B3b, B3c (service contracts first, then UI)**

**B3: Project guidance service** (unchanged, service-only)
- Define weak practices evidence schema: `{ category: string, label: "follow"|"tolerate"|"do_not_copy", fact: string, evidence?: string }`
- Examples: `{ category: "testing", label: "tolerate", fact: "Jest 30 is used; Vitest not recommended" }`

**B4: Skill recommendation service** (unchanged, service-only)
- Full backend contract before frontend starts

**B5: Consent service** (as B7 above, service-only)
- Backend enforcement before frontend checkbox

**NEW B8: Skill selection UI** 
- Files: `libs/frontend/setup-wizard/src/lib/components/skill-selection.component.ts` (replaces agent-selection)
- Files: `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts` (add skill step)
- Files: `apps/ptah-extension-webview/src/` (webview for skills)
- Acceptance: Step shows skills, cards display, cancel works, no agent UI shown

**NEW B9: Project guidance UI**
- Files: `libs/frontend/setup-wizard/src/lib/components/guidance-decision.component.ts` (new)
- Files: `libs/frontend/onboarding/src/lib/analyze/guidance-step.store.ts` (new)
- Acceptance: Step shows labeled facts, owner decision prompt, clear/dismiss options

**NEW B10: Consent UI**
- Files: `libs/frontend/setup-wizard/src/lib/components/skill-consent.component.ts` (new)
- Files: `apps/ptah-extension-webview/src/` (webview checkbox)
- Acceptance: Checkbox shown for script-bearing skills, checked state persists, submission blocked if unchecked

**NEW B11: Visual review**
- Screenshots in Electron: normal flow, weak practices flow
- Acceptance: Steps in correct order (analysis → guidance → skills → consent → summary), all UI renders

## Revised batch order

**Backend (dependencies clear):**
1. B1: RPC contract and stub registration
2. B2: Skill recommendation service
3. B3: Project guidance service and weak practice schema
4. B4: Skill selection service (from original B2)
5. B5: Consent enforcement service (new B7)
6. B6: Install flow wiring (moved from end)

**Frontend (all backend ready before each starts):**
7. B8: Skill selection UI (needs B2, B4 ready)
8. B9: Project guidance UI (needs B3 ready)
9. B10: Consent UI (needs B5 ready)
10. B11: Visual review (all together)

## Addressed risks

- **NestJS false positive:** Removed from acceptance criteria (pending user confirmation)
- **Script consent:** Explicit enforcement service added (B5)
- **Install migration:** Separate batch (B6) for existing skillsSh API integration
- **Weak guidance:** Evidence schema defined before B3 implementation
- **Regression prevention:** Scoped checks for each changed project

## Decisions made (orchestrator)

1. **Accept Angular, Nx only.** NestJS not present in this worktree. Phase 3 tests this workspace. Acceptance: "Setup selects Angular and Nx (proven by dependencies); excludes Fastify and Vitest."

2. **Script detection: hardcoded npm script names.** Check for npm scripts: postinstall, install, preinstall, prepublish. This is deterministic, testable, and covers the common cases.

3. **Consent binding: by skill version.** When a skill is updated to a new version, re-prompt for consent. This allows safety re-review on major updates.

## Implementation readiness

The revised 11-batch plan is ready for assignment to CLI lanes. All dependencies are explicit. Code roadmap (code-roadmap.md) maps each batch to exact files. Acceptance criteria are testable.

**Ready for:** Phase 3 implementation to begin on CLI lanes once parent approves this revision.
