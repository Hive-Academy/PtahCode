# Phase 3 report 1: chain lane 1 (B3.2, B3.3, B3.4, B3.5, B3.5b)

Status: all 5 batches complete. No commit, no push (the coordinator owns git).

`PA/` = `libs/frontend/chat/src/lib/settings/ptah-ai/`. All commands ran from the worktree root
`/home/amun/ptah-extension/.claude-worktrees/settings-lanes-modals`. Logs are in `.ptah/tmp/l1-*.log`.

## Check baseline

- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`: exit 0 after each batch (no error at all).
- `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json`: exit 2 on the base and after each batch. The base
  has old errors in fixtures (813 output lines for the project). In `PA/` the error set after each batch is equal to
  the set before my first spec edit (21 errors, compared without line numbers; list in `.ptah/tmp/l1-spec-baseline.txt`).
  Old errors in my write set, not caused by this work and not changed: `lanes-table.component.spec.ts` and
  `lanes-table.visual.component.spec.ts` fixtures (`permission: { label, detail }`, TS2353, 2 each),
  `cli-lane-default-cell.component.spec.ts:103,127` (`'auto-edit'`, TS2322). The 5 new spec files have 0 errors.
- Final run of all 16 specs that mount a changed component: 16 suites, 271 tests, exit 0 (`.ptah/tmp/l1-final-jest.log`).
- ESLint on each changed file: 0 errors. Warnings are old `no-non-null-assertion` lines only.
- Not run (lane rule): `npm run verify`, `nx`, `typecheck-templates`, build, Electron. The coordinator must run
  `typecheck-templates`: B3.2, B3.5 and B3.5b change templates, and `tsc` does not compile them.

## B3.2 Table split

Files: `PA/lane-model-effort-cell.component.ts` (NEW), `PA/lanes-table.component.html`, `.ts`, `.css`,
`PA/lanes-table.component.spec.ts`, `PA/lanes-table.visual.component.spec.ts`.

Changes:
- NEW `ptah-lane-model-effort-cell` with the plan API (`row`, `place`, `openField`, `interactive`, `canWrite`, `busy`,
  `toggled`, `closed`). It holds the former `<ng-template #modelEffort>` and its helpers. The table keeps `openCell`,
  the one-popover rule and the focus return. NEW table method `openFieldOf(row, place)` feeds `openField`.
- The host element takes the classes of the former `span.lane-model-value`. The DOM depth and all table style
  selectors stay the same. One selector was added in `lanes-table.component.css`
  (`.ptah-table-control-cell > ptah-lane-model-effort-cell`) because the old `> span` selector does not match a
  custom element.
- `splitModelId` moved to the cell file. The table re-exports it, because the visual spec imports it from the table.
- Table imports removed: `NativePopoverComponent`, `NgTemplateOutlet`, `CliModelEffortPopoverComponent`.
- `(installGuideRequested)` binding removed from the table template.
- Specs: the override targets `LaneModelEffortCellComponent`. The visual test "keeps recovery actions..." clicks the
  status-cell button.

Acceptance: 3.2. Test ids `cli-matrix-model`, `lanes-effort-na` and all inner ids are kept. All other tests pass
unchanged.

Checks:
- `npx jest ... --runTestsByPath` the 5 lanes specs + `cli-model-effort-popover.component.spec.ts`: exit 0, 121 tests.
- lib `tsc` exit 0. Spec `tsc`: equal to baseline. `npx eslint` on the 5 code files: exit 0.

## B3.3 Drag logic

Files: `PA/lane-order-drag.ts` (NEW), `PA/lane-order-drag.spec.ts` (NEW), `PA/lane-order-list.component.ts`.

Changes:
- NEW plain class `LaneOrderDrag` with the plan API. `dropIndex` and `announcement` are read-only signals.
  `settled(id, direction, focus)` sets the announcement and calls `focus`; the view owns the DOM focus.
- `lane-order-list.component.ts` delegates to it (same template, same `policy-order-*` ids) and re-exports
  `LaneOrderDirection` and `LaneOrderMove`.
- 13 new tests: up/down, ends, refused moves, drag data, drop indicator, drop up and to the end, no-move drops,
  cancelled drag, announcement, no announcement when the order did not change.

Acceptance: 3.3. `lane-order-list.component.spec.ts` and `agent-orchestration-config.component.spec.ts` pass unchanged.

Checks: jest (drag spec + the 2 unchanged specs) exit 0, 67 tests. lib `tsc` exit 0. Spec `tsc` equal to baseline.
ESLint exit 0.

## B3.4 Header controls

Files (all NEW): `PA/lanes-max-concurrent.component.ts` + `.spec.ts`, `PA/lanes-redetect-button.component.ts` + `.spec.ts`.

Changes:
- `ptah-lanes-max-concurrent`: `Layers` icon, label "Max concurrent", number input 1-100, `ptahInput size="sm"`,
  `w-20`, DOM id `lanes-max-concurrent`, test id `policy-max-concurrent-input`. The save handler is the handler of the
  policy bar (clamp, round, Undo, read-back value). No inputs.
