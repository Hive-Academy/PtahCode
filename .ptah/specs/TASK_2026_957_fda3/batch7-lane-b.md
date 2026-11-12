# Batch 7 lane B: badge adoption

| Assigned file | Result |
| --- | --- |
| `setup-wizard/src/lib/components/community-packs-panel.component.ts` | Adopted Installed as `ok` soft `sm` and Kept as neutral soft `sm`. Both labels are fixed. |
| `setup-wizard/src/lib/components/completion/outcome-summary.component.ts` | Adopted per-file badges as `err` soft for failed, neutral soft for changed-since-preview, and neutral outline otherwise. Kept `shrink-0`; wrapped computed labels in `ptah-badge-text`. |
| `setup-wizard/src/lib/components/preview-decisions/file-decision-row.component.ts` | Adopted state as neutral soft `sm`; wrapped computed state text in `ptah-badge-text`. |
| `setup-wizard/src/lib/components/preview-decisions/target-root-choice.component.ts` | Adopted Default as neutral soft `sm`; kept `ml-1`. Label is fixed. |
| `skill-synthesis-ui/src/lib/components/clones/agent-model-editor.component.ts` | Adopted classification as `ok`, `warn`, neutral, or `err` soft `xs`. Typed the tone map as `PtahBadgeTone`; wrapped label in `ptah-badge-text`. |

All seven badge hosts are spans and import `PtahBadgeDirective`. No assigned badge was left raw. Tones follow the prior success, warning, error, and ghost classes; the planned soft owner look replaces solid colors. No owner files were edited.

Specs for the changed components had no `.badge` or old badge-class queries. Added attribute assertions in `file-decision-row.component.spec.ts`, `outcome-summary.component.spec.ts`, and `agent-model-editor.component.spec.ts` to cover the new owner, tone, and size.

Verification: `git diff --check` passed. `node_modules` is absent in this worktree, so scoped `npm run verify` tests and lint could not start. Two scoped `ptah_get_diagnostics` attempts timed out after 45 seconds and returned unchecked, not a pass. No rendered Electron view was available without a prohibited build/serve target, so visual comparison against `family-3-look.md` remains unmet. Source review checked the tone, size, appearance, spacing utilities, and overflow wrapper against that design reference.
