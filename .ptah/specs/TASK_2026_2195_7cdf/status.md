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
