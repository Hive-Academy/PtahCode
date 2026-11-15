# Changed files

- `libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts` and its spec: version 1 missing machine list parses as `[]`; version 2 requires the field.
- `libs/shared/src/lib/types/phase-dispatch.schema.ts`: same version rules at the wire boundary.
- `libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts` and its spec: optional clone-active predicate (defaults true); per-kind fallback to the plugin when a clone phase file is missing; repository-root fixture path.
- `libs/backend/lane-routing/src/lib/route-decide.service.ts` and gate spec: warning includes `PhaseDefinitionError.code`; unavailable-reader warning logs once per service instance; v1 gate uses legacy browser list and logs it; fixture path fixed.
- `scripts/validate-orchestration-skill.ts`: rejects version 2 without machineCapabilities.
- `libs/shared/src/lib/types/rpc/host-source-registry.baseline.ts`: only `usage:getDimensionTotals` added; generator formatting rewrite was removed.

# Decisions

- Explicit `requiredCapabilities: []` remains authoritative.
- Clone activation is supplied through an optional predicate so hosts can use their effective disabled-skill policy without adding host dependencies to lane-routing.
- No applicable local skill was available from skill discovery.

# Checks

- `node scripts/verify.mjs --exec --task fixA-lane-contract -- npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath <three focused specs>`: PASS, 80 tests.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`: PASS.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/shared/tsconfig.spec.json`: PASS.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`: PASS.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.spec.json`: PASS.
- `npx eslint <changed source and spec files>`: PASS, 0 errors and 10 warnings in existing code.
- `npm run validate-skill`: PASS, 21 files and 0 errors.
- `npm run manifest:check`: PASS.
- `git diff --no-index --quiet -- plugins/ptah-core/skills/orchestration .claude/skills/orchestration`: PASS, byte-identical.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts`: PASS.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: FAIL. First run found `libs/backend/rpc-handlers` at 2 unsuppressed sites versus baseline 1. A later run failed parsing `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts` while fix-B was editing it. Both are outside fix-A ownership; no baseline was raised.
- `node scripts/verify.mjs --exec --task fixA-shared -- npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/rpc/host-source-registry.contract.spec.ts`: PASS, 5 tests.

# Not done

- D7 CLI DI spec: a `CliDIContainer.setup({ bootstrapMode: 'minimal' })` assertion resolved both bindings, but Jest retained an async handle after teardown. Awaiting `workspaceReady` did not complete. The unsafe spec was removed; no CLI container source was changed.
- D2 production host predicate wiring: `apps/ptah-electron/src/di/phase-2-libraries.ts` and `libs/backend/cli-engine/src/lib/container.ts` still call the three-argument constructor. Both files are outside fix-A ownership. Parent must wire effective disabled-skill state before disabled clones can be ignored in production.

# Risks

- Until host wiring is added, disabled clones can still win when their phase file exists. The v1 browser fallback prevents that specific capability loss.
- Ptah parent progress report about host wiring was refused because the parent inbox was full; this document carries the finding.
