# L11 brief — providers lanes polish (8 findings), PR #1419

Worktree (only work here): `D:\projects\ptah-extension\.claude-worktrees\fix-settings-providers-lanes-ae00bbe8bd36`, branch `fix/settings-providers-lanes`.
Angular 22 renderer of the Electron app (standalone, OnPush, signals, Tailwind + daisyUI, shared `@ptah-extension/ui`).
Main files: `libs/frontend/chat/src/lib/settings/ptah-ai/` — `lanes-table.component.{html,css,ts}`, `lanes-table-detail.component.{html,css,ts}`,
`lane-row-identity.component.ts`, `lanes-table-status.component.ts`; `libs/frontend/chat/src/lib/settings/providers/provider-connection-card.component.ts`. Their specs sit beside them.
Current shots for reference: `.ptah/specs/TASK_2026_2266_a6fd/screens/iter9/providers-lanes-*-after.jpg`, `providers-*-detail-*-after.jpg`, `providers-catalog-popover-dark-1824-after.jpg`.

## Findings to fix
1. Row Model cell shows "CLI default · default" / "Provider default · default". In the ROW, show the effort part only when an effort is set (OpenCode already shows only "CLI default"). The effort editor for an unset effort must stay reachable: keep it in the expanded lane detail (the detail Model/Effort fact), not in the row. The `modelEffort` ng-template (lanes-table.component.html ~251-343, used at ~343 for the row and ~453 for the detail) has a `place` context — use it. Keep `hasEffort(row)` semantics for the detail. Keep testid `lanes-effort-na` and aria-label `'Effort default for ' + row.name` on the effort trigger.
2. No cut (ellipsized) value in any detail fact at 1824 / 1168 / 784: e.g. detail Model value "CLI defau · default" at 1168, "Provider defaul · default" at 784. Let values wrap or let the value column grow.
3. At 784 (compact tier) rows cut lane names ("Antigrav...", "Syntheti...") and show the version as "v...". At the compact tier hide the version/provider subtitle in the row (it is in the detail) and give the name the width. No ellipsis on a lane name at 784.
4. At 1824 lanes with no subtitle (Grok, Claude, Cursor, Pi) put the name at the top of the row while other cells are centered. Center the Lane cell content vertically when there is no second line.
5. Status cell: the kebab (More actions) button sits at a different x in each row. Put it at one fixed position, the end of the Status cell, same x in every row.
6. Connection card: "CLI subscription ·" shows a separator with nothing after it. Do not render the separator when the second part is empty.
7. Detail at 1168: three zones are too tight (chips wrap 1/2/2 in a narrow middle column). At that tier use two rows: facts left + actions right, then capabilities as one full-width chip row (or an equally clean layout). At 1824 give the capabilities zone the width for all 5 chips in ONE row ("Limit" must not wrap alone).
8. Table header at 1168 and 784: "Order" and "Lane" touch. Give the Order column the same cell padding/gap as the other columns.

## Hard rules
- Keep every `id`, `data-testid` and `aria-label` (do not rename or remove any). Keep `[data-capability]` chips and the capability/catalog popovers.
- Do not edit `libs/frontend/ui/**/field.component.ts`, ptah-setting-row, ptah-description-list, `advanced-settings-group.component.ts`, `advanced-settings.types.ts`. Prefer component CSS / existing tokens (`var(--ptah-...)`) over new raw Tailwind spacing classes; the ui-class-audit baseline must not go up (`npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` must report 0 over baseline; never pass --update-baseline).
- Update or add unit specs for each behavior change (row hides unset effort; detail keeps the effort editor; separator; compact subtitle hidden). Do not weaken existing assertions; move an assertion only when the element really moved (say so in the report).
- Checks allowed (focused only): `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed specs>`, `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`, `npx eslint <changed files>`, `npx prettier --write <changed files>`, the ui-class-audit command above. Never run `npm run verify`, `nx`, build, serve or e2e.
- Do not commit, push, stash or revert. Do not touch files outside the list above and their specs unless one is needed; list every changed file.
- No user e-mail or Windows user name in any file.

## Deliverable
Write `.ptah/specs/TASK_2026_2266_a6fd/L11-polish-report.md`: per finding what changed (file:line), changed files, check results (jest/tsc/eslint/audit output summary), any assertion you moved and why, anything you could not do.
