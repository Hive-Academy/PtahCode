# Batch 7 lane A: badge adoption

| Assigned file | Result |
| --- | --- |
| `review-runs-ui/src/lib/components/review-repositories.component.ts` | Adopted four publication state badges as outline `xs` with `ok`, `info`, `warn`, and `neutral` tones. Variable labels use `ptah-badge-text`. |
| `review-runs-ui/src/lib/components/review-run-detail.component.ts` | Adopted the run state outline `xs` badge and same-family warning badge. Kept the state ink on the dot and label. |
| `review-runs-ui/src/lib/findings/review-finding-card.component.ts` | Adopted severity, lens, and triage badges. Minor stays outline; variable text uses `ptah-badge-text`. The existing `ptah-ui-status-badge` is a different component and remains as-is. |
| `setup-wizard/src/lib/components/agent-preview-dialog.component.ts` | Adopted both certainty badges and wrapped their variable labels. |
| `setup-wizard/src/lib/components/analysis-transcript.component.ts` | Adopted the message count as a neutral `sm` count badge. |

All assigned raw badge recipes were adopted; none were left raw. `review-repositories.component.spec.ts` now queries `[data-ptah-badge]` and checks tone/size attributes. Searched the affected libraries' specs for other old badge selectors; none referenced these components. All new directive hosts are `span` elements and all five standalone components import `PtahBadgeDirective`.

## Verification

- Scoped lint for `@ptah-extension/review-runs-ui` and `@ptah-extension/setup-wizard`: passed (2 tasks).
- Targeted `review-repositories.component.spec.ts` test: passed (1 task).`r`n- `git diff --check`: passed.
- Rendered `batch7-lane-a-preview.html` through Ptah browser and inspected `.ptah/screenshots/batch7-lane-a-preview.png` in dark and light previews. The outline state chips, warning tint, count, and overflow truncation follow the size, tone, and clipping recipe in `family-3-look.md`. This is a representative static preview with example color values, not an Electron page screenshot or a measured contrast check.
- Scoped TypeScript diagnostics timed out while its compiler was still running; the project typecheck subsequently passed (2 tasks).

No commits or pushes were made. Concurrent worktree edits outside the assigned files were left untouched.


