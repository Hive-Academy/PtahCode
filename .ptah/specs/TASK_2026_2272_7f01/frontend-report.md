# B2 report — Schedules UI redesign ("Flight deck")

Four agents wrote the components; the coordinating session ran the checks and fixed the specs.

## Files (`libs/frontend/cron-scheduler-ui/src/lib/components/`)

| File | Role | Shared components |
|---|---|---|
| `cron-scheduler-tab.component.ts` | thin shell (675 → 272 lines) | `ptah-alert` with Retry |
| NEW `cron-header-band.component.ts` | title, review link, scope switch, refresh, the one primary action, 4-segment band | `ptah-instrument-band`, `ptahButton` |
| NEW `cron-job-list.component.ts` | search above 6 jobs, skeleton, empty state, card grid | `ptah-section-header`, `ptah-toolbar`, `ptah-skeleton`, `ptah-state-panel` |
| `cron-job-card.component.ts` | creator, last run status, inline delete confirm | `ptah-surface-card`, `ptah-status`, `span[ptahBadge]`, `ptah-inline-confirm` |
| NEW `cron-job-form.component.ts` | create / edit, validation summary, save error | `ptah-field`, `ptah-select`, `ptah-alert` |
| NEW `cron-run-history.component.ts` | status, times, summary or error, copyable session id | `ptah-status`, `ptah-section-header` |
| NEW `cron-run-status.ts` | run status → `ptah-status` view, duration | — |
| `cron-job-detail-drawer.component.ts` | creator, last status, run history, inline delete confirm | `ptah-native-drawer`, `ptah-status`, `ptah-inline-confirm` |
| `cron-format.ts` | "DATA LIMIT" note and unused helpers removed | — |

## Test hooks

- Kept: `cron-scheduler-section`, `cron-empty-state`, `cron-review-runs-link`,
  `cron-scope-workspace`, `cron-scope-all`, `cron-new-job-btn`, `cron-form`,
  `cron-form-name/expr/prompt/submit`, `cron-job-card`, `cron-run-row`,
  `cron-drawer-run-now/edit/toggle/delete`.
- Removed: `cron-stat-total/enabled/disabled/next-run`. The band is
  `cron-instrument-band` (`aria-label` "Cron statistics" kept).
  `apps/ptah-electron-e2e/src/specs/thoth/cron.spec.ts` now reads the band and its fixtures have
  `createdBy` and `lastRunStatus`. The end-to-end target was NOT run (project rule).

## Gaps

- No next-fire preview in the form: no renderer library imports croner and no RPC gives a
  preview for an unsaved expression. `CronJobService.previewNextFire` now exists for a later RPC.
- No shared copy button in `libs/frontend/ui`; the run history uses `navigator.clipboard`.

## Other

- `tools/ui-class-audit/baseline.json`: the three cron rows are removed (all three files have
  zero blocked classes now).
- Delete no longer uses `globalThis.confirm`; the card and the drawer confirm inline.
