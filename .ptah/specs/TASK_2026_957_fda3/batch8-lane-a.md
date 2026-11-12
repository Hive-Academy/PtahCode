# Batch 8 lane A — badge adoption

| File | Result | Reason |
| --- | --- | --- |
| `skill-synthesis-ui/src/lib/components/clones/scorecard-badge.component.ts` | Adopted | Success verdict maps to `ok`, failure to `err`, ungraded to `neutral`; kept the existing title and text. |
| `skill-synthesis-ui/src/lib/components/clones/scorecard-detail.component.ts` | Adopted | Heuristic marker is `neutral`; graded verdicts map to `ok` and `err`. |
| `skill-synthesis-ui/src/lib/components/skills-pause-switch.component.ts` | Adopted | Paused state maps to `warn`; retained text sizing and weight. |
| `tasks-ui/src/lib/components/board/task-card.component.ts` | Partly adopted | Adopted outcome, type, estimate, executor, dependency, duplicate and overflow pills. Left visible label chips raw because their hash-selected background, text and border colors cannot be represented by the directive without a look and contrast change. |
| `tasks-ui/src/lib/components/board/task-card.component.spec.ts` | Updated | The adopted type pill is queried through `[data-ptah-badge]`. Label chip queries remain `.badge` because those chips remain raw. |
| `tasks-ui/src/lib/components/board/task-list.component.ts` | Partly adopted | Adopted status, outcome, type, estimate and overflow pills. Left visible label chips raw to preserve hash-selected colors and contrast. |
| `tasks-ui/src/lib/components/detail/task-activity.component.ts` | Left raw | The lane badge host is an `li`; `ptahBadge` only accepts `span`. Converting it requires restructuring the list, beyond badge lines. |
| `tasks-ui/src/lib/components/detail/task-detail.component.ts` | Left raw | Label chips use hash-selected background, text and border colors; the directive cannot preserve these colors. |

Checked other `tasks-ui` component specs for `.badge` selectors. The filter bar spec checks that `.badge-primary` is absent; it does not query a converted badge. Other requested spec names have no old badge selectors.

Verification: `npm run verify -- -t lint -p @ptah-extension/skill-synthesis-ui` and `npm run verify -- -t lint -p @ptah-extension/tasks-ui` both passed. Scoped diagnostics found no errors in the changed component files; they reported an existing type error in `task-card.component.spec.ts:134` and unrelated sibling errors. No Electron screenshot was taken: the permitted checks exclude launching the app, and no running Electron renderer was available. Light-theme contrast was therefore not visually measured in this lane.
