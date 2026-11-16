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
