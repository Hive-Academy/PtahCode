# Decisions — TASK_2026_1162_56c1

Audit log for Phase 3 implementation. Parent program task: TASK_2026_977_0876.

| ID | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| P3-D1 | Plan review by codex lane (different family) | Other lanes at limit; codex has room | ptah_agent_list 2026-11-12T18:33Z: codex 22% weekly | Yes |
| P3-D2 | 6-batch decomposition: B1 RPC stubs → B2 skill selection → B3 project guidance → B4 frontend UI → B5 integration → B6 visual review | Different decomposition proposed by reviewer | Phase 1 was 9 batches; Phase 3 is smaller in scope | Yes |
| P3-D3 | Relevance gate: check dependencies for tech stack proof | Use fallback list; mock data; no gate | Parity inventory decision: "Select a skill only when a dependency proves the technology" | Yes |
| P3-D4 | Weak repository rules: owner decision at setup | Silent selection; defer to Phase 5 | Phase 3 acceptance: "Setup of a repository with weak practices writes labeled facts and asks for the owner decision" | Yes |
| P3-D5 | Backward compatibility: keep agent RPC methods through Phase 5 | Remove in Phase 3; Phase 5 handles migration | Program rule: agent generation stays callable until Phase 5 | Yes |

## Code structure findings

**Skills RPC already exists:**
- `SkillsShRpcHandlers` (line 163-1055) has registerDetectRecommended, registerSearch, registerInstall, registerMakeGlobal
- Uses SkillsShApiClient, detects technologies, matches skills
- Integrates with HarnessPropagationService and SkillSyncGate

**Setup RPC current methods:**
- registerRecommendAgents (508-759) - will transform to registerRecommendSkills
- registerListAgentPacks (910-918) - will transform to registerListSkillCatalog  
- registerPlanPackInstall (924-933) - will transform to registerPlanSkillInstall
- registerInstallPackAgents (938-947) - will transform to registerInstallSkills

**Agent-generation services:**
- Tokens exist: ANALYSIS_STORAGE_SERVICE, ANALYSIS_FRESHNESS_SERVICE, MULTI_PHASE_ANALYSIS_SERVICE (keep)
- AGENT_RECOMMENDATION_SERVICE (remove Phase 5) → need SKILL_RECOMMENDATION_SERVICE (new, Phase 3)
- AGENT_SELECTION_SERVICE (remove Phase 5) → need SKILL_SELECTION_SERVICE (new, Phase 3)
- Need PROJECT_GUIDANCE_SERVICE (new, Phase 3)

## Clarifications from plan review (Codex, completed 18:38 UTC)

**Critical findings (must fix):**

1. **P3-F1: NestJS acceptance test invalid** — No `@nestjs/*` dependency in this workspace. skillsSh detector looks for `@nestjs/core`, so test would reward false positive. Options: (a) find valid NestJS proof source, (b) remove NestJS from acceptance criteria.

2. **P3-F2: Install flow unassigned** — Missing batch for: preview, submit, retry, browse install, propagation, Markdown rewriting. These call skillsSh:install and harness sync but not planned.

3. **P3-F3: B1 incomplete** — Needs shared RPC types (WizardRecommendSkillsParams, WizardSkillInstallResult, etc.), method registry in setup-rpc.handlers, handler tests, caller updates in wizard-rpc.service. Not just setup-rpc.handlers.ts.

4. **P3-F4: Consent enforcement missing** — B4 adds UI checkbox; B5 says "record consent" but names no code that blocks install without approval. Must define: (a) script detection, (b) consent storage and binding to skill version, (c) install entry points that enforce.

5. **P3-F5: B4 and B5 too large** — B4 combines steps, guidance, consent, cancel in ~20 min. B5 repeats relevance gate. Split B4 by flow (skill selection, guidance decision, consent), connect each service before UI, include onboarding caller.

**Additional findings:**
- B1 must say whether methods return real recommendations or mock/stub data
- B3 must define: weak practices evidence schema, label meanings (follow, tolerate, do not copy)
- Need exact file lists for each batch
- Old agent RPC must stay callable through Phase 5
- Phase 1 required before B1; Phase 2 parallel after file overlap confirmed (done: no conflicts)
- NestJS false positive is **highest risk**; script consent enforcement is **high risk**
- Tests need positive and negative evidence, including ambiguous names and missing manifests

**Acceptance from review:** Plan verdict REVISE. Fix five findings and resubmit before batch assignment.

## User/parent decisions (2026-11-12, approved revised plan)

| ID | Decision | Details |
|---|---|---|
| P3-U1 | NestJS in acceptance | Two test cases (do not mix):
  - **Negative:** Input real dependencies of this repository (no @nestjs/*). Expected: Angular, Nx selected; NestJS, Fastify, Vitest NOT selected.
  - **Positive:** Input fixture package.json with @nestjs/core. Expected: NestJS skill selected.
  Relevance gate must correctly handle both. Do not edit program definition. |
| P3-U2 | Script detection method | Deterministic scan of skill package files (not skill names). Files with executable types (.sh, .ps1, .bat, .cmd, .js, .mjs, .cjs, .ts, .py, .rb) or shebang lines = "has scripts". Also check frontmatter for hooks/tool permissions. Fail closed: unreadable package treated as "has scripts". Keep file types in one constant with test. |
| P3-U3 | Consent binding | Bind to content hash of skill package (all files, path + bytes, sorted, line endings as stored). Version for display only. Changed hash requires new consent. Do NOT log consent store. |

## Implementation constraints (user)

- 11 batches is upper limit; merge UI batches where possible
- Run file-disjoint backend batches in parallel, max 3 lanes at a time
- Before first frontend edit (B8), report exact file list for B8-B10 to parent
- Do not edit `.ptah/specs/TASK_2026_977_0876/` (program definition)
- Track implementer family for each batch (needed for code-logic review; review family must differ from implementer)

## Batch implementer assignments

| Batch | Lane | Family | Status |
|-------|------|--------|--------|
| B1 | codex | codex | running |
| B2-B5 | (pending) | (pending) | planned |
| B6 | (pending) | (pending) | planned |
| B8-B10 | (pending) | (pending) | planned |
| B11 | (pending) | (pending) | planned |

**Code-logic review assignment rule:** If B2-B5 are Claude Api, review must be codex or other family.
