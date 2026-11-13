# B2-B5 Combined: Backend services (Skill recommendation, Project guidance, Skill selection, Consent enforcement)

## Context

These four batches create backend services that support Phase 3. They can be implemented by one lane because they edit shared DI files in coordinated fashion. All four are internal services, not RPC-exposed yet.

**Dependency:** Requires B1 (RPC types) to be complete first. Uses `WizardRecommendSkillsResponse`, `WizardGetProjectGuidanceResponse`, `WizardInstallSkillsWithConsentParams` types.

## B2: Skill recommendation service

**File:** `libs/backend/agent-generation/src/lib/services/skill-recommendation.service.ts` (new)

**Signature:**
```typescript
export class SkillRecommendationService {
  recommend(analysis: DeepProjectAnalysis): SkillRecommendation[];
}
```

**Logic:**
- Read tech stack from analysis output
- Search skillsSh for matching skills
- Rank by dependency proof (exact match > partial > name match)
- Return array sorted by rank
- Do NOT return duplicates (one skill per subject)

**Acceptance:**
- Service compiles
- Returns skills for detected techs (Angular, Nx)
- Does NOT return Fastify, Vitest when not in analysis
- Includes evidence field explaining proof

---

## B3: Project guidance service

**File:** `libs/backend/agent-generation/src/lib/services/project-guidance.service.ts` (new)

**Type:**
```typescript
export interface ProjectGuidance {
  category: string; // "testing", "typing", "formatting", etc.
  label: "follow" | "tolerate" | "do_not_copy"; 
  fact: string;
  evidence?: string;
}
```

**Signature:**
```typescript
export class ProjectGuidanceService {
  analyze(analysis: DeepProjectAnalysis): { facts: ProjectGuidance[], ownerDecisionPrompt: string };
}
```

**Logic:**
- Scan analysis for weak practices (missing standards, inconsistencies)
- Return labeled facts:
  - "follow": mandatory (e.g., "Use Jest for tests")
  - "tolerate": accepted practices (e.g., "Some legacy files use CommonJS")
  - "do_not_copy": forbidden patterns (e.g., "Do not add Fastify; NestJS is the platform")
- Include owner decision text for final step

**Acceptance:**
- Service compiles
- Returns facts for detected weak practices
- Labels correctly applied
- Owner decision text clear

---

## B4: Skill selection service

**File:** `libs/backend/agent-generation/src/lib/services/skill-selection.service.ts` (new)

**Signature:**
```typescript
export class SkillSelectionService {
  select(recommendations: SkillRecommendation[], userSelections?: string[]): SelectedSkill[];
}
```

**Logic:**
- Apply relevance gate: exclude non-recommended skills
- For this repository: ensure NestJS is excluded (add negative test with fixture package.json containing @nestjs/core)
- If user selected skills, validate they are recommended
- Return selected skills with install order

**Acceptance:**
- Service compiles
- Relevance gate applied
- NestJS negative test passes (fixture package.json with @nestjs/core correctly excludes NestJS when tech stack doesn't match)

---

## B5: Consent enforcement service

**File:** `libs/backend/agent-generation/src/lib/services/skill-consent.service.ts` (new)

**Type:**
```typescript
export interface SkillConsentRecord {
  skillName: string;
  contentHash: string; // SHA256 of skill package files
  consentDate: Date;
}
```

**Script detection logic:**
```typescript
const SCRIPT_FILE_TYPES = ['.sh', '.ps1', '.bat', '.cmd', '.js', '.mjs', '.cjs', '.ts', '.py', '.rb'];
const SCRIPT_INDICATORS = ['postinstall', 'install', 'preinstall', 'prepublish']; // npm script names
```

**Signature:**
```typescript
export class SkillConsentService {
  hasScripts(skillPackagePath: string): boolean; // true if contains executable files, npm scripts, or hooks
  canInstall(skillName: string, contentHash: string): boolean; // true if consent record exists for this hash
  recordConsent(skillName: string, contentHash: string): void; // store consent
}
```

**Logic:**
- `hasScripts`: Scan skill package for executable file types, npm scripts, frontmatter hooks
  - Check: files ending in .sh, .ps1, .bat, .cmd, .js, .mjs, .cjs, .ts, .py, .rb
  - Check: frontmatter for hooks, tool permissions
  - Check: npm scripts containing postinstall, install, preinstall, prepublish
  - Fail closed: if directory unreadable, return true
- `canInstall`: Check if consent record exists for skill + content hash
- `recordConsent`: Store consent record (do NOT log the store)

**Acceptance:**
- Service compiles
- `hasScripts` detects scripts in test package (with executable files, npm scripts)
- `hasScripts` returns false for plain skill
- `canInstall` rejects without consent, allows with valid consent record
- Consent is version-bound (hash-based, not version string)
- Test both allowed and refused install scenarios

---

## DI registration

**Update:** `libs/backend/agent-generation/src/lib/di/tokens.ts`

Add tokens:
```typescript
SKILL_RECOMMENDATION_SERVICE = Symbol('SkillRecommendationService');
PROJECT_GUIDANCE_SERVICE = Symbol('ProjectGuidanceService');
SKILL_SELECTION_SERVICE = Symbol('SkillSelectionService');
SKILL_CONSENT_SERVICE = Symbol('SkillConsentService');
```

**Update:** `libs/backend/agent-generation/src/lib/di/register.ts`

Add registrations in `register()`:
```typescript
container.registerSingleton(AGENT_GENERATION_TOKENS.SKILL_RECOMMENDATION_SERVICE, SkillRecommendationService);
container.registerSingleton(AGENT_GENERATION_TOKENS.PROJECT_GUIDANCE_SERVICE, ProjectGuidanceService);
container.registerSingleton(AGENT_GENERATION_TOKENS.SKILL_SELECTION_SERVICE, SkillSelectionService);
container.registerSingleton(AGENT_GENERATION_TOKENS.SKILL_CONSENT_SERVICE, SkillConsentService);
```

---

## Verification

After writing all four services:

1. `npm run verify -- -p agent-generation` (lint, typecheck)
2. `npx ts-node --transpile-only tools/role-census/check-role-census.ts` (exit 0, no increases)
3. `npm run validate-skill` (0 errors)

## Output

Report in B2-5-report.md with:
- Services implemented (4 files)
- DI registration complete
- Verification results (test output showing NestJS gate, consent enforcement)
- No role names added
