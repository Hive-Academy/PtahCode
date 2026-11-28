# Decision matrix dashboard v2 review fixes

All Blocker, Major, and Minor findings were confirmed in source. The 1168 px wrapping risk in m6 was confirmed from the layout, with the actual line count reserved for the Electron run.

| ID | Status | Resolution | Primary files |
| --- | --- | --- | --- |
| B1 | Fixed | The theme helper asserts `ptah-glass` and `ptah-glass-light` after choosing the corresponding entries. The existing Electron scenes cover each mode at 800, 1440, and 1824 px, with selected-cell scenes at 1440 px. | Electron settings preview |
| B2 | Fixed | The KPI rings use the 56 px row preset. The page spec checks the visible centers for 67%, 70%, 17%, and 100%, as well as the em dash for empty denominators. | Page template and spec |
| B3 | Fixed | `agent:getRoutingEvidence` now returns `laneFunnels` with one funnel per recorded lane and provider family. The backend counts eligible runs after deduplication and before model and effort bucketing. The service returns that field through the existing typed RPC pass-through. The dashboard uses it for the approval and delivery KPIs, pipeline and losses, outcome mix, and workload share. Backend and dashboard specs cover simultaneous wildcard and concrete buckets and two lanes sharing a family. The RPC spec checks that the field reaches the caller. | Shared RPC types, choice evidence, evidence service, dashboard model, RPC and regression specs, fixtures |
| M1 | Fixed | Unverified, unresolved revisions, and awaiting review use distinct existing series tokens. The charts share those colors with their legends and keep the track color separate. | Dashboard model |
| M2 | Fixed | Multi-effort cells retain the newest timestamp and any stale flag when no aggregate or single-effort key supplies them. Sample-only efforts stay visible. Percentage helpers validate and clamp their inputs, awaiting-review counts have a floor of zero, and only positive stage drops get labels. The model spec covers these cases. | Dashboard model and model spec |
| M3 | Fixed | The matrix uses the shared content surface. App glass styles own shadows and high-contrast and reduced-transparency behavior. Sticky headers use one opaque surface across the full row, and muted text uses the theme’s audited ink. | Page template and stylesheet |
| M4 | Fixed | The cell detail shows effort source, supported and default values, per-effort runs, scores and staleness, and the outside-catalog warning where applicable. A collapsed Decision models section restores proposals, acceptances, confidence, and the full outcome funnel. Measured view hides rows without evidence while counting catalog-only rows toward coverage. | Dashboard model, page and specs |
| M5 | Fixed | Removed the orphaned `MatrixScoreComponent`. | Matrix score component |
| m1 | Fixed | Routing switch rows let the dashboard own the dividers. Labels target inputs only while those inputs are rendered. The offscreen help remains associated with the relevant switch. | Routing switch components |
| m2 | Fixed | A dedicated live region announces the selected cell and source. Relative timestamps and chart details sit outside it. | Page template and spec |
| m3 | Fixed | Equal scores favor named, in-catalog models. The meter’s accessible text uses the same one-decimal formatting as its visible score. | Dashboard model and model spec, page template |
| m4 | Fixed | Ratings-only lane names resolve through the display-name store. Rating provenance shows its own stale flag in either score mode. | Page TypeScript, template and spec |
| m5 | Fixed | Rotation chips read the dashboard’s capability snapshot and retry through the shared store. The header refresh updates both, and a failed evidence refresh clears the previous timestamp. The integration test mounts the real rotation component and checks one mount request and updated chips after refresh. | Dashboard store, rotation component and page spec |
| m6 | Fixed in CSS, Electron confirmation pending | Raised the Routing controls two-column container breakpoint from 46rem to 58rem and kept the hint copy and its existing one-line assertion. | Page stylesheet |
| N1 | Fixed | Replaced undefined foreground and legacy status tokens and removed redundant CSS. | Page stylesheet |
| N2 | Addressed | Marked swatches decorative, made chart SVGs unfocusable, normalized the listed preview and scenario files to LF, and removed nullable lane IDs from chart groups. Percentage types still represent an unavailable value for invalid input. | Page template, dashboard model, chart SVGs, preview and harness fixtures |

## Files changed

- `libs/shared/src/lib/types/rpc/rpc-routing-evidence.types.ts`
- `libs/backend/lane-routing/src/lib/matrix/choice-evidence.ts`
- `libs/backend/lane-routing/src/lib/evidence/routing-evidence.service.ts` and `routing-evidence.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/handlers/routing-evidence-rpc.handlers.spec.ts`
- Under `libs/frontend/chat/src/lib/settings/ptah-ai/`
  - `decision-matrix-dashboard.model.ts`, `decision-matrix-dashboard.model.spec.ts`, `decision-matrix-dashboard.fixtures.ts`, and `decision-matrix-dashboard.store.ts`
  - `decision-matrix-page.component.ts`, `decision-matrix-page.component.html`, `decision-matrix-page.component.css`, and `decision-matrix-page.component.spec.ts`
  - `host-routing-setting.component.ts`, `performance-routing-setting.component.ts`, and `lane-rotation-setting.component.ts`
  - Removed `matrix-score.component.ts`
- `libs/frontend/ui/src/lib/charts/donut.component.ts` and `stacked-bar.component.ts`
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings.fixtures.ts`, `settings-decision-matrix.fixtures.ts`, and `settings-decision-matrix.e2e.spec.ts`
- `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts`

## Verification

- Focused Jest passed 173 tests in 14 suites across chat settings, lane routing, RPC handlers, and UI charts and token contrast.
- TypeScript passed for Electron, the shared renderer, lane routing, RPC handlers, platform-cli, and cli-engine. A focused project check also passed for the Electron preview and its settings harness fixtures and spec. The temporary check configuration was removed.
- ESLint completed with zero errors and one existing `max-lines` warning in `settings.fixtures.ts`.
- The UI class audit reported zero token counts over baseline for both class usage and raw spacing.
- The approved mock was reviewed against the dashboard’s KPI center labels, glass surface roles, sticky matrix, and selected-cell effort split. Electron-only screenshot inspection, including dark and light glass, and the 1168 px hint assertion remain with the coordinator under the command restrictions. Strict Angular template checking also remains with the coordinator.
- Native CLI skill invocation was unavailable. Applied the checked-in UI/UX, Angular, and surface-authoring skill instructions. Used native file reads and `rg` where the Ptah output was truncated or its dependency index lacked coverage.
