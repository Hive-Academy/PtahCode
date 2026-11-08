# Frontend review fixes

## Changes and evidence

| Review item | Change | Files | Test and result |
| --- | --- | --- | --- |
| 3, reset warning | Reset displays the effective built-in mode. A reset to yolo opens the same warning as choosing yolo; Cancel leaves the saved value and does not write. Confirm emits the reset. | `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts`, its spec, matrix spec | Focused cell spec passed (5 tests). Matrix spec passed (63 tests), including null reset and Undo after confirmation. |
| 8, component size | Moved lane-default save, reset, read-back and Undo orchestration into an injected `CliLaneDefaultsStore`. The matrix delegates to it. | `cli-lane-defaults.store.ts`, `cli-orchestration-matrix.component.ts` | Matrix spec passed (63 tests); combined lint/typecheck passed. |
| 9, DOM boundary | Select values use `CLI_LANE_DEFAULT_SCHEMA` Zod safeParse before option checks and emission. | `cli-lane-default-cell.component.ts` | Focused cell spec passed (5 tests). |
| 7, shared pair | Displayed effective permission/network and reset warning derive from exported `resolveCliLaneDefaultPair`. Unsupported saved pairs show an explicit status. | `cli-lane-default-cell.component.ts`, its spec | Focused cell spec passed, including unsupported-pair case. |

## Verification

- `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=cli-lane-default-cell.component.spec.ts` — passed, 1 task; 5 tests.
- `npm run verify -- -t test -p @ptah-extension/chat -- --testPathPatterns=cli-orchestration-matrix.component.spec.ts` — initial run failed 1 of 63 because the old reset test expected an immediate write; updated the test for confirmation. Rerun passed, 1 task; 63 tests.
- `npm run verify -- -p @ptah-extension/chat,@ptah-extension/core` — passed: 4/4 lint and typecheck tasks, then 2/2 test tasks. Scope was exactly the two named projects.
- `ptah_get_diagnostics` was attempted after edits; its TypeScript worker timed out on the final call. The combined scoped verifier passed lint and typecheck afterward.

## Decisions

- Reset to the built-in yolo pair requires the full-access confirmation. Alternative was immediate reset. Evidence: review item 3 and the same effective mode as a direct yolo selection. Reversible.
- A saved pair rejected by the shared resolver displays “Unsupported combination” and is not presented as an applied pair. Alternative was local pair filling. Evidence: review item 7 and the shared helper contract. Reversible.

## Open issues

- No remaining frontend review item. The Angular skill loader was unavailable in this lane; repository Angular guidance and existing patterns were followed. A rendered screenshot was not taken because the task forbids running serve/dev targets and no existing UI session was available.
