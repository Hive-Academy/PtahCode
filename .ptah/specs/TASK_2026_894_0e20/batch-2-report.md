# Batch 2 report

## Files changed

- `cli-matrix-rows.ts`, `cli-matrix-rows.spec.ts`: exported and tested built-in CLI display labels.
- `routing-display-names.store.ts`, `routing-display-names.store.spec.ts`: shared frontend resolver for configured, built-in, subagent, route, and model labels with loading and unknown-ID detail.
- `lane-rotation-setting.component.ts`, `lane-rotation-setting.component.spec.ts`: responsive last-pick tiles, friendly labels, raw-ID disclosure, empty/unavailable feedback and Retry.
- `capability-matrix-setting.component.ts`, `capability-matrix-setting.component.spec.ts`: family-grouped six-task evidence table, collapsed families, numeric score bars, source/sample/stale metadata, detail popovers, and state feedback.

## Acceptance evidence

The existing `agent:getCapabilityMatrix` and settings RPCs remain the source of the stored IDs and scores. The resolver changes display values only. Rotation and matrix both inject the same store. Matrix uses table headings and row scopes, family toggle buttons, and numeric score text with bars. Source, samples and stale are visible without opening details. Unknown cells show Unrated with no bar. Existing loading/error/retry states remain.

## Verification

`npm run verify -- -p chat | Select-Object -Last 60` exited 1. Lint/typecheck header: `NX 2 tasks: 2 succeeded` (chat lint and typecheck). Test header: `NX 1 task: 0 succeeded, 1 failed` (`@ptah-extension/chat:test`). Jest: 349 suites passed, 1 failed (350 total); 6,226 tests passed, 1 failed, 2 skipped (6,229 total) in the first run; 6,227 passed, 1 failed, 2 skipped (6,230 total) in the final run. The single failure was `cli-orchestration-matrix.component.spec.ts` in `resets a saved default with a null row and Undo restores it`: expected `state.saveSettings` to be called, actual calls 0. That file belongs to another batch and was not edited here. The four modified Batch 2 specs and the new store spec were among the passing suites. The test log also reported Angular NG0953 from an output emitted after `CliModelEffortPopoverComponent` destruction.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Resolve labels in one injectable store | Duplicate component lookup / shared resolver | `design-spec.md` Routing and capability evidence; both components use the same IDs | Yes |
| Use CSS container queries for rotation tiles | Viewport breakpoints / container breakpoints | Electron sidebar reduces Settings content width; design spec names 480px and 850px container widths | Yes |
| Use existing native popover for cell evidence | Expanded table row / popover | `design-spec.md` States and accessibility; existing Settings popover component | Yes |

## Not done

The actual Electron renderer was not started because the task prohibits build, serve, and dev targets. The static prototype reference was inspected in a browser; production visual comparison remains unverified.

The optional angular-frontend-patterns skill was unavailable from this host's skill search; repository rules and nearby components guided the change.

Ptah diagnostics was requested after edits but returned "TypeScript check still running after 45s"; the files remained unchecked at that point.

The final scoped verify after the resolving-executor family label also exited 1. Lint and typecheck again passed 2/2. Jest again had 349 passing suites and the same single unrelated failing suite; its 6,227 passing tests include all Batch 2 specs. No Batch 2 test failed.
