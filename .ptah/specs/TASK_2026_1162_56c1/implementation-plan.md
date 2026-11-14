# Implementation Plan — Phase 3: Setup skills by tech stack

## Findings and Design

### Key findings from code analysis

1. **Setup RPC surface today:**
   - `wizard:recommend-agents` recommends by score from agent-generation
   - `wizard:preview-generation`, `wizard:submit-selection`, `wizard:retry-item` handle agent generation UI
   - `wizard:list-agent-packs`, `wizard:plan-pack-install`, `wizard:install-pack-agents` manage agent packs
   - These must transform to skill equivalents

2. **Analysis services (keep):**
   - `ANALYSIS_STORAGE_SERVICE`: persists workspace analysis/checkpoints
   - `ANALYSIS_FRESHNESS_SERVICE`: detects stale analysis
   - `MULTI_PHASE_ANALYSIS_SERVICE`: runs multi-phase analysis
   - These stay in place; skill selection uses their output

3. **Frontend setup wizard:**
   - `libs/frontend/setup-wizard/src/lib/` has wizard-rpc.service.ts calling agent RPC
   - `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts` has recommend-agents
   - Both must shift to skill-based flow

4. **Skill integration:**
   - `skillsSh:detectRecommended` and `skillsSh:search` are target skill APIs
   - Relevance gate: select only when dependencies prove the technology
   - Project guidance: labeled facts (follow, tolerate, do not copy)

5. **Project guidance (new):**
   - Weak repository rules:
     1. Owner decision at setup: match or raise standard
     2. Scope rule: new code follows skill, old code stays local unless refactor
     3. Debt recorded, not fixed silently
     4. Verdict "cannot verify" with baseline task proposal
   - These facts come from workspace analysis or manual repository rules

6. **Electron first:**
   - Renderer in `apps/ptah-extension-webview/src/`
   - All visual UI in webview, tested in Electron app

### Design approach

**Phase 3a: RPC layer (backend)**
- Add new RPC methods: `wizard:recommend-skills`, `wizard:search-skills`
- Keep old agent RPC methods for backward compatibility (deprecate)
- Add `wizard:get-project-guidance` for weak repository facts
- Add `wizard:confirm-skill-install` with consent check for scripts

**Phase 3b: Skill selection service (backend)**
- Create `SkillSelectionService`: replaces agent selection
- Implement relevance gate: check dependencies for tech stack
- Add duplicate skill detection: refuse second skill for same subject
- Script consent tracking

**Phase 3c: Project guidance service (backend)**
- Create `ProjectGuidanceService`: detects weak practices
- Labeled facts: follow (mandatory), tolerate (accepted), do not copy (forbidden)
- Owner decision prompt UI

**Phase 3d: Frontend UI transformation (frontend + webview)**
- Replace "Select Agents" step with "Select Skills" step
- Add "Project Guidance" step for weak practices
- Replace agent card list with skill card list
- Add consent checkbox for skills with scripts
- Keep analysis step, cancel flow

**Phase 3e: Relevance gate and consent (frontend + backend)**
- Implement tech stack detection from dependencies
- Gate skill selection: show only relevant skills
- Consent UI for scripts in skills
- Recording consent in harness-state-store

**Phase 3f: Testing and visual review (Electron)**
- Run this repository setup: verify Angular, Nx, NestJS selected
- Run this repository setup: verify Fastify, Vitest not selected
- Weak repository setup: verify labeled facts shown
- Screenshot evidence for visual review

## Batches

Each batch is sized for one CLI lane run (~20 minutes). Dependency order is B1 → B2 → B3 → B4 → B5 → B6.

### B1: RPC method stubs and skill search integration

**Scope:**
- Add new RPC methods to `setup-rpc.handlers.ts`: `wizard:recommend-skills`, `wizard:search-skills`, `wizard:get-project-guidance`
- Keep old agent methods (mark deprecated)
- Add skill search integration via skillsSh API

**Files to write:**
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (add methods, keep old)

**Files to read:**
- `libs/backend/agent-generation/src/lib/services/agent-selection.service.ts` (to understand existing pattern)
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (current RPC surface)

**Acceptance:**
- New RPC methods compile
- Old agent methods still work
- Skill search returns list without errors
- No role names added

**Verify command:** `npm run verify -- -p rpc-handlers`

---

### B2: Skill selection service

