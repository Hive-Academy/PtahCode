# Visual upgrade part 2a

Added standalone OnPush leaderboard and meter components for `dashboard-catalog/4`. The leaderboard uses the analytics dashboard's rank badge and compact share bar, with DaisyUI theme tokens, fixed Lucide icons and screen-reader share text. The meter scales amounts by the largest segment before normalizing, including for very large values. Its legend includes values, percentages and muted capacity styling.

The view model validates and copies declared card fields. The renderer applies the same field checks to overridden view models. The shared catalog's card-specific budget constants are internal, so the renderer mirrors the limits of 8 groups, 50 entries and 12 segments.

## Files changed

Paths below are relative to `libs/frontend/declarative-dashboard/src/lib`.

- `components/command-output-render.spec.ts`
- `components/dashboard-leaderboard.component.spec.ts`
- `components/dashboard-leaderboard.component.ts`
- `components/dashboard-meter.component.spec.ts`
- `components/dashboard-meter.component.ts`
- `components/surface-icons.ts`
- `components/surface-node.component.spec.ts`
- `components/surface-node.component.ts`
- `components/surface-renderer.component.spec.ts`
- `components/surface-renderer.component.ts`
- `trust-boundary.spec.ts`
- `view-model/surface-card-fields.ts`
- `view-model/surface-view-model.spec.ts`
- `view-model/surface-view-model.ts`
- `view-model/view-model.types.ts`

## Icon map

| Surface token | Lucide icon |
| --- | --- |
| `skill` | `Sparkle` |
| `agent` | `Bot` |
| `server` | `Server` |
| `tool` | `Wrench` |
| `file` | `FileText` |
| `memory` | `Brain` |
| `chart` | `ChartBar` |
| `clock` | `Clock` |
| `bolt` | `Zap` |
| `info` | `Info` |
| `terminal` | `Terminal` |
| `folder` | `Folder` |
| `cpu` | `Cpu` |
| `gauge` | `Gauge` |
| `user` | `User` |
| `sparkles` | `Sparkles` |

Unknown tokens resolve to no icon. The catalog validator rejects them in producer data.

## Verification

- Focused Jest passed 148 tests across 8 suites. The /usage and /context tests format the shared fixtures, compile and resolve the fences, and render the result through the surface renderer.
- ESLint passed on the 15 changed TypeScript files with zero errors and 32 existing non-null assertion warnings in three specs.
- The UI class audit passed with zero token counts over baseline.
- `git diff --check` passed for the changed paths.

The analytics reference was checked in source for rank badge sizing, share bar dimensions and value alignment. Electron visual review and the renderer template typecheck remain unverified under this lane's launch and Nx restrictions. Repository skill files supplied the UI/UX Designer and Angular Frontend Patterns guidance. The Ptah dependency graph omitted the mapper, so PowerShell and `rg` supplied the source fallback.
