# Batch B Report: Prompt and Template Skill Routing (`TASK_2026_927_144e`)

## Changes

### B1. Orchestration skill (`plugins/ptah-core/skills/orchestration/`)
- `plugins/ptah-core/skills/orchestration/SKILL.md:136-140`: Added the `**Skill routing**` bullet under `## Invoking agents` requiring `software-architect` and `team-leader` to put a `Required Skills:` line (skill ids, or `none`) in every phase brief, `Task()` prompt, and `ptah_agent_spawn` task, chosen from the skills the host lists whose descriptions match the batch's stack and layer (each loaded when the host lists it; a role never stops work because an optional skill is absent), linking to `[agent-catalog.md § Skill routing](references/agent-catalog.md#skill-routing)`.
- `plugins/ptah-core/skills/orchestration/references/agent-catalog.md:65,78-93`: Added `Required Skills: <skill ids from the host's skill list (load when the host lists it), or none>` to the shared `Task()` invocation template and per-agent invocation table rows (`Context lines` and `Instruction` columns).
- `plugins/ptah-core/skills/orchestration/references/agent-catalog.md:101-131`: Added `### Skill routing` with the skill-routing rule and the single compact stack-cue → skill table covering all confirmed bundled skills across `ptah-core` (`ddd-architecture`, `humanize-library`, `ui-ux-designer`, `technical-content-writer`, `skill-creator`), `ptah-nx-saas` (`saas-workspace-initializer`, `nx-workspace-architect`, `nestjs-backend-patterns`, `resilient-nestjs-patterns`, `webhook-architecture`, `saas-platform-patterns`, `nestjs-deployment`), `ptah-angular` (`angular-frontend-patterns`, `angular-gsap-animation-crafter`, `angular-3d-scene-crafter`), `ptah-react` (`composition-patterns`, `react-best-practices`, `react-nx-patterns`), and `ptah-dotnet` (`dotnet-solution-initializer`, `dotnet-solution-architect`, `nx-dotnet-workspace`), each explicitly marked to load when the host lists it.
- `plugins/ptah-core/skills/orchestration/references/strategies.md:12-16,158-160,266-269`: Added the top-level `**Skill routing**` rule linking to `[agent-catalog.md § Skill routing](agent-catalog.md#skill-routing)` without duplicating the table; named `humanize-library` as a candidate skill in `REFACTORING` (when the host lists it) and `nestjs-deployment` as a candidate skill in `DEVOPS` (when the host lists it).

### B2. Role templates (`libs/backend/agent-generation/templates/agents/`)
- `libs/backend/agent-generation/templates/agents/_shared/tooling-precedence.md:22`: Updated the unassigned-skill bullet in `## Skill use` to positive guidance in third-person voice: when the task assigns none, this role checks the host's skill list and loads each skill that this role is allowed to use whose description matches the task's stack and layer before design or edits, when the host lists it (`That selection is only the unassigned entry. This role does not load a skill only because the role recognises the name.`), while preserving all rules on denial, absent skills, and not reciting from memory.
- `libs/backend/agent-generation/templates/agents/technical-content-writer.template.md:46-56`: Added the skill-load instruction in `## Role` and `## Inputs` mirroring `ui-ux-designer.template.md` (`lines 46-51`): load the `technical-content-writer` skill (`SKILL.md` and the reference files the current job needs — `CODEBASE-MINING.md`, `LANDING-PAGES.md`, `BLOG-POSTS.md`, `DOCUMENTATION.md`) before writing, when the host lists it, and honour any additional skills on the brief's `Required Skills:` line when the host lists them without stopping work when an optional skill is absent.
- `libs/backend/agent-generation/templates/agents/frontend-developer.template.md:81-85`: Added input rule #7 to honour the brief's `Required Skills:` line by loading each named skill before design or edits when the host lists it (or matching skills from the host's skill list when `none` or omitted), never stopping work because an optional skill is absent.
- `libs/backend/agent-generation/templates/agents/backend-developer.template.md:76-80`: Added input rule #6 to honour the brief's `Required Skills:` line by loading each named skill before design or edits when the host lists it (or matching skills from the host's skill list when `none` or omitted), never stopping work because an optional skill is absent.
- `libs/backend/agent-generation/templates/agents/devops-engineer.template.md:63-67`: Added input rule #5 to honour the brief's `Required Skills:` line by loading each named skill before design or edits when the host lists it (or matching skills from the host's skill list when `none` or omitted), never stopping work because an optional skill is absent.
- `libs/backend/agent-generation/templates/agents/software-architect.template.md:105-109,245`: Added input rule #6 to honour the brief's `Required Skills:` line when the host lists it and write a `Required Skills:` line (chosen from the host's skill list matching each component's stack and layer, or `none`) in the phase brief and `## Team-leader handoff`.
- `libs/backend/agent-generation/templates/agents/team-leader.template.md:74-79,228,480-482`: Added input bullet to honour the brief's `Required Skills:` line when the host lists it and write a `Required Skills:` line into every batch entry, executor prompt, and spawned lane task; added `- Required Skills:` to the `batches.md` schema and updated step 1 of the batch executor prompt.