**Scope:**
- Create `SkillSelectionService` (replaces `AgentSelectionService`)
- Implement relevance gate: tech stack detection from dependencies
- Detect duplicate skills for same subject
- Return ranked skill list

**Files to write:**
- `libs/backend/agent-generation/src/lib/services/skill-selection.service.ts` (new)
- Update `libs/backend/agent-generation/src/lib/di/register.ts` (register service, keep agent services)
- Update `libs/backend/agent-generation/src/lib/di/tokens.ts` (add SKILL_SELECTION_SERVICE token)

**Files to read:**
- `libs/backend/agent-generation/src/lib/services/agent-selection.service.ts` (pattern to follow)
- Dependency detection logic (look for tech stack sniffing)

**Acceptance:**
- Service compiles and registers
- Returns only skills with proven dependencies
- No duplicates for same subject
- Test passes

**Verify command:** `npm run verify -- -p agent-generation`

---

### B3: Project guidance service

**Scope:**
- Create `ProjectGuidanceService` (new)
- Detect weak practices: missing standards, inconsistencies
- Return labeled facts: follow (mandatory), tolerate (accepted), do not copy (forbidden)
- Owner decision prompt text

**Files to write:**
- `libs/backend/agent-generation/src/lib/services/project-guidance.service.ts` (new)
- Update `libs/backend/agent-generation/src/lib/di/register.ts` (register)
- Update `libs/backend/agent-generation/src/lib/di/tokens.ts` (add token)

**Files to read:**
- Workspace analysis output (what facts are available)
- CLAUDE.md rules for weak repository definition

**Acceptance:**
- Service compiles and registers
- Returns labeled facts for weak practices
- Owner decision text included
- Test passes

**Verify command:** `npm run verify -- -p agent-generation`

---

### B4: Frontend UI wizard transformation

**Scope:**
- Replace "Select Agents" step with "Select Skills" step in setup wizard
- Transform agent card list to skill card list
- Add consent checkbox for scripts
- Add "Project Guidance" step for weak practices
- Keep analysis, cancel flow

**Files to write/edit:**
- `libs/frontend/setup-wizard/src/lib/` (update components)
- `apps/ptah-extension-webview/src/` (update webview components)

**Files to read:**
- Current agent selection UI components
- RPC calls in wizard-rpc.service.ts

**Acceptance:**
- UI compiles
- Setup flow works: analysis → project guidance (if weak practices) → skill selection → summary
- No agent-related UI shown
- Consent checkbox visible when scripts present

**Verify command:** `npm run verify -- -t typecheck-templates -p ptah-extension-webview`

---

### B5: Integration and relevance gate

**Scope:**
- Wire skill selection service to RPC handlers
- Implement relevance gate in RPC methods
- Add script consent tracking
- Integration test: this repository shows correct skills

**Files to write/edit:**
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts` (wire skill service)
- `libs/backend/harness-sync/src/lib/state/skill-sync-gate.spec.ts` (consent tracking)

**Acceptance:**
- This repository detects Angular, Nx, NestJS
- This repository excludes Fastify, Vitest
- Scripts consent recorded
- Integration test passes

**Verify command:** `npm run verify -- -p rpc-handlers,agent-generation,harness-sync`

---

### B6: Visual review and acceptance

**Scope:**
- Run setup wizard in Electron for this repository
- Verify skill selection, project guidance UI
- Take screenshots
- Test weak repository mock

**Acceptance:**
- Setup shows correct skills
- UI renders correctly in Electron
- Project guidance step (if applicable) displays well
- Visual review evidence collected

**Verify command:** Manual in Electron

---

## Risks

| Risk | Control |
|------|---------|
| Skill search API not ready | Mock data / fallback list |
| Project guidance facts missing | Start with simple rules, expand later |
| Frontend changes break on one platform | Visual review on Electron |
| RPC backward compatibility breaks | Keep old methods, deprecation warning |
| Role name creep in new code | Role census check at each batch |

## Decisions needed from orchestrator

1. **Skill search source:** Use skillsSh APIs or mock data?
2. **Project guidance catalog:** Where should weak repository rules come from?
3. **Weak practices detection:** What specific rules define "weak" practices?
4. **Frontend file ownership:** Confirm before B4 starts (message parent)

## Clarifications Needed

- Phase 1 (PR #1147) must merge before push against main
- Phase 2 (feat/executor-neutrality) runs in parallel; confirm no file conflicts
