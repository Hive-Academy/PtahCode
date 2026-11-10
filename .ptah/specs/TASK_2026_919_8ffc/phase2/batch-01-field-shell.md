# Phase 2, batch 1: Settings field shell

## Source and API

Source: B18, `lane-guards-settings.component.ts:107` before extraction. Its `div.flex.min-w-0.flex-col.gap-1` contains a `label`, projected `div.join` native control, hint `p`, and conditional error `p`. B17 has the same shell plus optional readable and stored-value nodes. The attribute-selected `SettingsFieldComponent` uses the existing `div` host and removes its marker attribute after matching. It has signal inputs `fieldId`, `label`, `hint`, `error`, `errorRole`, and `errorTestId`; control, before-hint, and after-error projection slots preserve feature-owned controls and state. No variants were added.

## Rows

| Row | File:line | Inventory | Result |
| --- | --- | --- | --- |
| Session budget numeric rows (7) | `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts:289` | B17 | Adopted; native text inputs, handlers, readable note, and stored notice stay in feature |
| Lane guard threshold | `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts:107` | B18 | Adopted; native text input and handlers stay in feature |
| Session budget toggles/unit | same file:230,255 | B15/B16 | Left; different checkbox/select anatomy |
| Subagent cache TTL | `subagent-cache-ttl-setting.component.ts:64` | B14 | Left; horizontal label/select layout and environmental notice |
| Host routing | `host-routing-setting.component.ts:67` | B19 | Left; heading label and checkbox share a header row |
| Lane rotation | `lane-rotation-setting.component.ts:60` | B20 | Left; heading label and checkbox share a header row |

## DOM equality and attributes

The adopter specs captured normalized `outerHTML` **before** adoption as inline snapshots: `session-budget-settings.component.spec.ts:134` covers all seven numeric rows; `lane-guards-settings.component.spec.ts:77` covers the threshold row. Normalization removes Angular scoping attributes and comments and collapses whitespace. The first post-adoption comparison exposed hint text-node boundary spaces; the shared template now preserves them. The focused test run passed both snapshots. Attribute differences: **none** in those snapshots. `for`/`id`, `aria-describedby`, `aria-invalid`, native disabled state, class lists, and test ids remain feature-owned and unchanged. The UI unit spec covers label association, hint, error role, disabled control, and projection. Error-state DOM was covered by existing feature tests, but no pre-adoption inline error snapshot was captured.

A rendered browser screenshot was unavailable because this batch forbids build, serve, and dev targets; DOM snapshots and component tests are the visual-change evidence.

## Verification

Baseline capture: `npm run verify -- -t test -p @ptah-extension/ui,@ptah-extension/chat -- --testPathPatterns="(session-budget-settings|lane-guards-settings).component.spec" --updateSnapshot | Select-Object -Last 60` — 2/2 Nx tasks succeeded.

Required full command: `npm run verify -- -p @ptah-extension/ui,@ptah-extension/chat | Select-Object -Last 60` — exit 1. Output tail: lint/typecheck 3/4 tasks succeeded; UI lint initially failed on Angular's element-prefix rule for the required attribute selector. A narrow local exception was then added. Test phase 1/2 tasks succeeded: UI passed; chat failed. Chat log: 251 suites passed, 104 failed; 4,416 tests passed, 5 failed, 2 inline snapshots failed at that point due to hint spaces. Most suite failures are `marked` module resolution at the worktree `node_modules/marked/lib/marked.umd.js`. Hint spaces were fixed after this full run. The lint correction and the unrelated `marked` failures were not rechecked by another full run.

Final focused command: `npm run verify -- -t test -p @ptah-extension/ui,@ptah-extension/chat -- --testPathPatterns="(settings-field|session-budget-settings|lane-guards-settings).component.spec" | Select-Object -Last 60` — exit 0; Nx 2/2 tasks succeeded, 1 cached. Ptah diagnostics found no issues in the four requested changed TypeScript files; it reported errors only in sibling files. No UI class or degradation ratchet failure appeared in the lint output; the UI lint error was selector-specific.

## Files changed

- `libs/frontend/ui/src/lib/extracted/settings-field/settings-field.component.ts`
- `libs/frontend/ui/src/lib/extracted/settings-field/settings-field.component.spec.ts`
- `libs/frontend/ui/src/lib/extracted/settings-field/index.ts`
- `libs/frontend/ui/src/lib/extracted/index.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/session-budget-settings.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.spec.ts`
- `.ptah/specs/TASK_2026_919_8ffc/phase2/batch-01-field-shell.md`

## Decisions

- Use B18 as the source because it is the minimal repeated label/control/hint/error anatomy; B17 needs only two projection slots. Reversible.
- Keep feature validation, event handlers, control markup, and aria wiring in each adopter. The source rows and zero-change requirement support this. Reversible.
- Use an attribute-selected component on the original `div`, with a scoped selector lint exception, to avoid an extra host wrapper. Reversible.
- Leave B14/B19/B20 untouched because their layout and note placement differ materially. Reversible.

## Proposed next family

Apply the extracted shell to other repeated numeric/text Settings rows only after comparing their rendered anatomy and capturing baseline DOM snapshots.

### Full verify output tail (captured)

```text
NX   2 tasks: 1 succeeded, 1 failed
? nx run @ptah-extension/chat:test
full log: C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\17499264056795573320
[verify 2026-11-10T17:10:05.018Z] lock slot 0 acquired after 0s
[verify 2026-11-10T17:10:05.020Z] starting verify lint,typecheck
Run duration: 34.8s
[verify 2026-11-10T17:10:46.111Z] starting verify test
Run duration: 3m 20s
[verify 2026-11-10T17:14:08.443Z] lock released after 243.4s, exit code 1
```
