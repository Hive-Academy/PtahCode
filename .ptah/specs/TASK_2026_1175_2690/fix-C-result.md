# fix-C result

## Changed files

- `libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts`, `src/index.ts`, and `route-decide.service.ts`: export and use one effective machine capability rule for v1 and v2 definitions.
- `libs/backend/skill-synthesis/src/lib/skill-enhancer.service.ts`, `skill-enhancer.phase-file.spec.ts`, and `skill-file-writer.port.ts`: preserve effective capabilities during proposal validation, allow repair of invalid current files against the legacy baseline, and name the stale live-body hash explicitly.
- `libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/skill-clone-file-path.ts`, its spec, and `skills-synthesis-rpc.handlers.spec.ts`: accept missing phase folders after checking the nearest existing ancestor; cover missing snapshot phases and real clone fixtures.
- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-mirror.service.ts`, `user-layer-skill-phase-writer.ts`, and `user-layer-enhance.spec.ts`: expose the stale result type and `liveBodyHash`; remove a trailing literal `\n` from the spec.

## Decisions

- Version 1 phase definitions use the existing legacy browser table. Version 2 uses declared `machineCapabilities`. A malformed current file uses the legacy table as a repair baseline; the candidate still must parse.
- No installed local backend skill matched this change in skill discovery, so repository guidance was applied directly.

## Checks

- `npx tsc --noEmit --project libs/backend/{lane-routing,skill-synthesis,rpc-handlers,agent-generation}/tsconfig.{lib,spec}.json` (eight individual commands): all exit 0. Agent-generation spec initially failed on the inherited trailing literal `\n`; it passed after removal. RPC spec was rerun after the fixture edit and passed.
- Focused Jest through `node scripts/verify.mjs --exec --task fixC-* -- npx jest --config ... --runInBand --coverage=false --runTestsByPath ...`: lane-routing 75/75, skill-synthesis 12/12, rpc-handlers 174/174, agent-generation 22/22 passed. The first RPC run found two tests using a nonexistent clone fixture; the corrected rerun passed.
- `npx eslint <12 changed TypeScript files>`: exit 0; 10 warnings in existing large files and resolver code.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; baseline unchanged.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts`: exit 0; baseline unchanged.
- `git diff --check` and a single-newline scan of all 12 changed TypeScript files plus this report: no whitespace or trailing-text errors.

## Not done

- C4, D2 host wiring, and D7 were excluded by the lane request.

## Risks

- The existing small path-check to write window remains when another local process can modify the filesystem outside Ptah's slug lock.
