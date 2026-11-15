# Phase 6 fix report

| Finding | Change |
| --- | --- |
| F1 | Restored `orchestration-namespace.builder.ts` to `origin/main`; `getNextPhase` keeps strategy routing (line 158). Its diff against `origin/main` is empty. |
| F2 | Open: coordinator owns `content-manifest.json` regeneration. I did not edit it. |
| F3 | Removed pack routing from the builder. The skill text drives packs. Added an extra-phase fixture and parser self-test at `scripts/orchestration-skill/pack-parser.spec.ts:8`. |
| F4 | Pack flow has one source in `plugins/ptah-core/skills/orchestration/packs/*.md`; parser reads it at `scripts/orchestration-skill/pack-parser.ts:12`. |
| F5 | Builder returned to main. `getNextPhase` is private, so the requested direct exported-API spec was skipped. Existing builder spec passes 18 tests. |
| F6 | Added `stepMap` to `PackDefinitionV1` at `libs/shared/src/lib/types/phase-contract.types.ts:41`, updated its spec at line 21, and made the validator consume parsed packs at `scripts/validate-orchestration-skill.ts:444`. |
| F7 | Corrected FEATURE outputs and gates in `phase-6-examples/software-task.md:11`; research optional plan at `phase-6-examples/research-task.md:11`. The self-test checks real pack flows at `pack-parser.spec.ts:18`. |
| F8 | Corrected the docs table and routing statement at `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md:45`. |
| F9 | Corrected title at `plugins/ptah-core/skills/orchestration/packs/software.md:1`. Parser checks exact title, sections, phases, and total skeleton map at `pack-parser.ts:12`. |
| F10 | Software pack exists in both skill trees; no commit or push, as requested. |

Checks: parser Jest 3/3; shared Jest 3/3; builder Jest 18/18; `npm run validate-skill` passed with 0 errors and 0 warnings; ESLint 0 errors, 2 existing validator warnings; `git diff --check` clean; skill trees byte-identical (25 files), LF only; builder diff against `origin/main` empty. `npx tsc --noEmit --project scripts/tsconfig.json` fails on many existing rootDir and module resolution errors across unrelated projects, so it is not a focused signal.

Open items: coordinator regenerates manifest. No direct `getNextPhase` spec because that function is not exported. Retired role names remain only in the existing legacy agent catalog, outside active workflow files.

fix round 1 complete
