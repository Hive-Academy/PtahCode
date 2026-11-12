# Frontend file list for B8-B10 (Skill selection, guidance, consent UI)

Required to send to parent BEFORE B8 frontend implementation starts.

## B8: Skill selection UI

**New files to create:**
- `libs/frontend/setup-wizard/src/lib/components/skill-selection.component.ts`
- `libs/frontend/setup-wizard/src/lib/components/skill-selection.component.html`
- `libs/frontend/setup-wizard/src/lib/components/skill-selection.component.spec.ts`

**Existing files to modify:**
- `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts` (add/update recommendSkills, submitSkillSelection methods)
- `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts` (update to call wizard:recommend-skills instead of wizard:recommend-agents, add skill step to flow)
- `apps/ptah-extension-webview/src/app/` (unknown exact components; webview renderer components for skill cards)

**Render library changes (minor):**
- `libs/frontend/setup-wizard/src/lib/` (may need shared skill card component if not reusing agent card)

## B9: Project guidance UI

**New files to create:**
- `libs/frontend/setup-wizard/src/lib/components/guidance-decision.component.ts`
- `libs/frontend/setup-wizard/src/lib/components/guidance-decision.component.html`
- `libs/frontend/setup-wizard/src/lib/components/guidance-decision.component.spec.ts`
- `libs/frontend/onboarding/src/lib/analyze/guidance-step.store.ts` (new)

**Existing files to modify:**
- `libs/frontend/onboarding/src/lib/analyze/analysis-step.store.ts` (add guidance step conditionally if weak practices detected)
- `apps/ptah-extension-webview/src/app/` (webview components for guidance display)

## B10: Consent UI

**New files to create:**
- `libs/frontend/setup-wizard/src/lib/components/skill-consent.component.ts`
- `libs/frontend/setup-wizard/src/lib/components/skill-consent.component.html`
- `libs/frontend/setup-wizard/src/lib/components/skill-consent.component.spec.ts`

**Existing files to modify:**
- `libs/frontend/setup-wizard/src/lib/services/wizard-rpc.service.ts` (verify consent before install, record consent response)
- `apps/ptah-extension-webview/src/app/` (webview checkbox component)

## Consolidation opportunity

**B8 and B10 could merge** (both are selection-like steps):
- Same component folder (`libs/frontend/setup-wizard/src/lib/components/`)
- Both modify wizard-rpc.service.ts
- Both update analysis-step.store.ts
- Combined scope: "Skill selection and consent" step(s)

If merged: rename B10 → consolidate into B8 as "B8: Skill and consent UI", reduce batch count to 10 total.

## Backend dependency for frontend

- B8 needs: B2 (SkillRecommendationService) ready, B1 (RPC types) ready
- B9 needs: B3 (ProjectGuidanceService) ready, B1 (RPC types) ready
- B10 needs: B5 (SkillConsentService) ready, B1 (RPC types) ready

Frontend batches can run in parallel after their backend services are complete and wired to RPC.

## Renderer note

Webview is `apps/ptah-extension-webview/src/` which uses Angular and imports from setup-wizard and onboarding libs. Exact component structure depends on existing webview architecture.

## Frontend typecheck

After template changes in B8-B10, must run:
`npm run verify -- -t typecheck-templates -p ptah-extension-webview`

This checks all templates that ptah-extension-webview imports, including templates from libs.

## Files not owned by B8-B10

Do not edit:
- Agent-related components (keep for backward compatibility through Phase 5)
- Harness sync UI
- Agent generation preview/submit flow (B4 handles that separately)
