# Summary

Created a fixed-height, three-column-maximum provider grid and presentational system CLI cards using the existing `SystemCliMatrixRow` and default-cell components. The matrix is not mounted yet.

# Files created

- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.css`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-card-popovers.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-grid.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-provider-grid.component.css`

## Contract for 4b

`ptah-cli-provider-grid` inputs: `rows: readonly SystemCliMatrixRow[]` required; `defaults?: CliLaneDefaults`; `busy: boolean`; `canWrite: boolean`; `testing: boolean`; `testingId: string | null`; `testTexts?: Readonly<Record<string,string>>`; `guides?: Readonly<Partial<Record<SystemCliMatrixRow['cli'], {command:string|null; note:string}>>>`. Outputs: `toggled: {row:SystemCliMatrixRow,event:Event}` ? `toggle`; `defaultSelected: {row:SystemCliMatrixRow,choice:CliProviderChoice}` ? `saveLaneDefault`; `defaultResetRequested: SystemCliMatrixRow` ? `resetLaneDefault`; `testRequested: string` ? `test`; `redetectRequested: string` ? `redetectFromGuide`; `codexSettingsRequested: void` ? Batch 6 destination. Pass `groups()[0].rows`, `state.orchestration().data?.cliLaneDefaults`, `busy()`, `canWrite()`, `testing()`, `testingId()`, `CLI_INSTALL_GUIDES`, and row-specific text produced by `testResult(row)`. The grid owns `openCell` signal; card popover requests replace the single `{rowId,kind}` value, and closures clear it. Only one card receives a non-null `openKind`.

`ptah-cli-provider-card` inputs: `row: SystemCliMatrixRow` required; `saved?: CliProviderDefaultChoice`; `busy: boolean`; `canWrite: boolean`; `testing: boolean`; `testText: string`; `guide?: {command:string|null;note:string}`; `openKind: CliProviderOpenKind|null`. Outputs: `toggled: {row:SystemCliMatrixRow,event:Event}` ? `toggle`; `defaultSelected: CliProviderDefaultChoice` ? `saveLaneDefault(row, choice)`; `defaultResetRequested: void` ? `resetLaneDefault(row)`; `testRequested: string` ? `test`; `redetectRequested: string` ? `redetectFromGuide`; `codexSettingsRequested: void` ? Batch 6; `popoverRequested: CliProviderOpenKind` and `popoverClosed: void` ? grid open state. `CliProviderOpenKind` is `info|capabilities|model|effort|permission|credentials|install`.

`ptah-cli-provider-card-popovers` inputs: `row: SystemCliMatrixRow` required; `kind: CliProviderInfoKind` required (`info|capabilities|permission|install`); `guide?: {command:string|null;note:string}`; `detail: string`; `busy: boolean`. Outputs: `closed: void` ? card `popoverClosed`; `redetectRequested: string` ? card/grid `redetectFromGuide` forwarding. Card wraps its body in `ptah-native-popover`.

# Parity rows covered

| Existing row | Card element | Spec |
| --- | --- | --- |
| Codex installed | status, provider/model/effort/safety/defaults, Test, Codex settings | toggle/Test/Codex output test |
| Cursor installed or needs key | Credentials, model, lane default | Cursor-only Credentials test |
| Other installed system CLIs | common card fields, capabilities, status | one-open grid test |
| Uninstalled system CLIs | disabled toggle, Install guide, Re-detect | output contract; no dedicated test yet |
| Running/failed/unsupported/unavailable | fixed status and live test slots | parameterized status slot test |
| Full access | reused `ptah-cli-lane-default-cell` dialog | forwarding test only; shared component spec covers confirmation/cancel |

# Verification

`npm run verify -- -p chat | Select-Object -Last 60` — running at report write time; final lines to append. Scoped Ptah diagnostics was requested after edits but returned `TypeScript check still running after 45s` with three files unchecked.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Grid accepts system rows and leaves instance details in the existing instance section | Duplicate instance details in equal-height cards / retain owner | Revision 2 item 8 and Batch 3 report | Yes |
| Keep one-open state in grid | Local state per card / grid state | Revision 2 item 6 | Yes |
| Pass guides from matrix | Import matrix constant / input | Avoid import cycle when 4b mounts grid | Yes |

## Not done / handoff

- 4b must mount the grid, remove the table, wire status text and handlers, update matrix spec/styles/e2e, and verify production render. The current card has no More menu for instance actions because the existing instance section owns those controls under revision 2 item 8.
- The reused model/effort popover persists internally today; 4b should preserve or refactor that existing behavior if strict matrix-only persistence is required.
- Production Angular screenshot inspection requires a serve/dev target, prohibited by this task. The static `card-states-dark.png` reference was inspected: fixed status badges, test lines, and three cards per row. Production geometry and 3:1 control contrast remain unmeasured.
- The optional `angular-frontend-patterns` skill could not be loaded: this host exposes no skill-loading tool.

