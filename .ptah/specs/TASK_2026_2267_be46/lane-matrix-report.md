# Matrix lane report - TASK_2026_2267_be46

Implementation complete; verification limitations are listed below.

## Files changed
- `libs/frontend/chat/src/lib/settings/ptah-ai/decision-matrix-page.component.ts` and spec: mount routing and rotation; full-width sections, rich-select filter grid, routing-model band segment, header alignment.
- `host-routing-setting.component.ts` and spec in the same folder: shared toggle/section, needs-model warning and Background models action; remove openMatrix output.
- `lane-rotation-setting.component.ts` and spec: shared toggle/section, newest-first badge history and tooltips.
- `capability-matrix-setting.component.ts` and spec: score triggers, optional column priorities and detail rows.
- New `matrix-score.component.ts`: shared score meter, dated stale icon, accessible unrated dash.
- `libs/frontend/chat/src/lib/settings/settings.component.ts`, `.html`, `.spec.ts`: remove retired output binding, routing description and routing deep links.
- `libs/frontend/core/src/lib/services/app-state.service.ts`: PendingSettingsTab.section union only.

## Decisions
- Use AppStateManager, the actual exported service, for Background models navigation; the shell already reacts to pending requests while mounted. Evidence: settings.component.ts effect and applyPendingTab. Reversible; no new navigation mechanism.
- Reverse rotation history for newest-first chips. Evidence: rotation.store.ts withPick appends the latest entry to the end. Reversible presentation change.
- Reuse shared ptah-table-score inside a local score component and existing popovers, rather than changing shared UI. Optional task columns hide by priority; sort column remains required. Reversible.
- Use shared alert tone `warning` (the API name), equivalent to the brief's warn state.

## Hooks and behavior
Preserved routing/rotation root testids, heading/help/toggle ids, toggle aria-labels and describedby behavior, all loading/error/retry hooks, matrix row testids, score-detail aria-labels/controls, back/refresh labels and existing instrument segment ids. Added routing-model segment. Settings keys, RPC names/timeouts, save read-back and Undo behavior unchanged. Removed only the explicitly retired See decision matrix/openMatrix path.

## Verification
- Initial chat lib tsc found the brief's illustrative AppStateService name was not exported; changed it to verified AppStateManager. Rerun passed.
- Initial focused Jest runs: page and capability suites passed; routing assertions required markup updates. Settings suite cannot load because existing Jest mapper points to missing node_modules/marked/lib/marked.umd.js.
- Chat spec tsc: failed with numerous unrelated existing errors (resize-handle, agent-card-truncation, compact-session and others). A transient duplicate chips declaration introduced in this lane was corrected; host mock return types tightened.
- Scoped ptah_get_diagnostics: unavailable after 45s compiler timeout; native tsc used as fallback.
- ESLint on all assigned changed files: zero errors, one pre-existing max-lines warning in app-state.service.ts.
- Final focused component Jest: **4 suites / 28 tests passed** (decision-matrix-page, host-routing-setting, lane-rotation-setting, capability-matrix-setting). Settings suite remained blocked at module load by the missing marked bundle.
- Core library tsc: passed.
- Core spec tsc: failed on existing configuration/test issues, including shared BigInt literals with a target below ES2020. No union-related failures.
- Final chat library tsc: passed after all source changes.
- Final chat spec tsc: failed on errors outside the assigned files; zero diagnostics for the changed matrix, routing, rotation, Settings shell or app-state files.
- Final lint rerun: passed, zero errors and one existing core max-lines warning.

## Visual verification and limitations
Read design docs, inspected all named reference JPGs and navigated the in-workspace prototype to its matrix page with ptah_browser_navigate/click/screenshot. Checked reference header alignment, equal filter columns, compact score cells and Advanced section split pattern. This is reference inspection only: actual changed renderer has not been visually verified. No runnable renderer URL was supplied; lane rules forbid build/serve/e2e. Coordinator must perform the rendered UI gate at wide and 600px widths.

Skill discovery/loading is unavailable in this CLI lane; no skill was claimed as loaded. The listed harness skill search is inventory authoring, not a skill-loading mechanism.

Attempted parent escalation for Jest mapper and renderer harness; ptah_agent_report refused delivery with parent-inbox-full. No retry sent. No git commands or commits. No Context Management/shared UI/provider files edited.

## Commands run
All Jest invocations used `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath`.
- First and second invocations: the four ptah-ai component specs above plus `libs/frontend/chat/src/lib/settings/settings.component.spec.ts`; each had 2 suites passing and 3 failing (settings mapper plus two old markup assertions).
- Third and final invocations: the four ptah-ai component specs; each passed 4 suites and 28 tests. Final run followed the last template changes.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: initial failed on service name; second and final invocations passed.
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json`: initial failed with unrelated test errors plus a transient duplicate chips declaration (fixed); final failed only outside assigned files.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json`: passed.
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.spec.json`: failed with pre-existing type/target errors.
- `npx eslint` with every source/spec/HTML listed under Files changed: initial and final runs passed; no errors, one existing core max-lines warning.
- `ptah_get_diagnostics` scoped first to the page, then all six changed chat component source files: each unavailable after 45 seconds; native tsc supplied validation.
