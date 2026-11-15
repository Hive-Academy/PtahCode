# Phase 4 step 0b: review fix briefs

Sources: `code-logic-review-0b-2-4.md` (D1-D7) and `code-logic-review-0b-1-3.md` (C1-C4).

## File ownership

| Lane | Owns |
|---|---|
| fix-A | `libs/backend/lane-routing/**`, `libs/shared/src/lib/types/phase-dispatch.schema.ts`, `libs/shared/src/lib/types/phase-contract.types.ts`, `scripts/validate-orchestration-skill.ts`, `libs/shared/src/lib/types/rpc/host-source-registry.baseline.ts`, new spec under `libs/backend/cli-engine/src/lib/` |
| fix-B | `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts` and its spec, `libs/backend/skill-synthesis/src/lib/skill-file-writer.port.ts`, `skill-enhancer.service.ts`, `skill-enhancer.phase-file.spec.ts`, `libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/skill-clone-file-path.ts` and spec, `libs/frontend/skill-synthesis-ui/src/lib/components/clones/clone-phase-files.component.ts` and its spec |

## fix-A

- D1: `version: 2` phase files must declare `machineCapabilities` (no default). A `version: 1` file still parses with `[]`, but the gate treats a v1 definition like an unreadable one: it keeps the legacy browser requirement for design and visual-review and logs it. The validator refuses a v2 file without the field.
- D2: the reader uses the clone only when the clone is active (host predicate, optional; default active) AND `phases/<kind>.md` exists in the clone. Otherwise it reads the ptah-core plugin file for that kind. Specs for a disabled clone and for a clone without the phase file.
- D3: add the `PhaseDefinitionError.code` to the gate warning.
- D4: log the "reader unavailable" warning one time per service instance.
- Gate failure G1: `libs/backend/lane-routing/src/lib/phase-definition-file.reader.spec.ts:42` uses `process.cwd()`. Under Nx the cwd is the lib folder. Find the repository root from `__dirname` instead.
- Gate failure G2: `libs/shared/src/lib/types/rpc/host-source-registry.contract.spec.ts` fails because `usage:getDimensionTotals` is new. Run `npx tsx scripts/generate-host-source-registry-baseline.ts` and confirm that the only diff in `host-source-registry.baseline.ts` is that one added name. Do not edit the contract spec.
- D7: CLI container spec that resolves `LANE_ROUTING_TOKENS.PHASE_DEFINITION_READER` and `SKILL_FILE_WRITER_TOKEN`, if a CLI container spec pattern exists. If the container cannot resolve in a unit test, report it and skip.

## fix-B

- C1/C2: under the slug lock, refuse a write or a revert when the clone folder, `phases/`, the history root, the snapshot folder or the source file is a symlink or has a real path outside the expected root. Check the real parent of a missing target too. Same rule in `skill-clone-file-path.ts`.
- C3: the port takes the expected current body hash. The writer compares it with the live file under the lock and refuses a stale write (new typed result, the enhancer returns a skip reason such as `stale-proposal`).
- C4: the phase history list shows revert only for snapshots that contain that file.
- D5: refuse a phase write when the clone folder or its `SKILL.md` does not exist.
- D6: create `phases/` before the revert copy.
- D1 (enhancer side): refuse a phase candidate that removes a machine capability that the current file declares, or that lowers the version.
