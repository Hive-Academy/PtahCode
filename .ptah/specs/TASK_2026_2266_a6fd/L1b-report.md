# L1b: system lane Test extraction

Extracted system-lane detection, Claude named/ambient account checks, elapsed-time measurement, and fixed result copy into `libs/frontend/core/src/lib/services/providers-system-lane-test.ts`. These are plain exported functions receiving the RPC function and selection data; no injectable was added. The service retains selection lookup and store writes through a shared `runLaneTest` method. Instance probes also delegate to the helper, preserving their 45-second timeout and fixed error allowlist.

To meet the service line ceiling after Prettier, also extracted the existing lane-default operation factory verbatim into `providers-lane-default-operations.ts`. Existing service tests exercise its writes and read-back comparisons. Other lanes' edits were preserved; this round did not edit the existing service spec or any chat/UI file.

## Final line counts

| File | Lines |
| --- | ---: |
| providers-settings-state.service.ts | 1063 |
| providers-system-lane-test.ts | 86 |
| providers-system-lane-test.spec.ts | 81 |
| providers-lane-default-operations.ts | 67 |

The service started this round at 1176 lines; the requested ceiling is 1065 (main baseline). It is now 113 lines shorter than the starting state and 2 lines below the ceiling.

## Behavior and detail-row confirmation

The new helper spec explicitly covers absent and uninstalled Claude and Codex lanes. Both return exactly `Not detected.` and invoke only `agent:detectClis`, skipping account and instance-registry calls. The instance-only `This instance was not found...` copy is confined to `testInstanceLane`. Named and ambient Claude readiness checks retain fixed reasons, and host labels never enter results. Existing specs continue covering stale-result clearing and cancellation.

Read-only source inspection confirms that the lanes table detail row contains Test, emits its test event, and the matrix routes system rows to `state.testSystemLane(row.cli)` and instances to `state.testCliConnection(id)`. However, `lanes-table-detail.component.ts:184` currently disables Test with `busy() || testing() || systemRow()?.installed === false`. Thus the button exists for system lanes but cannot currently be clicked for an uninstalled Claude lane. The styling lane must remove that installed guard if the isolated profile needs to exercise this path from the UI. No `lanes-table*` file was edited. This was source inspection, not an Electron runtime or screenshot check.

Attempted to notify the parent via `ptah_agent_report`; delivery was rejected with `parent-inbox-full`. The UI finding remains recorded here for the parent.

## Checks

- Passed: `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-system-lane-test.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.orchestration.spec.ts` — 3 suites, 141 tests. Final run after the lifecycle extraction passed in 45.243 seconds. Jest emitted a configuration ES-module warning but exited 0.
- Passed: `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` — exit 0, no diagnostics.
- Passed with one warning: `npx eslint libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-system-lane-test.ts libs/frontend/core/src/lib/services/providers-system-lane-test.spec.ts libs/frontend/core/src/lib/services/providers-lane-default-operations.ts` — exit 0, no errors. The service still triggers the existing `max-lines` rule (957 counted code lines versus 700); its total physical length is nevertheless reduced to the required 1063 lines. The new helper files have no lint warnings.
- Passed: `npx prettier --write libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-system-lane-test.ts libs/frontend/core/src/lib/services/providers-system-lane-test.spec.ts libs/frontend/core/src/lib/services/providers-lane-default-operations.ts` — exit 0; line counts above are after formatting.

No nx, build, serve, npm verification, commit, push, or stash commands were run.

## Tool and skill notes

Used Ptah workspace analysis and AST analysis. Ptah dependency indexing returned `building`, so native `rg` supplied the usage scan. This CLI exposes no native skill-loading mechanism; read and applied the repository's `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md` through the filesystem fallback. No design work or UI edits were performed.