## Verification

Command executed:
```powershell
npm run verify -- -p @ptah-extension/agent-generation | Select-Object -Last 40
```
(`plugins/ptah-core` has no `project.json`; `@ptah-extension/agent-generation` owns `libs/backend/agent-generation/templates/agents/**`.)

Tail output:
```text
 NX   Running target test for project @ptah-extension/agent-generation failed

Failed tasks:

- @ptah-extension/agent-generation:test

      797 |     const cloneDir = await seedSkillClone('scroll', '# v1');
      798 |     // Added after the hash: the content hash still matches.
    > 799 |     await symlink(outside, join(cloneDir, 'linked.md'));
          |     ^
      800 |
      801 |     const result = await reaper.reapRetired(userRoots, registry);
      802 |

      at Object.<anonymous> (src/lib/services/user-layer/user-layer-reap.spec.ts:799:5)

  ● UserLayerOrphanReaper — path results and retired skills.sh clones › reports a command clone with both removed paths, and keeps one whose sidecar is a symlink

    EPERM: operation not permitted, symlink 'C:\Users\abdal\AppData\Local\Temp\ptah-reap-retired-s9AcUB\linked-sidecar.json' -> 'C:\Users\abdal\AppData\Local\Temp\ptah-reap-retired-s9AcUB\home\.ptah\user\commands\audit.ptah-origin.json'

      825 |     );
      826 |     await rm(linked.sidecar);
    > 827 |     await symlink(realSidecar, linked.sidecar);
          |     ^
      828 |
      829 |     const result = await reaper.reapRetired(userRoots, registry);
      830 |

      at Object.<anonymous> (src/lib/services/user-layer/user-layer-reap.spec.ts:827:5)


Test Suites: 1 failed, 46 passed, 47 total
Tests:       2 failed, 1 skipped, 1461 passed, 1464 total
Snapshots:   0 total
Time:        107.267 s
Ran all test suites.
Warning: command "jest --passWithNoTests=true" exited with non-zero status code

  Run duration:      1m 55s
  Critical path:     1m 55s (1 task)
  Recoverable time:  <1ms

  Recommendations:
    - Speed up or split the longest tasks on the critical path:
        @ptah-extension/agent-generation:test    1m 55s
[verify 2026-11-10T18:50:36.108Z] lock released after 216.4s, exit code 1
```

All 46 template, policy, partial-resolution, and service test suites in `@ptah-extension/agent-generation` passed (`1,461` tests, including `template-sharing.guard.spec.ts`, `team-leader-template.policy.spec.ts`, `template-partial-resolver.spec.ts`, and `template-storage.service.spec.ts`). The only 2 failing tests are in untouched `src/lib/services/user-layer/user-layer-reap.spec.ts:799,827` due to Windows `EPERM: operation not permitted, symlink` in the host environment; per rules, reported without modifying that file.

## Decisions
- Placed the single compact stack-cue → skill table in `plugins/ptah-core/skills/orchestration/references/agent-catalog.md#skill-routing` and linked to it from `SKILL.md` and `references/strategies.md` to avoid table duplication and keep `SKILL.md` at 244 lines (under the 300-line budget).
- Used only the exact confirmed skill ids across `ptah-core`, `ptah-nx-saas`, `ptah-angular`, `ptah-react`, and `ptah-dotnet`, and explicitly stated "when the host lists it" in every instruction so roles never stop work when an optional skill is absent.
- Preserved stack-agnostic wording in `libs/backend/agent-generation/templates/agents/*.template.md` ("the host's skill list") and preserved all phrase guards in `template-sharing.guard.spec.ts` and `team-leader-template.policy.spec.ts`.
- Tool & skill availability note: Checked CLI skill list before starting; no matching Ptah domain skill is installed in this CLI's native skill list (`agy-customizations`, `antigravity-guide`, `hyperframes*`, `swarm`), so work proceeded directly from the repository files and audit specification.

## Not done
- None within Batch B scope. Left concurrent Batch A edits in the shared worktree untouched.
