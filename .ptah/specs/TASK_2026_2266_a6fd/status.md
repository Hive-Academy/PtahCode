# Status — TASK_2026_2266_a6fd (child D), PR #1419

## Update (session 4, later)
Coordinator: ptah-ptah-extension-design-epic-coordina-0ffed60000acw2rrgvdnt1b (new).
- CI of 3546f9bb: webview-e2e FAIL (17 failed, 9 distinct settings scenarios; passes on main). Log: ci-webview-e2e-3546f9bb.txt.
- L11 (8 polish findings) committed 0436f17c0. origin/main 8826c726 merged e494bf3e7; baseline.json by fresh audit run (885 <= 905, spacing 609 <= 654).
- L12 codex lane (8f3baf83) fixes the webview-e2e failures (brief L12-brief.md). Next: gate, typecheck-templates, audit, renderer copy, iter10 shots, one push.

## Earlier report

PR #1419 pushed. Head 3546f9bbccc44695e15811b349da267c8184489c (merged origin/main d699e28307ce06c681465fb6f2aa1a2b8d713b22). CI: running, watcher active.

Commits since 91684b20:
- 04fecf375 fix(chat,e2e): address the providers review of PR 1419
- ae5f99a47 merge of origin/main d699e283 (an earlier merge of c8dbeda7 is in the same range); no conflicts
- 3546f9bbc docs(docs): refresh the providers gate shots for PR 1419

Per finding:
1-3. Lane detail: ptah-table-detail-layout wide on an inset surface, 3 zones, one 8.5rem term width, short capability chips ([data-capability]) with a popover, all actions outline ptahButton, Delete at far right.
4-5. Human option labels (lane-option-labels.ts from PERMISSION_LEVEL_NAMES). Row actions in the Status cell, Actions column removed, Status collapsed to 8rem. The Lane cell is readable at 784 px (gate shot asserts content width > 24 px).
6. Catalog names in a popover on the "13 available in catalog" badge (padded). Connection card text wraps to 2 lines.
7. aria-label "Background model roles" restored.
Select stacking: focused select raised with [&>*:focus-within]:z-[var(--ptah-z-raised)]. The gate shot asserts with elementFromPoint that the lowest option is on top at 1824/1168/784: PASS (Background models has no enabled combobox, so it is skipped).
CI e2e failures (4): fixed with the harness helper choose-ptah-select.ts and updated Electron specs.
CodeRabbit: both threads answered (gap token assertion; effort editor for an unset effort uses main's rule again).
Gate-shot spec fix: the Lane-width assertion measured the text of "Pi" (13 px). It now measures the content width of the th cell.

Verification on the merged head: npm run verify -p chat,core,webview-e2e-harness,ptah-electron-e2e PASS (8/8 lint+typecheck, 2/2 test). typecheck-templates PASS. ui-class-audit 0 over baseline (893 / raw-spacing 618). Gate shots iter9 PASS.

Shots: docs/design-system/settings/gate/1419/ (committed). Raw run: .ptah/specs/TASK_2026_2266_a6fd/screens/iter9/ (local, not committed).

Remaining differences (in the PR body): half-moon toggle, "Ptah CLI instances" card, Max Concurrent / order chain / Re-detect CLIs, "Installed" wording, Permission/Network in defaults, "· default" effort label in rows, instance Model value ellipsizes at 784, collapsed table at 1168, wizard not migrated, before shots only dark 1824.