- `ptah-lanes-redetect-button`: icon-only `ptahIconButton`, label "Re-detect CLIs", `RefreshCw`, `Loader2` with
  `animate-spin` while busy, `testId` input (default `policy-redetect`). Same announcements as the policy bar.
- Not bound in a template yet (B3.7b, B3.8, B3.9 bind them). The policy bar keeps its copies until B3.10.

Acceptance: 3.4. The tests of `agent-orchestration-config.component.spec.ts` `:292-400` and `:767-830` are ported
(the originals stay until B3.10). 20 tests.

Checks: jest (2 specs) exit 0, 20 tests. lib `tsc` exit 0. Spec `tsc` equal to baseline. ESLint exit 0.

## B3.5 Row cells

Files: `PA/lane-row-identity.component.ts`, `PA/lane-row-identity.component.spec.ts` (NEW),
`PA/lanes-table-status.component.ts`, `PA/lanes-table-status.component.spec.ts` (NEW),
`PA/lanes-table.visual.component.spec.ts`. `PA/lanes-table.component.spec.ts` needed no change in this batch.

Changes, identity:
- Always two lines, also when collapsed. Line 2 = `versionLabel` (CLI), provider (Ptah CLI), or `--`.
- Kind badge: the identity projects its own badge span with class `kind-cli` or `kind-ptah` (the shared
  `ptah-table-row-title` has no variant input and `UI/` is not in the write set). Outline style with coloured text:
  `--ptah-kind-cli-ink` (default `oklch(var(--in))`, border 50%) and `--ptah-kind-ptah-ink` (default
  `oklch(var(--s))`, border 55%). Light themes (`[data-theme-mode='light']`): `#1d4ed8` and `#7a5900`.
- NEW input `statusIcon` (default `false`): shows the state icon beside the name with the status as its accessible
  name, in place of the kind badge. B3.7b binds it below 640px.
- Removed: the hidden install link, the output `installGuideRequested`, the `data-uninstalled` rule, the rule that
  hid line 2 when collapsed, the import of `PtahButtonDirective`.

Changes, status:
- Icon + text. NEW `laneStatusGlyph()` and NEW small `ptah-lane-status-icon` (same file): `CircleCheck` (ready),
  `KeyRound` (needs key), `CircleDashed` (neutral), `CircleAlert` (error or warning), `Loader2` (initializing). Text
  is `text-base-content`; the icon has the state colour. `data-ink`, `title`, `cli-matrix-status`,
  `cli-matrix-runtime-status`, `cli-matrix-key-status`, `.ptah-status-text` and the sr-only test text are kept.
- `ptah-lane-default-warning` is a focusable `Info` `ptahIconButton` (tooltip, accessible name, sr-only reason,
  test id `lane-default-warning`).
- Outputs `installGuide` and `signIn` deleted. `ptah-status` is no longer used by this cell.

Acceptance: 3.5 identity and status; new tests for P-22, decisions 16 and 26, P-25.

Measured contrast (WCAG formula, theme values from `apps/ptah-extension-webview/tailwind.config.js`, on `base-100` /
`base-200`). The visual reviewer must confirm on the real card surface:

| Theme | CLI ink | Ptah ink |
|---|---|---|
| anubis (dark) | `info` 5.04 / 4.71 | `secondary` 8.81 / 8.24 |
| ptah-glass (dark) | `info` 7.13 / 6.38 | `secondary` 12.12 / 10.85 |
| anubis-light | token 2.59 (fail) → `#1d4ed8` 6.28 / 5.61 | token 4.10 (fail) → `#7a5900`, darker than `#8a6500` (4.99 / 4.46) |
| ptah-glass-light | `#1d4ed8` 6.13 / 5.60 | `#7a5900`, darker than `#8a6500` (4.87 / 4.45) |

`#7a5900` itself was not put through the formula; it is darker than `#8a6500`, which gives 4.45 on `base-200`.

Checks: jest (2 new specs + the 5 lanes specs) exit 0, 123 tests. lib `tsc` exit 0. Spec `tsc` equal to baseline.
ESLint exit 0.

## B3.5b Default cell

Files: `PA/cli-lane-default-cell.component.ts`, `PA/cli-lane-default-cell.component.spec.ts`.

Changes:
- `compact` layout: the "More default actions" popover is replaced by an icon-only `RotateCcw` `ptahIconButton`.
  Label and tooltip = `Reset to default (<value>)`. Test id `cli-lane-default-reset`.
- NEW input `resetVisibility: 'auto' | 'always'` (default `'auto'` = the condition of today).
- `reset` layout: the same icon-only reset is the fallback content of `<ng-content>`. It shows only when the caller
  projects no control. The table projects its text button today, so nothing changes there until B3.7b.
- `wide` and `card` layouts are unchanged (`cli-shared-defaults` uses `wide` until B3.11a).
- `requestReset`, the yolo confirmation, the inputs `cli` and `name`, the outputs `selected` and `resetRequested` are
  kept. No `'inline'` layout.

