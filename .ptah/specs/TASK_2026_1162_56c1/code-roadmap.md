# Code Roadmap — Phase 3 Implementation

Maps each batch to files and existing code patterns.

## Current state (before Phase 3)

**Setup wizard RPC surface:**
- `wizard:recommend-agents` → AgentRecommendationService (line 508-759 in setup-rpc.handlers.ts)
- `wizard:preview-generation`, `wizard:submit-selection`, `wizard:retry-item` → agent generation flow
- `wizard:list-agent-packs`, `wizard:plan-pack-install`, `wizard:install-pack-agents` → pack install
- `wizard:list-analyses`, `wizard:load-analysis` → analysis storage
- `wizard:deep-analyze`, `wizard:cancel-analysis` → analysis lifecycle

**Skills RPC surface (exists):**
- `skillsSh:search` → SkillsShRpcHandlers.registerSearch (line 232-294)
- `skillsSh:detectRecommended` → SkillsShRpcHandlers.registerDetectRecommended (line 791-841)
- `skillsSh:install` → SkillsShRpcHandlers.registerInstall (line 349-464)
- `skillsSh:makeGlobal` → SkillsShRpcHandlers.registerMakeGlobal (line 560-612)

**Frontend UI:**
- Setup wizard: `libs/frontend/setup-wizard/src/lib/` (WizardRpcService at line 439, recommendAgents)
- Onboarding: `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts` (wizard:recommend-agents caller)
- Webview: `apps/ptah-extension-webview/src/` (renderer components)

**Agent generation services:**
- ANALYSIS_STORAGE_SERVICE, ANALYSIS_FRESHNESS_SERVICE, MULTI_PHASE_ANALYSIS_SERVICE (keep)
- AGENT_RECOMMENDATION_SERVICE (remove Phase 5)
- AGENT_SELECTION_SERVICE (remove Phase 5)
- Tokens defined: `libs/backend/agent-generation/src/lib/di/tokens.ts`
- DI registration: `libs/backend/agent-generation/src/lib/di/register.ts`

**Harness sync (existing):**
- SkillSyncGate: `libs/backend/harness-sync/src/lib/state/skill-sync-gate.spec.ts`
- HarnessPropagationService: determines which providers get skills
- transformSkillMarkdown: rewrite for rival providers

## Batch implementation roadmap

### B1: RPC contract and stub registration

**Add types to shared:**
- File: `libs/shared/src/lib/types/rpc.types.ts`
  - Add: `WizardRecommendSkillsParams`, `WizardRecommendSkillsResponse`
  - Add: `WizardSearchSkillsParams`, `WizardSearchSkillsResponse`
  - Add: `WizardGetProjectGuidanceParams`, `WizardGetProjectGuidanceResponse`
  - Add: `WizardInstallSkillsWithConsentParams`, `WizardInstallSkillsWithConsentResponse`
  - Pattern: follow `WizardDeepAnalyzeParams`, `WizardAnalysisStatusResponse`

