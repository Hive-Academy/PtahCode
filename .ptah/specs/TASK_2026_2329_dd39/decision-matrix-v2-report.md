# Decision matrix dashboard v2

## Data bindings

| Section | Source |
| --- | --- |
| Header | Routing-model status comes from the existing `agent:getConfig.decisionModel` availability check. Refresh reads `agent:getRoutingEvidence` and `agent:getCapabilityMatrix`. The update age comes from the last successful evidence response received by the page. |
| Overview | Approved on review uses `funnel.approved / funnel.reviewed`. Delivered uses `funnel.delivered / funnel.spawned`. Coverage counts lane × model × task-kind cells whose representative evidence has `sampleCount > 0`. Catalog readiness counts lanes whose `catalog.status` is `ok`. A zero denominator renders an unavailable percentage. |
| Run pipeline | `lanes[].models[].keys[].funnel` provides spawned, completed, delivered, reviewed and approved counts. Drops are the differences between adjacent stages. The Lost bar uses `failed`, `noDeliverable`, `rejected` and `unverified`. `windowDays` supplies the time window. |
| Outcome mix by lane | Shares use attributable `funnel.spawned` as denominator. The four Lost categories and approved runs are joined by RPC capacity drop-outs, unresolved revisions and delivered runs without a review so the bar accounts for the full run total. |
| Who does the work | The donut uses attributable `funnel.spawned` by lane. A family shared by multiple lanes appears once under its family name. |
| Routing controls | Existing `settings:get` and `settings:set` for `agentOrchestration.hostRouting`, `agentOrchestration.performanceRouting` and `agentOrchestration.laneRotation`. Suggestion availability still uses `agent:getConfig`. Rotation chips use `agent:getCapabilityMatrix.lastPicks` and `lastPicksUnavailable` with independent Retry. |
| Current pick per task kind | Ranks `AgentRoutingEvidenceKey.score` for each `OUTCOME_TASK_KINDS` entry. The marker shows the best score from another lane. The close-pick chip uses the routing engine's five-point margin, applied here to the measured scores available to the renderer. |
| Outcome matrix | Measured cells use `lanes[].models[].keys[]` grouped by task kind, with score, spawned count and staleness. Model ratings use `profiles[].cells[taskKind]` joined by family and model. The compact search includes lane, model and family names. |
| Selected cell | Uses the measured cell's `funnel`, `sampleCount`, `asOf`, `stale`, effort-specific `funnel.spawned` and `effortNotSent`. Ratings supply score, `source`, `sourceRef`, `asOf`, `sampleCount`, `stale` and `note`. The comparison shows whichever scores exist. |
| Catalog health | `lanes[].catalog.status` and `fetchedAt` for each lane. |

## Data limits and layout decisions

- Run counts prefer the all-efforts cell so effort-specific counts never double-count that cell. Where the aggregate is missing, disjoint effort counts can be combined. Multiple effort scores alone do not establish an all-efforts score. The effort chart appears when the RPC provides specific effort counts.
- The evidence RPC contains family/model summaries and no per-run identifiers. Family-default and named-model buckets can overlap. The page excludes ambiguous family/task combinations from run rollups, calls out the exclusion, and keeps their individual heatmap cells reachable. Shared-family evidence stays in the overall totals but cannot supply a per-lane outcome mix.
- Current picks show measured ranking. The RPC lacks live routing inputs such as the active phase's candidate eligibility, preference boosts and additive totals, so the dashboard cannot identify a guaranteed next executor. The stale marker uses the RPC flag. The mock's fixed stale-age wording and its example effort and funnel estimates are omitted.
- The dedicated family filter and sort controls were removed with the old ratings panel. Compact search covers family names. The approved layout also replaces the old supplementary decision-model outcome table and effort-support inventory with the dashboard and selected-cell panel.

## UI primitives and components

- Added standalone `ptah-stacked-bar`, `ptah-donut` and the public `PtahChartSegment` type in the UI chart library. Both use inline SVG, token colors and a named image with a segment summary. Added geometry tests and axe coverage.
- Reused `ptah-ring`, `ptah-meter` with marker, `ptah-stat`, `ptah-relative-time`, and the existing `ptah-card` and glass surfaces.
- Removed `RoutingEvidenceComponent` and `CapabilityMatrixSettingComponent`. Dashboard tests cover their replacement loading, retry, empty, selection and provenance behavior.
- Kept the three routing switch components as rows inside one Routing controls card. Their existing save, read-back, Undo, model availability and rotation history behavior remains covered by their focused specs.

## Files changed

- `libs/frontend/chat/src/lib/settings/ptah-ai/`
  - Added `decision-matrix-dashboard.model.ts`, `decision-matrix-dashboard.model.spec.ts`, `decision-matrix-dashboard.fixtures.ts`, and `decision-matrix-dashboard.store.ts`.
  - Reworked `decision-matrix-page.component.ts` and its spec, and added its HTML and CSS.
  - Updated `host-routing-setting.component`, `performance-routing-setting.component`, and `lane-rotation-setting.component` and their specs. Updated `orchestration-settings.component.spec.ts`.
  - Removed `capability-matrix-setting.component.ts`, `routing-evidence.component.ts` and their specs.
- `libs/frontend/ui/src/lib/charts/`
  - Added `stacked-bar.component.ts`, `donut.component.ts`, `segment-geometry.ts`, and `segmented-charts.component.spec.ts`.
  - Updated `chart.types.ts`, `index.ts` and `charts.a11y.spec.ts`.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/`
  - Added `settings-decision-matrix.e2e.spec.ts` and `settings-decision-matrix.fixtures.ts`.
- `apps/ptah-electron-e2e/src/design-preview/settings-overlays.shot.ts`
  - Replaced the legacy evidence capture with dashboard scenes at 800, 1440 and 1824, plus a selected-cell scene. The scenes cover dark and light and assert chart/KPI visibility and no page-level horizontal overflow.

## Verification

- Focused Jest passed 120 tests in seven chat/settings suites and 40 tests in two UI chart suites.
- `tsc --noEmit` passed for the Electron and renderer application configs. The chart library type check passed in the chart lane. The UI spec config reported errors outside the chart files.
- Separate focused `tsc --noEmit` checks passed for the Electron preview and for the new webview harness scenario and fixture. The full harness spec config reported diagnostics in untouched files for `import.meta` under CommonJS and a `RegExp` label in `preferences.e2e.spec.ts`.
- ESLint passed across changed TypeScript and HTML files. The UI class audit reported zero counts over baseline, including raw spacing. `git diff --check` passed.
- The approved mock was checked against the template for section order, ring KPIs, chart row, single controls card, pick markers, heatmap and side detail, and catalog strip.
- Electron runtime captures, e2e execution and Angular's strict template target remain for the coordinator under the brief's command restrictions. An actual screenshot inspection in Anubis and Anubis Light has yet to occur.
- Ptah's reverse dependency index did not cover the dashboard files. The cross-reference check used `rg` as a fallback. The repository's UI/UX, Angular, surface and orchestration skills were read from disk because this lane exposes no CLI skill invocation.