Acceptance: 3.5 default cell. The reset test queries by aria-label. 6 new tests (no saved default, `auto`, `always`,
disabled, `reset` layout fallback, `wide` unchanged).

Checks: jest (cell spec, `cli-shared-defaults.component.spec.ts`, the 5 lanes specs) exit 0, 119 tests. lib `tsc`
exit 0. Spec `tsc` equal to baseline. ESLint exit 0 (2 old warnings).

## Deviations

1. B3.2: the plan gives the cell an inner `span.lane-model-value`. The class is on the host instead. Reason: the
   unchanged visual test "keeps compact names and kind together..." requires the element after the identity to have
   that class.
2. B3.5: two visual tests outside the ranges named in the batch row were changed, because the two-line rule makes
   them fail: "omits an empty secondary identity line..." (now "fills an empty secondary identity line...", expects
   `--`) and one assertion in "keeps compact names and kind together..." (line 2 is present). The file is in the
   write set.
3. B3.5: `lanes-table.component.spec.ts` `:807` and `:857` pass with no edit.
4. B3.5b: `:368` needs no change (it does not read the reset control).
5. B3.3: the announcement keeps the text of today ("Codex moved to position 2 of 4"). The plan example has no
   "of 4"; the unchanged list spec requires it.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Badge text stays "CLI agent" / "Ptah CLI" | "CLI Agent" (lane brief) or "CLI agent" | `decisions.md` rows 13 and 16 and `design-spec.md` use "CLI agent"; the code of today uses it | yes, one string |
| Light gold ink `#7a5900`, not the prototype `#8a6500` | prototype shade or a darker one | `#8a6500` gives 4.45-4.46 on `base-200` of both light themes, below 4.5 | yes, one CSS value |
| `statusIcon` is an input, not a container query | input or CSS only | the 640px limit is the pane width that the table measures (`modelColumn`); an input lets the icon have an accessible name only when it is shown | yes |
| Warning tone uses `CircleAlert`; `KeyRound` is by status kind `needs-key` | map by tone only or by kind | the plan lists 5 icons; `needs-key` is the only kind with a key meaning | yes |
| `reset` layout reset = `<ng-content>` fallback | always render, or leave to the caller | the table projects a text button today; a second control in the same detail would be a duplicate | yes |
| `wide` layout keeps its menu | change all layouts or only `compact` and `reset` | the plan names `compact` and `reset` only | yes |

## Proposed Removals

None. Only the removals approved for these batches were made (hidden install link and `installGuideRequested`,
status outputs `installGuide` / `signIn`).

## Changes that belong to another writer

`git status` shows changes in `PR/*modal*`, `PR/providers-settings.component.*` and
`PA/capability-matrix-setting.component.*`. I did not make them (lane P). No `tsc` error came from those files.

## Needs an Electron visual check

- Kind badges: colours and contrast in the 4 themes on the real card surface (glass tiles included).
- Rows at 640-950px and below 640px: line 2 is now visible when collapsed. Below 640px a row has name, badge,
  line 2 and the model line until B3.7b hides the badge and sets the row height (`--ptah-lane-row-h`).
- Status cell: icon size and alignment with the text; the `Loader2` turn for an initializing lane.
- The `Info` row mark: size beside the name, tooltip on hover and focus.
- Model cell: no layout change expected after the split (same DOM depth); confirm ellipsis and the two-part model id.
- Default cell `compact` with a caption: the icon-only reset position. No production caller shows it today.
- `ptah-lanes-max-concurrent` and `ptah-lanes-redetect-button`: not rendered until B3.7b / B3.8 / B3.9.

## UI class audit (decision 46)

Command: `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` from the worktree root, after all 5
batches. Exit 0. Summary line: `0 token count(s) over baseline` (log: `.ptah/tmp/l1-class-audit.log`).

- Write set of this lane: no blocked token. The one line that names a file of the write set is
  `cli-lane-default-cell.component.ts: btn=1 btn-sm=1 btn-warning=1 (ok)`. That is the old Confirm button of the
  full-access dialog, equal to its baseline; this lane did not change it.
- The new files use only `--ptah-*` token spacing (`gap-[var(--ptah-gap-label)]`, `gap-[var(--ptah-gap-inline)]`)
  and `@ptah-extension/ui` primitives (`ptahIconButton`, `ptahInput`).
- Files of other writers: no error. The audit reports only count decreases there (`PR/` modals,
  `provider-catalog-modal`, `local-stt-panel`, `local-tts-panel`). `--update-baseline` was not run.

## Handoff

- State: B3.2, B3.3, B3.4, B3.5, B3.5b complete and checked. Nothing is in work. No commit.
- Next for the coordinator: run `typecheck-templates`, then start chain 2 (B3.6).
- Chain 2 must know: `statusIcon` (identity), `resetVisibility` and the `reset` layout fallback (default cell),
  `ptah-lane-status-icon` / `laneStatusGlyph`, `LaneOrderDrag`, `ptah-lanes-max-concurrent`,
  `ptah-lanes-redetect-button`, `ptah-lane-model-effort-cell` (host has class `lane-model-value`).
