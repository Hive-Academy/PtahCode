# Phase 2 report, lane C (B2.7, B2.8) - TASK_2026_2285_304a

Status: B2.7 and B2.8 are complete. Focused checks pass for the write set. No render was done (see "Visual check
necessary").

`CH/` = `libs/frontend/chat/src/lib/settings/`.

## B2.7 Tools row and group components

Files (all NEW):
- `CH/pro-features/claude-builtins-row.component.ts`
- `CH/pro-features/claude-builtins-row.component.spec.ts` (9 tests)
- `CH/pro-features/claude-builtins-group.component.ts`
- `CH/pro-features/claude-builtins-group.component.spec.ts` (9 tests)

The config file was not changed in this batch. After B2.7 alone `BuiltinKind` existed twice, as the plan allows.

Row (`ptah-claude-builtins-row`, F31, F32):
| Contract item | How it is met |
|---|---|
| Inputs and output of plan 2.9 | `kind`, `itemId`, `name`, `description`, `tokens`, `on`, `disabled`, `blockedReason`, output `toggled: Event`. `BuiltinKind` is exported. |
| A switch that is still a checkbox | `<input type="checkbox" ptahToggle size="xs">`: `role="switch"`, `.checked` and the `change` event stay. |
| Test ids kept | `settings-toggle-claude-<kind>-<id>`, `claude-skill-dependency-<id>`. |
| `aria-labelledby` from `kind` + `itemId` (F29) | id `claude-<kind>-<id>-name`. Characters that are not `[A-Za-z0-9_-]` become `_` (a synced id has a colon). |
| Dependency chip | warn outline badge with `TriangleAlert`. The switch refers to it with `aria-describedby`. |
| Name, chip, description | name `font-medium truncate`, token chip `shrink-0`, description one line (`truncate`) with `title`. |
| Busy state | `ptahBusyDisabled`: `aria-disabled="true"`, focus stays, the click is cancelled. |

Group (`ptah-claude-builtins-group`, F26, F30):
| Contract item | How it is met |
|---|---|
| Inputs and outputs of plan 2.9 | all 12 inputs and the 2 outputs. `BuiltinGroupId` is exported. |
| Disclosure | native `button` with `aria-expanded` and `aria-controls` (the id resolves to the body). Enter and Space are native. |
| Header text | heading, badge, "n/N on · ~tokens". |
| Group switch | `button role="switch"`, `aria-checked` `true` / `false` / `mixed`, `aria-label` = `switchLabel`. Off or mixed requests `true`. On requests `false`. |
| `busy` | `aria-disabled="true"` (not `disabled`), focus stays, clicks are ignored. |
| Body | default content slot, `grid-cols-1`, `[@container(min-width:704px)]:grid-cols-2`, no `overflow-x-auto`. |
| Test ids (NEW, plan) | `claude-tools-group-<groupId>`, `claude-tools-group-switch-<groupId>`. |

## B2.8 Tools config

Files:
- `CH/pro-features/claude-builtins-config.component.ts`
- `CH/pro-features/claude-builtins-config.component.spec.ts` (52 tests: 35 updated or kept, 17 new)

What changed in the component:
- The local `BuiltinKind` is removed. The type comes from the row file.
- Section: `[level]="2" [wide]="true" [icon]="WrenchIcon"`. The sr-only `h2` and `aria-labelledby="claude-tools-heading"`
  are removed (F29). The section has one heading.
- One `ptah-alert tone="info"` replaces the 4 explanation blocks (F28). It keeps `role="note"`,
  `data-testid="claude-tools-applies-note"` and the text "These settings apply to all your workspaces."
- Sticky summary bar (F27), first child of the fields column: `sticky top-0 z-[var(--ptah-z-raised)]`. Content: `Zap`
  "Saved per turn ~N tokens" (`claude-tools-savings`, `aria-live="polite"`), "x of N on", the "Saving i of n" status,
  the filter (`claude-tools-filter`, `claude-tools-filter-clear`).
- Three groups with the new group and row components. "Built-in tools" is open by default. A closed group renders no
  row.
- State: `filter`, `expanded`, `groupProgress`, `visibleTools`, `visibleTerminal`, `visibleSynced`,
  `groupSwitchState(group)`, `toggleGroup(group, on)`.
- `toggle`, `load`, `read`, `apply`, `cost`, `skillName`, `isDependencyBlocked`, `hiddenTokens`, `savingsLabel`,
  `saveItem` and the overview report have the same code as before. `keepFocus` has the same behaviour. Its body moved to
  `focusAfterRender(selector)`, which the group switch and the filter also use.
- Imports that are not used now are removed: `PtahCheckboxDirective`, `PtahBadgeDirective`, `PtahSettingRowComponent`,
  `SettingsBusyDisabledDirective` (the row has it).

Acceptance:
| Item | How it is met | Test (`CB.spec`) |
|---|---|---|
| A-22 toggle each tool, token cost, skeleton | Each tool is a row with a switch and a token chip. Skeleton = 3 group headers + 4 rows, `aria-busy="true"`, `claude-tools-skeleton-row` kept. | "renders groups 1 and 2…", "shows skeleton rows…", "Toggle, save and Undo" |
| A-23 terminal skills: description, dependency note, blocked state | The row shows the description and "Needs the X tool." The blocked chip reads "X is off" and is the `aria-describedby` target. | "Dependency blocked" (3 tests) |
| A-24 synced skills and empty state | Qualified id in the write, plain name in the row and in the toast. Empty state has `Inbox` and the same 2 texts, `claude-tools-synced-empty` kept. | "Group 3" (8 tests) |
| A-25 "Saved per turn" | In the sticky bar, `aria-live="polite"`, test id kept. Overview report not changed. | savings assertions, "reports loaded tools…" |
| A-26 applies note, load error, unverified policy | Note in the info alert. Error = `ptah-alert` error + Retry (`RotateCcw`), `role="alert"`, no switch. Unverified fails closed. | "Load" (5 tests), "fails closed…" (2 tests) |
| A-27 Undo and focus after a failed write | `toggle` not changed. | "Toggle, save and Undo", "Atomic per-item write" |
| A-28 group switch | One `saveGeneric` call. `agent:setClaudeBuiltin` one time for each visible id that differs, in sequence. One toast "Saved Built-in tools (5 turned on)." with Undo. "Saving i of n" in `role="status"`. Partial failure: "2 of 6 changes were not saved.", the failed rows keep their stored state. The switch is `aria-disabled` and ignores clicks while a save runs. | "Group switch (A-28, decision 9)" (7 tests) |
| A-28 filter | Case-insensitive match on name and description. Opens groups with a match, hides groups with none. "No match" + Clear. Switch label "Turn on 2 shown in Built-in tools" and the switch acts on visible rows only. Esc clears a set filter. | "Filter (A-28)" (5 tests) |
| Sticky bar stays visible | Classes `sticky top-0 z-[var(--ptah-z-raised)]`, first child of the fields column, before the groups. | "keeps the summary bar sticky…" (structure only; see visual check) |
| F29 one heading, F30 no scroll wrapper | One `h2`, no `#claude-tools-heading`, no `overflow-x-auto`. | "has one h2 heading…" |

Parity: no capability was removed. Each tool toggle, each skill toggle, the token costs, the savings summary, the
applies note, the 2 error states with Retry, Undo, the focus behaviour and the synced empty state stay. NEW: filter,
counts, group switch.

## Decision 33: glass card padding

- The write set had no per-component copy of the card padding. There was nothing to remove.
- Stacked padding (evidence `claude-builtins-config.component.ts:88`): `data-glass-surface="content"` is on the
  `ptah-form-section` host, and the inner `section` has `py-[var(--ptah-gap-group)]` (1.5rem). With the rule of lane A
  the card would have 1.25rem + 1.5rem at top and bottom.
- Fix: the form section has `class="[[data-glass=on]_&>section]:py-0 [[data-glass=on]_&>section]:[border-bottom:0]"`.
  With glass on, the card inset is the only block padding and the divider is off. With glass off, nothing changes.
  This is the same class that `agent-behaviour-section.component.ts:134` uses.
- `CB.spec` asserts that the class is there and that no inline `padding` style is in the card.

## Checks

| Command | Exit code | Result |
|---|---|---|
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <row spec> <group spec> <config spec>` | 0 | 3 suites, 70 tests passed |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 | no error |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.spec.json` | 2 | 384 errors, 0 in the write set (see below) |
| `npx eslint <the 6 files>` | 0 | no error (first run: 2 `no-duplicate-attributes` errors in the group file, fixed) |

Logs: `.ptah/tmp/lane-c-jest.log`, `lane-c-tsc-lib.log`, `lane-c-tsc-spec.log`, `lane-c-eslint.log`,
`lane-c-eslint2.log`.

`tsconfig.spec.json` errors: no line names a `claude-builtins` file. The errors are in files outside the write set, for
example `services/chat-store/*.spec.ts` (most of them), `settings/providers/**`, `settings/ptah-ai/**`,
`libs/shared`, `libs/frontend/core/src/testing`. One error is in a file that another lane edits:
`CH/pro-features/system-prompt-drawer.component.spec.ts`. I did not fix or examine these errors. I did not compare with
`main`, so I cannot say which errors are older than Phase 2.

Not run (repository rules for a lane): `npm run verify`, `nx`, `typecheck-templates`, build, serve, e2e.
The coordinator must run `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: the 3 templates are new
or changed and `tsc` does not compile them.

## Deviations from the plan

1. Group input `hint` (not in the plan contract): optional text, shown as `title` of the disclosure button. It keeps the
   3 group paragraphs that F28 removes from the page ("Move group paragraphs to a `title`").
2. Unverified policy: the plan says "rows read-only". The component shows the error alert with Retry and no rows, as
   today. `apply` (plan: keep) does not store the lists of an unverified read, and `CB.spec` requires "no toggles".
   The alert has `data-state="failed"` or `"unverified"` to tell the 2 states apart. It is one template block.
3. A filter controls the groups: while a filter is set, a click on a disclosure button does nothing (as in the
   prototype).
4. Partial failure of a group switch: the toast has no Undo. `saveGeneric` offers Undo only after `ok: true`. The rows
   that saved stay saved.
5. Copy changes: the dependency chip reads "ReportFindings is off" (plan) and not "ReportFindings tool is off". The
   sentence "This skill is on but unavailable until the X tool is on." is now the `title` of the chip ("This skill is on
   but not available: X is off."). The switch name is the item name (`aria-labelledby`), without the suffix " tool" or
   " skill". The savings text has "~" ("Saved per turn ~4,000 tokens", plan and prototype).
6. Group headings: "Built-in tools", "Terminal-only skills", "Synced from claude.ai", with the badges "Off by default",
   "Off by default", "Hidden by default" (prototype). The old `h3` texts are gone.
7. NEW test ids that the plan does not list: `claude-tools-summary`, `claude-tools-on-count`, `claude-tools-groups`,
   `claude-tools-group-toggle-<id>`, `claude-tools-group-body-<id>`, `claude-tools-group-meta-<id>`,
   `claude-tools-no-match`, `claude-tools-no-match-clear`, `claude-tools-skeleton`, `claude-tools-skeleton-group`,
   `claude-builtins-row`, `claude-builtins-row-tokens`, `claude-builtins-row-description`.
8. `CB.spec`: `render()` opens the 3 groups by default, because a closed group renders no row. `render('default')` keeps
   the first state. The skeleton count changed from 9 rows to 3 headers + 4 rows.

## Not done

- No render and no screenshot. The lane rules do not permit build, serve or dev targets.
- No barrel export. The plan does not require one: the 2 new components are used only by the config in the same
  folder.
- The Enter and Space keys of the disclosure are tested through `click()`. jsdom does not turn a key press on a button
  into a click.
- Extra reads beyond the read set (signatures only): `feedback/settings-save-feedback.service.ts`,
  `feedback/busy-disabled.directive.ts`, `feedback/busy-disabled.testing.ts`, `agent-behaviour-section.component.ts`
  (lines 118-141, glass class), `advanced-settings.component.ts` (call site), `UI` alert, badge, skeleton, toggle,
  input, icon button, `tokens/ptah-tokens.css` (grep), `styles.css` (grep for the glass rules).

## Visual check necessary

1. Sticky bar: it must stay at the top of the scroll area while the 3 groups scroll, at 800x600 with the navigation and
   at 1600x900. Its background is `bg-surface-2` with a border. Make sure that rows do not show through it with glass
   on, dark and light.
2. Glass on: the card has one inset (1.25rem), no second block padding, no divider line.
3. Group switch: it is a hand-built `button role="switch"` (28x16px track), because `ptahToggle` cannot report
   `aria-checked="mixed"`. Compare its size and colours with the `toggle-xs` row switches, in the 3 states and in the
   busy state.
4. Rows: 2 columns when the group body is 704px or wider, 1 column below. No horizontal scroll at 800x600. Long names
   and descriptions truncate. The token chip and the warn chip do not shrink.
5. Group header at a narrow width: the "n/N on · ~tokens" text wraps below the heading.
6. Filter field: the `Search` icon and the `X` button sit inside the `input-xs` field.
7. A blocked skill in a closed group shows no chip until the user opens the group.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Group switch is a `button role="switch"`, not `input ptahToggle` | (a) button with `aria-checked`; (b) `ptahToggle` with `indeterminate` | `toggle.directive.ts` removes `role` while `indeterminate` and sets no `aria-checked`. The plan requires `aria-checked` true/false/mixed and `aria-disabled`. | yes |
| A closed group renders no row | (a) render only when open; (b) render always, hide with `hidden` | Plan Tests row for `CB.spec`: "open a collapsed group before querying its rows". Fewer switches in the DOM. | yes |
| The dependency note stays as text in the description ("Needs the X tool.") | (a) append to the description; (b) drop it | Parity A-23 lists the dependency note. The row contract has one description line. | yes |
| Keep `[divider]="true"`, switch it off only with glass on | (a) keep; (b) remove | The plan does not name the divider. Lane B made the same choice at `agent-behaviour-section.component.ts:134-140`. | yes |
| One error block for the 2 error states, with `data-state` | (a) one block; (b) two blocks | Both states have the same markup and the same kept test ids. The message differs. | yes |
| Filter field is `type="text" role="searchbox"` | (a) `text` + role; (b) `type="search"` | Chromium adds its own clear button to `type="search"`, next to the `X` button of the design. | yes |
| Element ids replace characters outside `[A-Za-z0-9_-]` | (a) sanitize; (b) raw id | A synced id is `anthropic-skills:docx`. A colon in an id breaks `#id` selectors. | yes |
| After an undo of a group switch that fails in part, the toast uses the same "k of n" sentence | (a) same sentence; (b) generic sentence | D15: fixed text, no host text. | yes |
