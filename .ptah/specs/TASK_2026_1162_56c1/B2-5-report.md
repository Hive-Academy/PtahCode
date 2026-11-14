# B2-B5: Skill services

## Services created (`libs/backend/agent-generation/src/lib/services/`)

- `skill-recommendation.service.ts`: `SkillRecommendationService.recommend({ analysis, dependencies, search })`. It derives a keyword from each declared dependency (`@nestjs/core` gives `nestjs`). It searches skills.sh through the injected `search` function. It keeps a skill only when its id or name has the keyword as a token. No duplicates. The `evidence` field names the proving dependency. Sorted by score, then skill id.
- `project-guidance.service.ts`: `ProjectGuidanceService.getGuidance(analysis)` returns `{ facts, ownerDecisionPrompt }`. Labels: `follow`, `tolerate`, `do_not_copy`.
- `skill-selection.service.ts`: `SkillSelectionService.select(recommendations, userSelections?)` applies the relevance gate. A user selection only narrows the set. Output has `installOrder` (1-based, by score).
- `skill-consent.service.ts`: `SkillConsentService` with `hasScripts`, `canInstall`, `recordConsent`, and `computeContentHash` (sha256 over all files, sorted by path, bytes as stored). `hasScripts` fails closed. Script file types: .sh .ps1 .bat .cmd .js .mjs .cjs .ts .py .rb. It also detects npm install hooks and frontmatter `hooks:`. Consent is stored in `~/.ptah/setup-wizard/skill-consents.json` (atomic write). The service never logs the store contents.

## DI

`di/tokens.ts`: `SKILL_RECOMMENDATION_SERVICE`, `SKILL_PROJECT_GUIDANCE_SERVICE`, `SKILL_SELECTION_SERVICE`, `SKILL_CONSENT_SERVICE`. `di/register.ts` registers all four as singletons. Old agent services are unchanged.

## Tests

`skill-services.spec.ts` has the NestJS dual cases:

- Negative: real `package.json` dependencies of this repository (no `@nestjs/*`). Angular and Nx are selected. NestJS is not.
- Positive: fixture with `@nestjs/core`. NestJS is selected.

It also covers no duplicates, evidence, sorted rank, selection gate, guidance labels, script detection, fail-closed, and hash-bound consent.

## Verification

- `check-role-census.ts`: exit 0 (no increases).
- `npm run validate-skill`: passed, 0 errors, 0 warnings.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/agent-generation`: passed (exit 0).
- `npm run verify -- -p @ptah-extension/agent-generation -- --testPathPatterns=skill-services`: the test phase passed (1 task succeeded). Its lint and typecheck phase failed only because the extra Jest flag reached those targets. The separate run above covers them.

## Notes

- `DeepProjectAnalysis` in `@ptah-extension/shared` has only `projectType` and `frameworks`. The recommendation service takes the real dependency names as a separate input, because the shared type has no dependency data.
- Skill invocation was not available in this lane.
