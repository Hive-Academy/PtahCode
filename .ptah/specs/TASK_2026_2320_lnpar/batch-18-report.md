# Batch 18 report: B3c cold-resume blocked-command guard and turn settings

## Changes

- MODIFIED `messaging/lane-resumers/lane-resumer.port.ts`: `LaneResumer.resume(info, task, files?)`;
  new `LaneResumeGuard { rawBody; blocked }`; `LaneResumeError` code `blocked-command`.
- MODIFIED `messaging/agent-lane-resume.service.ts`: `resume(info, task, guard?, files?)` runs
  `blockedLaneCommand(guard.rawBody, guard.blocked)` before choosing a resumer; a match throws
  `LaneResumeError('blocked-command', <D18 reason>)` and no spawn or prepare is called. `files`
  are passed to the resumer only when non-empty. The method is now `async`, so a resumer's
  synchronous throw becomes a rejection (the only caller, the dispatcher, awaits it).
- MODIFIED `lane-resumers/system-cli-lane-resumer.ts` (A11 was not met, fixed): the spawn now
  carries `model: info.model`, `effort: info.reasoningEffort` (the `SpawnAgentRequest` field is
  `effort`) and `files`.
- MODIFIED `lane-resumers/ptah-cli-lane-resumer.ts` (A11 partly met, fixed): `info.model` reaches
  `registry.spawnAgent({ model })` through the new `PtahCliResumeParams.model`; files are written
  as path text after the prompt (`withFileReferences`, D14).
- Specs: `agent-lane-resume.service.spec.ts` adds `guard.rawBody = '  /always-approve on'` with
  `blocked = ['always-approve']` (system and Ptah CLI records; spawn, prepare and the Ptah resumer
  are never called), a normal body that spawns with model/effort/files, and files to the Ptah
  resumer.

## Verification

- Focused jest: `agent-lane-resume.service.spec.ts`, `system-cli-lane-resumer.spec.ts`,
  `ptah-cli-lane-resumer.spec.ts`: 3 suites, 24 tests passed (ts-jest type-checks them).
- `npx eslint` on the 5 changed files: clean.

## Open items

- A11 effort on a Ptah CLI cold resume is not carried: `PtahCliRegistry.spawnAgent` has no effort
  option. Batch 24 (ptah-cli manifest) should declare effort `next-turn` only for live lanes, or
  the registry needs an effort option.
- The dispatcher still calls `resume(info, text)`; Batch 20 passes the guard and files.
