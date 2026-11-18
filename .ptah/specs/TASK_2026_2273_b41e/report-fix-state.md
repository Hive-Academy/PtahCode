# FIX-S frontend state report

## Findings

| Finding | Status | Fix location | Focused spec |
| --- | --- | --- | --- |
| #2 checkbox deselection | Done | `components/memory-entry-list.component.ts:77,185`; `services/memory-graph-state.service.ts:210` | `deselects a checked row when unchecked`; `deselects one id and clears selection when the workspace changes` |
| #3 failed actions | Done | `services/memory-state.service.ts:323,340,357`; `components/graph/memory-graph-view.component.ts:345` | `returns action failures and decrements total only after a successful forget`; `does not patch nodes after failed %s` (pin, unpin, forget) |
| #4 selection consistency | Done | `components/memory-curator-tab.component.ts:393`; `services/memory-graph-state.service.ts:64,68,210,222`; `components/graph/memory-graph-view.component.ts:227` | `removes a List forgotten node from graph state only after success`; `deselects one id and clears selection when the workspace changes` |
| #5 no workspace | Done | `services/memory-graph-state.service.ts:154` | `clears old result and selection when no workspace is open` |
| #6 stable detail loading | Done | `components/graph/memory-graph-view.component.ts:258,311` | `keeps selected detail when the node is patched` |
| #7 total after forget | Done | `services/memory-state.service.ts:363` | `returns action failures and decrements total only after a successful forget` |

## Files changed

- `libs/frontend/memory-curator-ui/src/lib/services/memory-graph-state.service.ts`
- `libs/frontend/memory-curator-ui/src/lib/services/memory-graph-state.service.spec.ts`
- `libs/frontend/memory-curator-ui/src/lib/services/memory-state.service.ts`
- `libs/frontend/memory-curator-ui/src/lib/services/memory-state.service.spec.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/memory-entry-list.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/memory-entry-list.component.spec.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph-view.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/graph/memory-graph-view.component.spec.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/memory-curator-tab.component.ts`
- `libs/frontend/memory-curator-ui/src/lib/components/memory-curator-tab.component.spec.ts`

## Checks

- `npx prettier --write <10 changed files>`: exit 0.
- `ptah_get_diagnostics` scoped to five changed source files: unavailable after 45-second timeout; no diagnostic result.
- `npx jest --config libs/frontend/memory-curator-ui/jest.config.ts --runInBand --coverage=false --runTestsByPath <5 changed specs>`: exit 0; 5 suites passed, 97 tests passed.
- `npx ngc --noEmit --project libs/frontend/memory-curator-ui/tsconfig.lib.json`: exit 0; no output.
- `npx eslint <10 changed files>`: exit 0; no output.

## Decisions

- Return `boolean` from pin, unpin, and forget. Existing callers can ignore the result; the graph and List shell use it to gate mutations. A false RPC result gets an existing generic action message. Reversible.
- Keep the existing List forget interaction without confirmation, as requested. Reversible.
- Clear selection when the workspace path changes and in the no-workspace refresh branch. Keep graph results until refresh for other workspace changes, following the existing refresh behavior. Reversible.
- The Angular skill loader was unavailable in this lane; implementation followed local component and spec patterns.
