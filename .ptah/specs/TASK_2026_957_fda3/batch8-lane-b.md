# Batch 8 lane B: badge adoption (tasks-ui detail)

| File | Result |
| --- | --- |
| task-detail-header.component.ts | Adopted the type badge and the stage badge (neutral, sm, text in `ptah-badge-text`). LEFT RAW: the status badge. It takes a dynamic ink class from `TASK_STATUS_INK`, so a tone mapping would change its colors. |
| task-document-reader.component.ts | Adopted the document state badge (neutral, sm). |
| task-folder-overview.component.ts | Adopted the "Machine-owned carrier" badge (neutral, sm). |
| task-run-placeholder.component.ts | Adopted the "Planned for Phase 2" badge (neutral, sm). Added the directive import. |
| task-metadata-editor.component.ts | LEFT RAW: label chips use a hash-picked color class (`labelChipClass`) and hold a remove button. No tone matches. |
| task-relations.component.ts | LEFT RAW: the relation chips are `button` elements, but the directive host must be a `span`. Authored/derived variants (outline, dashed border) also have no owner equivalent. |

Not in my file list and untouched: `task-activity.component.ts` and `task-detail.component.ts` still use raw badges.

## Specs
No spec in `detail/` queries `.badge`. The header and reader specs use `data-testid` only, so no spec edit was needed. The only `badge` hits in other tasks-ui specs are `data-testid` values and test names.

## Light theme contrast
The four adopted badges used `text-base-content` on a ghost badge. They now use the neutral tone ink of the owner. I did not measure contrast. The parent session must check the neutral ink in the light theme.

## Verification
- `npm run verify -- -t lint -p tasks-ui`: passed.
- Prettier ran on the four changed files.
- I did not run specs or the template typecheck. No commit or push.
