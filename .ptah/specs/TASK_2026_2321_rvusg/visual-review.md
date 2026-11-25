# Visual Review - TASK_2026_2321_rvusg

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 8/10 |
| Assessment | APPROVED |
| Visual breaking | 0 |
| Serious | 0 |
| Moderate | 2 |
| Viewports tested | 1 (1440x1000, Electron window) |
| Screenshots taken | 8 (4 before, 4 after) |
| Components tested | run detail (run total, stage cards, lens cards), review lanes pool and pins |

## Environment

- Host: Electron only, driven by the repo's Playwright `_electron` harness (`apps/ptah-electron-e2e`, `launchPtah`, `ui.mockRpc`) with a temporary, untracked capture spec (deleted afterwards). The e2e suite was not run and no baselines changed.
- BEFORE: `main` e5856c839, `npm run electron:build:dev` + `copy-renderer-dev` in `D:\projects\PtahCode` (only git-ignored `dist/` changed), then copied into the worktree `dist/`. AFTER: branch feat/review-usage, same two builds in the worktree. Each build ran under `scripts/verify.mjs --exec`, one at a time. Fresh `--user-data-dir` and `PTAH_DB_PATH` per launch (isolated profile). The app was closed by the harness after each capture.
- Themes: dark = Ptah Glass (default), light = Ptah Glass Light, chosen with the real theme menu (Glass tab).
- Viewport: 1440x1000 only. Narrow widths were not captured (not requested). The batch report says the usage lines are plain wrapping `<p>`.

## How data was seeded

Not through SQLite. The review RPCs (`review:listRepositories/listRuns/getRun/listFindings/getSettings/listLanes`) were mocked in the Electron main process, so no GitHub call and no paid lane ran. The AFTER fixture sends the wire shape the repository derives from the `checkpoint:lane:<stage>` docs (`usage` totals): exact stage, a 3-run stage, unknown cost (null with partial flag), partial tokens and cost, and a partial run total. The `defaultModelBlocked: true` flag is set on the `codex` lane listing entry, with the saved pool entry and the triage pin both on `codex` / Lane default. BEFORE gets the same fixture without `usage` and `defaultModelBlocked`, because main's contract schemas are `.strict()` and would reject those keys. The derivation of the flag from real credentials/catalogs was not exercised (backend, covered by unit tests).

## Screenshots (in `screenshots/`)

before-run-detail-dark.png, before-run-detail-light.png, after-run-detail-dark.png, after-run-detail-light.png, before-lanes-drawer-dark.png, before-lanes-drawer-light.png, after-lanes-drawer-dark.png, after-lanes-drawer-light.png

## Findings

### Visual breaking / Serious
None.

### Moderate
1. Stage cards in the 3-column pipeline row are narrow at 1440px. The Triage and Verification usage line wraps to two lines ("15,050 tokens ·" / "$0.0731") and the "·" separator is left dangling at the line end (after-run-detail-*.png). Readable, not clipped. Fix option: put tokens and cost on separate lines or use `whitespace-nowrap` on each figure.
2. Run-level and stage usage text is `text-xs text-base-content-muted`. In light theme it sits on the frosted glass card and is the lowest-contrast text on the page (visually, not measured numerically). It stays readable in the capture. Contrast ratio was not measured with a tool. Check it if the muted token is changed.

### Observations (no action)
- Run total renders "Usage: ≥ 2,118,237 tokens · ≥ $4.09" in the Coverage card. The "≥" appears only on partial figures. Thousands grouping is correct. Cost below $1 shows 4 decimals ($0.0731, ≥ $0.4100) and above $1 two decimals ($2.49, $1.12).
- Unknown cost renders "—" (security-privacy lens: "1,333,332 tokens · — · 2 runs"), never "$0". A stage with no usage (Discovery) shows no usage line. "· N runs" is shown only when runs > 1.
- No truncation of usage text. The model line below it truncates with an ellipsis, as on main.
- Lanes drawer: with a blocked lane default, the pool row shows an "Unavailable" badge, a warning-tinted row, the select label "Lane default (blocked)" and the reason "Lane default model blocked for review lanes. Reviews skip it and say so." The triage pin shows the same badge, label and reason ("Reviews use the pool order and say so."). Legible in dark and light. On main the same data shows plain "Lane default" and no badge.
- Both themes match in layout. Dark and light of the run detail differ from before only by the added usage lines.

## Prototype fidelity

No prototype folder exists for this task. Before/after pairs (dark and light) compared: run detail (before-run-detail-{dark,light}.png vs after-run-detail-{dark,light}.png) shows only the added usage lines. Lanes drawer (before-lanes-drawer-{dark,light}.png vs after-lanes-drawer-{dark,light}.png) shows only the blocked state. No regressions found in other regions.

## Verdict

- Recommendation: APPROVE
- Confidence: MEDIUM (one viewport, mocked RPC data, no numeric contrast measurement)
- Key concern: usage lines wrap awkwardly in the narrow stage cards (moderate).
