# Status

## Step 1: evidence (done)
Evidence file: usage-evidence.md (codex lane).

| Candidate | Sites | Settings sites | Decision |
| --- | --- | --- | --- |
| Warning tone for ptahButton | 19 action sites (+17 alerts, which use ptah alert) | 2 | BUILD (PR 1) |
| Disclosure | 100 (37 `<details>`, 63 hand-made toggles) | 16 | BUILD (PR 2) |
| ptah-table | 24 | 13 | BUILD (PR 3) |
| Progress (raw `<progress>`) | 13 | 2 | Queue after PR 3 (5+ sites rule) |

Order: warning button first (required), then disclosure (16 settings sites), then table (13).

## Features per component
- Warning: tone `warning` for filled and outline, xs/sm, disabled/loading. No new variant.
- Disclosure: native or controlled open, default open, summary with chevron, compact size, projected content, aria-expanded/aria-controls. Animation is optional and not built first.
- Table: semantic table, xs/sm density, overflow wrapper, caption or aria-label, numeric column class. Sort, sticky header, selection stay out until a site needs them.

## Proof sites (non-settings only)
To be declared per PR.

## PR 1: warning tone (open)
- PR: https://github.com/Hive-Academy/PtahCode/pull/1336, head d6d7c227a.
- Proof site: delivery-status retry button (non-settings). Baseline lowered.
- Checks: ui test/lint/typecheck pass, webview typecheck-templates pass. chat tests cannot start: marked.umd.js missing in shared node_modules (environment).
- CI: no checks reported yet at report time.
- Open minor findings: stale `tone` comment in button.directive.ts (7th file, over the six-file limit); no spec guard for the ghost hover rule narrowing.
- Next: PR 2 disclosure, PR 3 table, in separate worktrees from main.

PR 1 update: head a9dd6f5e6. Spec fix: `--wac` added to the `fromTheme` allowlist in design-tokens.spec.ts. Warning-content contrast is 5.67 or more in all four themes. Run design-tokens.spec in each PR that adds a token.

## PR 2: disclosure (open)
- PR: https://github.com/Hive-Academy/PtahCode/pull/1338, head 2e3c23093.
- Proof site: machines-intro (centered trigger via `align="center"`). `region` input is optional, default off.
- Checks: related tests, lint, typecheck, typecheck-templates pass.

### Next disclosure PR (not in #1338)
Features that the 100 sites need and the first version lacks:
- Rich header content (icons, badges, several lines, an action area) beyond the label and meta slot.
- Lazy body mounting for sites such as machine-overview, where the details control conditional panel mounting.
- Native `<details>` interop or an exclusive-group (accordion) mode, if the settings sites need it.

## PR 3: ptah-table (open)
- PR: https://github.com/Hive-Academy/PtahCode/pull/1339.
- Proof sites: usage-top-sessions and usage-breakdown-table (dashboard). No baseline change.
- Checks: related tests, lint, typecheck, typecheck-templates pass. Review: 0 blockers, 0 majors, 5 minors accepted.
- Queued: raw `<progress>` (13 sites), needs a parent decision.

PR 3 update: head 30c6f660b. Numeric header cells use `ptahNumeric`. Test ids `usage-breakdown-model`, `usage-breakdown-day` and `usage-top-sessions` now sit on the `ptah-table` host. usage-dashboard.component.spec passes. No e2e selector in apps/ uses these ids or `table[data-testid]`.

### Queued PR: ptah-table v2 (design from the settings prototype)
Waits for the parent's order. The settings prototype defines the table look: header style, row height tokens, hover and selected row, sticky header, empty and loading slot, row actions. v1 only forwards the DaisyUI `table` classes.
