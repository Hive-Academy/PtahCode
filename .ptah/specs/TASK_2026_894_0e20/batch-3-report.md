# Batch 3 report

## Files changed

- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.spec.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-shared-defaults.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-shared-defaults.component.spec.ts`

## New component contract

`ptah-cli-shared-defaults`: inputs `manifest` (required CliAdapterManifest), `saved` (Ptah CLI lane default), `disabled` (boolean); outputs `selected` (committed default choice), `resetRequested` (void). Batch 4 can mount it in the matrix without changing persistence handlers.

## Acceptance evidence

- Shared card uses a full-width tile, an inherited-scope caption, wide permission/network selects, and a component CSS container query at 761px. Default cell `layout` switches between compact and wide widths.
- Default cell retains supported-mode filtering, unsupported and unavailable reasons, and saved/default captions. Reset sits in `ptah-native-popover`. Full-access proposals open a modal native `dialog`; Confirm emits and Cancel/Escape preserve the saved selection. Focus returns to the select.
- Instance cards remain content-sized and retain Add, enable, Tiers, Test, More, Edit, Delete, empty state and delete confirmation. Three capability chips appear inline; a top-layer native popover exposes every capability and its reason. The detail grid shows direct model, effort, last test and three tier slots.
- Specs cover shared card forwarding, modal confirmation/cancellation, and instance capability summary/popover, alongside existing action and state specs.

## Verification

Final `npm run verify -- -p chat | Select-Object -Last 60`: chat lint and typecheck **2/2 passed**; chat test **0/1 succeeded**. Jest: **349 suites passed, 1 failed** (350 total); **6,227 tests passed, 1 failed, 2 skipped** (6,230 total). The three Batch 3 specs passed. The sole failure is `cli-orchestration-matrix.component.spec.ts` (line 922): it still expects a direct Reset button, so no `saveSettings` call occurs. Reset now belongs to the native popover per Batch 3 design; Batch 4 owns that matrix spec. The first run had one additional failure in the new shared-defaults spec; I corrected its selector before the final run. Scoped Ptah diagnostics timed out after 45 seconds; the required chat typecheck passed in verify.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Keep persistence in the matrix and make the new shared card presentational | New store or output contract | Existing default cell outputs and Batch 4 mounting requirement | Yes |
| Use a local capability-popover state in instance cards | Matrix open-cell state or local state | Batch 3 cannot edit matrix; native popover supports a controlled `isOpen` input | Yes |

## Not done

- Batch 4 matrix mounting and update of its Reset interaction spec belong to the later lane.
- Rendered Angular screenshot inspection requires a serve/dev target, which this batch explicitly prohibits. I inspected the supplied `1600-dark.png` and `card-states-dark.png` reference screenshots.
- The optional `angular-frontend-patterns` skill could not be loaded because this host lists no skill-loading tool.
