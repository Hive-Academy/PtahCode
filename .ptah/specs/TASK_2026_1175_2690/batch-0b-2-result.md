# Changed files

- `libs/shared/src/lib/types/phase-contract.types.ts` and `phase-dispatch.schema.ts`: version 2 machine capability contract with version 1 reads defaulting to an empty list.
- `libs/backend/lane-routing/**`: strict phase parsing, optional `PhaseDefinitionReader` port and DI token, gate stage normalization of omitted machine requirements, logged compatibility fallback, removal of the old default table from `ranking/capability.ts`, and focused specs.
- Twelve phase files in `plugins/ptah-core/skills/orchestration/phases/` and their `.claude/skills/orchestration/phases/` copies: version 2 and explicit machine lists.
- `scripts/validate-orchestration-skill.ts`: validates version and machine tokens.
- `content-manifest.json`: regenerated for the phase file changes.

# Decisions and assumptions

- `design` and `visual-review` declare `[browser]`; the other ten phase files declare `[]`. The prose `requiredCapabilities` field remains separate.
- At gate stage, caller supplied `requiredCapabilities`, including `[]`, takes precedence. Omitted lists are read from the active phase definition through the optional reader port. When no reader is wired or a read/parse fails, the router logs a warning and retains the former browser requirement for design and visual-review.
- The local CLI skill inventory had no matching routing/TypeScript skill; repository instructions were applied directly.

# Checks

- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`: passed after the routing changes.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: passed.
- Initial focused Jest (gate, resolver, hard constraints): 102 passed, 2 new assertions failed because the design subagent was selected rather than a lane. Assertions corrected. Final gate spec run via `node scripts/verify.mjs --exec --task 0b2-gate-final -- npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts`: 53 passed.
- `npx eslint` on the new routing files: passed with no warnings after removing two unused imports.
- `npm run validate-skill`: passed, 0 errors and 0 warnings.
- SHA256 comparison of both orchestration folders: 21 files, 0 mismatches.
- `npm run manifest:generate`: passed; wrote 237 files with content hash sha256:1a195b58544138e015a64b5f0658bd8b67002d3a3e122635be102e73cf7f57cf.
- `npm run manifest:check`: passed; manifest up to date with the same hash.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts`: exit 0; counts at or below baselines.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, no counts over baseline.

# Not done

- The optional `PhaseDefinitionReader` port is not registered by the host composition roots because those files are outside Batch 0b-2 ownership. Until wired, the logged compatibility fallback preserves browser gating.

# Risks for the coordinator

- In `apps/ptah-electron/src/di/phase-2-libraries.ts`, register an implementation of `LANE_ROUTING_TOKENS.PHASE_DEFINITION_READER` before `registerLaneRoutingServices(container, logger)`; its `read(kind)` must return the active orchestration skill's `phases/<kind>.md` text. Apply the same registration in `libs/backend/cli-engine/src/lib/container.ts` for CLI compatibility. Do not rely on the repository copy if a user clone is active. This lane did not edit those files.
- A Ptah progress report was not delivered because the parent inbox was full; this file holds the integration request.
