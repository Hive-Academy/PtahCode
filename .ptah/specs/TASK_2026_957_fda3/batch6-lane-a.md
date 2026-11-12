# Batch 6 marketplace badge adoption

## Changes by assigned file

| File | Result |
| --- | --- |
| `pages/servers/provider-list-view.component.html` | Adopted the provider group count as a neutral, small count badge. |
| `pages/servers/server-detail.component.html` | Adopted the server origin as a neutral, small badge; wrapped the variable origin in `ptah-badge-text`. |
| `pages/skills/installed-skills-page.component.ts` | Adopted the group count, shadowed state, and scope badges. Variable shadowed and scope labels use `ptah-badge-text`. The provenance badge remains raw: its plugin-specific primary border and custom background cannot be represented by the permitted tone/appearance pair without changing that look. |
| `pages/skills/skill-detail.component.ts` | Adopted both static Shadowed badges. The provenance badge remains raw for the same custom plugin-border and background treatment. |
| `shell/marketplace-nav.component.ts` | Adopted the nav count as a neutral, small count badge. |

The server components import `PtahBadgeDirective` through their `.ts` owners. All changed badge hosts are `span` elements. Existing layout utilities remain.

## Verification

- Searched affected component specs and nearby marketplace specs for `.badge` and old badge-class selectors; no selectors for these assigned components needed migration.
- `npm run verify -- -t lint -p @ptah-extension/marketplace` passed (one task).
- `npm run verify -- -t typecheck -p @ptah-extension/marketplace` passed (one task).
- `git diff --check` passed for the current worktree.
- Rendered `.ptah/specs/TASK_2026_957_fda3/batch6-badge-preview.html` through the Ptah browser and inspected `.ptah/screenshots/batch6-badge-preview.png`. The neutral count, warn tint, and warn outline follow `family-3-look.md` and the badge CSS. This is a representative static preview; the Angular pages were not served under the batch brief's verification restriction.
- Scoped Ptah TypeScript diagnostics initially timed out; the project typecheck completed successfully.

No commits or pushes were made.