**Add schemas to setup-rpc:**
- File: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.schema.ts`
  - Add Zod schemas (pattern: `WizardDeepAnalyzeParamsSchema`)
  - Reference new RPC types

**Register stub methods in setup-rpc:**
- File: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
  - Add: `registerRecommendSkills()` (stub, returns empty array)
  - Add: `registerSearchSkills()` (stub, returns empty array)
  - Add: `registerGetProjectGuidance()` (stub, returns empty facts)
  - Add: `registerInstallSkillsWithConsent()` (stub, returns success)
  - Pattern: follow existing `registerRecommendAgents()` (line 508-759)
  - Call in `register()` method (line 175-192)

**Tests:**
- Verify RPC method names resolve
- Verify parameter schema validation
- Verify old agent methods still callable

---

### B2: Skill recommendation service

**Create service:**
- File: `libs/backend/agent-generation/src/lib/services/skill-recommendation.service.ts` (new)
  - Pattern: follow `AgentRecommendationService`
  - Interface: `(analysis: DeepProjectAnalysis) => SkillRecommendation[]`
  - Rank skills by evidence strength
  - Use existing analysis output

**Register in DI:**
- File: `libs/backend/agent-generation/src/lib/di/tokens.ts`
  - Add: `SKILL_RECOMMENDATION_SERVICE = Symbol('SkillRecommendationService')`
- File: `libs/backend/agent-generation/src/lib/di/register.ts`
  - Add: `container.registerSingleton(SKILL_RECOMMENDATION_TOKENS.SKILL_RECOMMENDATION_SERVICE, SkillRecommendationService)`

**Update RPC handler:**
- File: `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts`
  - Update: `registerRecommendSkills()` to use SkillRecommendationService
  - Inject: `@inject(SKILL_RECOMMENDATION_TOKENS.SKILL_RECOMMENDATION_SERVICE)`

**Tests:**
- Rank skills by dependency proof
- Avoid duplicates (one skill per subject)
- Return evidence for each recommendation

---

### B3: Project guidance service

**Define schema:**
- Type: `ProjectGuidance { category: string, label: "follow"|"tolerate"|"do_not_copy", fact: string, evidence?: string }`
- Examples: testing framework, linter, type checking, file naming

**Create service:**
- File: `libs/backend/agent-generation/src/lib/services/project-guidance.service.ts` (new)
- Analyze workspace for weak practices
- Return labeled facts + owner decision text

**Register in DI:**
- Add token and registration (pattern: B2)

**Update RPC handler:**
- Update: `registerGetProjectGuidance()` to use service

**Tests:**
- Detect weak practices
- Return labeled facts
- Include owner decision text

---

### B4: Skill selection service

**Create service:**
- File: `libs/backend/agent-generation/src/lib/services/skill-selection.service.ts` (new)
- Pattern: follow `AgentSelectionService` (line 114 in agent-selection.service.ts)
- Interface: `(recommendations: SkillRecommendation[]) => SelectedSkill[]`
- **Relevance gate:** exclude skills not recommended

**Register in DI:**
- Add token and registration

**Tests:**
- Gate applied: only recommended skills selected
- One skill per subject enforced

---

### B5: Consent enforcement service

**Create service:**
- File: `libs/backend/agent-generation/src/lib/services/skill-consent.service.ts` (new)
- Script detection: check skill files for postinstall, build scripts, etc.
- Consent storage: `SkillConsentRecord { skillName, version, consentDate }`
- Interface: `canInstall(skillName, version) => boolean`

**Register in DI:**
- Add token and registration

**Store consent:**
- File: `libs/backend/harness-sync/src/lib/state/skill-sync-gate.ts` (extend to track consent)
- Or: new file `libs/backend/agent-generation/src/lib/services/skill-consent-store.ts`

**Tests:**
- Script detection
- Consent enforcement (refuse/allow)
- Version binding

---

### B6: Install flow wiring

**Integrate skillsSh:install:**
- Use existing: `SkillsShRpcHandlers.registerInstall()` (line 349-464)
- Pattern already exists; wire from setup-rpc handlers

**Propagation:**
- Use existing: `HarnessPropagationService` (libs/backend/harness-sync)
- Pattern: skill-sync-gate.spec.ts shows integration

**Markdown rewriting:**
- Use existing: `transformSkillMarkdown()` (skill-transform.ts:114)

**Tests:**
- Install succeeds and files written
- Propagation fires
- Markdown transformed per provider

---

### B8: Skill selection UI

**Replace agent selection:**
- File: `libs/frontend/setup-wizard/src/lib/components/skill-selection.component.ts` (new)
- Pattern: follow existing agent-selection UI
- Show skill cards instead of agent cards

**Update wizard-rpc:**
- File: `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts`
  - Update: `recommendSkills()` (was recommendAgents, line 439)
  - Update: `submitSkillSelection()` (was submitAgentSelection)

**Onboarding caller:**
- File: `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts` (line 234)
  - Update: `wizard:recommend-agents` → `wizard:recommend-skills`

**Webview:**
- File: `apps/ptah-extension-webview/src/` (components)
  - Update for skill cards

**Tests:**
- Step displays, cards render
- Cancel works
- Selection submits

---

### B9: Project guidance UI

**Create component:**
- File: `libs/frontend/setup-wizard/src/lib/components/guidance-decision.component.ts` (new)
- Show labeled facts: follow (bold), tolerate (muted), do_not_copy (red)
- Owner decision prompt

**Update store:**
- File: `libs/frontend/onboarding/src/lib/analyze/guidance-step.store.ts` (new)
- Call: `wizard:get-project-guidance`

**Tests:**
- Facts displayed with labels
- Owner choice captured

---

### B10: Consent UI

**Create component:**
- File: `libs/frontend/setup-wizard/src/lib/components/skill-consent.component.ts` (new)
- Show checkbox only for scripts-bearing skills
- Persist checkbox state

**Update flow:**
- Before install step, check consent

**Tests:**
- Checkbox shown for scripts
- State persists
- Submit blocked if unchecked and scripts present

---

### B11: Visual review

**Electron screenshots:**
- Normal flow: analysis → (guidance if weak practices) → skills → consent → summary
- Weak practices: verify labeled facts shown
- Compare with intended step order

**Files to screenshot:**
- Electron renderer: `apps/ptah-electron/src/` (main app)
- Webview: `apps/ptah-extension-webview/src/`

