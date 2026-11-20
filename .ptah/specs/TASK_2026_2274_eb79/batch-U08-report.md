# Batch U08 report

Bots title-bar tab implemented. All 12 Bots tests and all 57 existing shell tests pass. Angular compilation, ESLint and class audit exit 0. Prettier check reports existing formatting differences in three files; these were not reformatted.

## Files and line counts

All component/spec paths below are under `libs/frontend/chat/src/lib/components/templates/` unless qualified.

| File                                                   | Lines | Change                                                                                           |
| ------------------------------------------------------ | ----: | ------------------------------------------------------------------------------------------------ |
| electron-shell.component.ts                            |   804 | Bot import/icon binding and sibling tab after Tasks; two no-folder conditions include bots.      |
| bots-tab.spec.ts                                       |   210 | New spec: 12 regressions.                                                                        |
| electron-shell.apps-tab.spec.ts                        |   218 | Expectations only: nine tabs, Bots ordering, selection-array length, no-folder surfaces.         |
| electron-shell.config-gate.spec.ts                     |   441 | Expectations only: nine tabs, Bots ordering, selection-array length, no-folder surfaces.         |
| electron-shell.command-center-tab.spec.ts              |   172 | Expected tab count becomes nine.                                                                 |
| electron-shell.machines-tab.spec.ts                    |   271 | Expectations only: Machines two positions after Tasks, nine tabs, Bots/Machines without folders. |
| apps/ptah-extension-webview/src/app/bots-route.spec.ts |    96 | Earlier single added real lazy-loader test retained.                                             |

The shell grew from the original 788 lines to 804: 14 lines for tab/import/icon and two lines for the requested workspace conditions. No new orchestration, CSS or primitive was introduced. Existing shell spec setup is unchanged and no tests were removed.

This report was rewritten using explicit UTF-8 without BOM and validated with a strict UTF-8 decoder. No task carrier or state file was edited.

## Acceptance coverage

- Bots appears directly after Tasks and before Machines, with lucide Bot (`BotIcon`), role tab, accessible label/title Bots, aria-selected and tab-active bound to currentView() === 'bots'. Click calls appState.setCurrentView('bots').
- Bots renders outside the folder-only block, like Machines. Without a folder the resolved shell offers Bots and Machines. The welcome condition excludes bots, and the Back to welcome condition includes bots. The loading gate still takes precedence.
- All 12 bots-tab.spec.ts tests pass: ordering/icon/name; navigation for Bots, Tasks, Machines and Chat; selected state for those four surfaces; no-folder availability/outlet/back behavior; loading behavior; independent no-folder condition regression.
- All eight existing shell suites pass, 57 tests. Changed expectations reflect the added tab without altering setup or deleting coverage.
- Carry-forward row 2 remains implemented by the single real-loader regression in bots-route.spec.ts. In the preceding task turn the routing command passed 3 suites / 122 tests; it was not rerun in this continuation because the latest instructions specify shell-focused checks only.
- Approved raw tab/tab-active sibling markup is the only added DaisyUI tab styling. No other raw control classes were added. Class audit exits 0 with zero counts over baseline.
- Only targeted shell insertions and two condition changes were made. No whole-file formatter ran on the shell, and no git commands were used.
- Rendered Electron screenshot verification remains for the coordinator/integration review. This lane did not launch the app or run a forbidden build/serve/dev/e2e/package target and does not claim visual validation from tests.

## Decisions

- Used the existing raw tab/tab-active sibling pattern, explicitly approved by the coordinator in the continuation. Alternatives were new CSS or a new primitive; both were expressly excluded. Reversible, local markup change.
- Updated existing shell expectations only, as expressly approved. Alternatives were leaving stale eight-tab assertions or assigning those updates elsewhere. No setup changes and no removed tests.
- Placed Bots immediately before Machines outside the folder-only block. Evidence: the required order and the coordinator decision that user bots work without a folder. Reversible.
- Used direct appState.setCurrentView('bots') in the template instead of adding a forwarding method. Evidence: existing public state API and the narrow no-new-orchestration scope. Reversible.
- Preserved existing formatting outside the edits. Prettier's first mismatch is an untouched import in each flagged file: shell line 85, config-gate line 1, machines-tab line 12. No --write was run during this continuation. Committed main formatting was not inspected because all git commands are prohibited.

## Command results

1. `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath` with the nine absolute paths below: **exit 0**, **9 suites passed, 69 tests passed** (12 Bots + 57 existing shell), no snapshots.
2. `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: **exit 0**. Nine warnings in existing unrelated templates: optional-chain diagnostics and unused directive imports. No Angular errors.
3. `npx eslint` with the seven affected code/spec paths listed in Files: **exit 0**, **0 errors, 23 warnings**. Warnings are 22 existing non-null assertions and the known shell max-lines warning (724 counted code lines, original file already exceeded 700).
4. `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: **exit 0**, scanned 1462 files, **0 token counts over baseline**. Baselines were not updated.
5. `npx prettier --check` with the same seven code/spec paths: **exit 1**. Existing formatting differences in electron-shell.component.ts, electron-shell.config-gate.spec.ts and electron-shell.machines-tab.spec.ts begin at unchanged imports. bots-tab.spec.ts, apps-tab.spec.ts, command-center-tab.spec.ts and bots-route.spec.ts pass. No formatter writes were performed in this continuation.
6. `ptah_get_diagnostics` after edits: tool returned unavailable after 45 seconds, shell unchecked. This is not claimed as a diagnostics pass; the explicit ngc check above passed.

Jest absolute paths supplied:

```text
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\bots-tab.spec.ts
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\electron-shell.activity-placement.spec.ts
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\electron-shell.apps-tab.spec.ts
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\electron-shell.command-center-tab.spec.ts
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\electron-shell.config-gate.spec.ts
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\electron-shell.machines-tab.spec.ts
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\electron-shell.notification-center.spec.ts
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\electron-shell.review-dock.spec.ts
D:\projects\ptah-extension\.claude-worktrees\bots-phase-1\libs\frontend\chat\src\lib\components\templates\electron-shell.view-transition.spec.ts
```

No git, npm run verify, nx, build, serve, dev, e2e or package commands ran. Another lane's bots-ui work was not edited or targeted by checks. Repository skill copies were read in the preceding turn; skill search had no matching result and no native skill-loading tool was available. No new skill-load success is claimed.
