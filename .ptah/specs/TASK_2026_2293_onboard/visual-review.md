# Visual review: TASK_2026_2293_onboard (Get ready, Main connection step)

## Round 2 (after "Fix round 1"): APPROVED

F1–F4 and L2 are fixed in the running Electron app. No new defect was found. The round-1 report
below is kept for history; its verdict was REVISE.

### How round 2 was checked

- Build:
  - `ptah-electron:build-dev` passed.
  - `ptah-electron:copy-renderer-dev` failed once with esbuild "The service was stopped", the same
    memory-pressure failure as round 1 (free memory was about 4.6 GB). The retry passed.
  - Logs: `.ptah/tmp/onb-build-r2.log` and `.ptah/tmp/onb-build-r2-copy2.log`.
  - Both runs used `PTAH_VERIFY_MIN_FREE_GB=8` under the verify lock.
- Built CSS: `dist/apps/ptah-electron/renderer/styles.css` contains
  `.lg\:grid-cols-\[repeat\(var\(--connection-cols\)\,minmax\(0\,1fr\)\)\] { grid-template-columns: repeat(var(--connection-cols), minmax(0, 1fr)); }`.
- Isolation: the same driver as round 1, with a fresh run directory `%TEMP%\ptah-onb-live-vBfaqJ`.
  It holds a new user data folder, `PTAH_DB_PATH`, `PTAH_SESSIONS_DB_PATH` and `PTAH_SETTINGS_DIR`.
- Cleanup:
  - Electron exited with code 0. No `electron.exe` from this run remains.
  - Startup had changed `~/.gemini/config/mcp_config.json` (`9573bdcd...`) and
    `~/.codex/config.toml` (`0edbb7db...`). Both were restored from a new backup, and their hashes
    match the originals again (`2282ab3d...`, `ebf420d1...`).
- Screenshots are in `.ptah/tmp/onb-screens/`, named `r2-*`.

### Results

| Check | Result | Evidence |
|-------|--------|----------|
| F1: one tab panel at a time | **Fixed** | See F1 detail below. Screenshots: `r2-modal-dark-1280-unix.png`, `r2-modal-dark-1280-windows.png`, `r2-modal-dark-1280-after-esc.png`, `r2-modal-ptah-glass-light-1280.png`, `r2-modal-anubis-light-1280.png` |
| F2: no header squeeze | **Fixed** | See F2 detail below. Screenshots: `r2-dark-1600.png`, `r2-dark-1280.png`, `r2-dark-1024.png` |
| F3: detail cards equal height | **Fixed** | Detail cards measure 280/280px at 1600 and 300/300px at 1280. At a 1024 window the cards stack (250px and 260px), so they do not need to match. |
| F4: 2 cards fill one row from `lg` up | **Fixed** | `--connection-cols: 2`. The grid columns are `694px 694px` at 1600 and `553px 553px` at 1280, with no collapsed 0px tracks. The `lg:` class is in the built CSS. |
| 3-column simulation, 1280 | **Pass** | Columns are `362px ×3`. All 3 detail cards are 380px tall, and the title is 1 line (28px). The status row starts at y=396, below the heading bottom at y=384, so nothing overlaps. No horizontal scroll. `r2-sim3-1280.png` |
| 3-column simulation, 1600 | **Pass** | Columns are `456px ×3`. All cards are 320px tall. The status row starts at y=335, below the heading at y=323. `r2-sim3-1600.png` |
| L2: light-theme badge border | **Fixed** | The "Not your main connection" border is `oklch(0.236 ... / 0.14)` in ptah-glass-light and `oklch(0.236 ... / 0.14)` in anubis-light. It is visible in `r2-ptah-glass-light-1280.png` and `r2-anubis-light-1280.png`. |
| 760: no horizontal scroll | **Pass** | `scrollWidth` 784 = `clientWidth` 784, and no element extends past the viewport. `r2-dark-760.png` |

**F1 detail (install dialog tabs).**
- Exactly one `role="tabpanel"` is in the DOM.
- ArrowRight steps Windows → npm → macOS/Linux. At each step:
  - only the matching panel is visible;
  - its `aria-labelledby` points to the tab;
  - the selected tab's `aria-controls` points to that panel.
- Tab moves panel → Copy → docs link → Close → Re-check → tab. It wraps inside the dialog and no
  longer goes through hidden panels.
- Esc closes the dialog, and focus returns to `ready-install-open`.
- On the light themes, only the npm panel shows after clicking "npm".

**F2 detail (card header).**
- The header is now `flex-col`. The status chip and "How to install" sit on their own row below the
  heading at every width checked.
- At 1600, 1280, 1024 and 760, the title is 28px (1 line) and the description is 21px (1 line) in
  both cards. These match.

The 3-column simulation was runtime only, with no source change. I set `--connection-cols: 3` on
both grids and appended a cloned third card to each. The third detail card was a clone of the
Claude panel, which has the status chip and "How to install", the worst case.

### Notes (no change required)

- **N1. A 1024px window stacks the cards.** The Electron window's viewport is 1008px, below
  Tailwind `lg` (1024px), so both grids show one column (`r2-dark-1024.png`). This is the intended
  behaviour of the fix and reads cleanly. If two columns are wanted at a 1024 window, the breakpoint
  would have to drop to about `md`, or use a container query on the column.
- **N2. My round-1 light-theme check was incomplete.** In round 1 I set only `data-theme`.
  `ThemeService` also sets `data-theme-mode` and `data-glass-mode`, and the light glass tokens
  depend on them. So the round-1 L2 observation may have been partly an artifact of the check. In
  round 2 all three attributes were set, as the service sets them.
- **N3. The h1 focus outline is unchanged** (`r2-dark-1600.png`). As the batch report says, it
  comes from the shell's `focusHeading()` and is outside this diff.
- **N4.** In anubis-light, the "Main connection" badge border is the theme's light cyan primary,
  which is faint on the light surface. The text label carries the meaning, so this is not a
  blocker. It is an existing theme color.

### Round-2 code notes

- F1 is fixed as reported:
  - Only the active panel renders (`@if (activeTab() === tab.id)` in
    `install-guide-modal.component.ts`).
  - `aria-controls` is bound on the tabs.
- F3 and F4:
  - The grid class, `connectionColumns()` and the root `CONNECTION_OPTION_LIST` token are in
    `connection-options.ts`.
  - All three grids bind `[style.--connection-cols]`.
  - The detail grid is `items-stretch`, and the panel host and its `<section>` are `h-full`.
- F2 is fixed as reported: the header is `flex flex-col`, with the status row
  (`ready-panel-status-row`) below the heading.
- The token makes a 3-descriptor test list possible without touching the real list. That is a good
  seam for Antigravity later.

---

## Round 1 (superseded)

**Verdict: REVISE.** Two defects need a fix before merge: the install dialog shows every tab panel at
once, and the detail card header squeezes the card title. Two layout points, about card heights and
the third-card slot, need a decision.

## How this was checked

- Build: `ptah-electron:build-dev` passed (log: `.ptah/tmp/onb-build.log`).
  `ptah-electron:copy-renderer-dev` failed on the first run with esbuild "The service was stopped",
  which points to memory pressure and not to the code. The retry passed (log:
  `.ptah/tmp/onb-build-copy2.log`).
- Run: the built app ran through Playwright `_electron.launch` (driver: `.ptah/tmp/onb-live/driver.mjs`)
  with these isolation settings:
  - a fresh `--user-data-dir`, `PTAH_DB_PATH`, `PTAH_SESSIONS_DB_PATH` and `PTAH_SETTINGS_DIR` under
    `%TEMP%\ptah-onb-live-uVOKWX`;
  - the scratch workspace `.ptah/tmp/onb-live-ws`.

  The fresh profile opened onboarding at Get ready.
- Machine state: Claude Code is not installed, so it shows "Not installed". Codex is installed and
  signed in, so it shows "Ready".
- Cleanup:
  - The app closed through `app.close()` with exit code 0. No `electron.exe` process from this run
    remains.
  - Startup had changed `~/.gemini/config/mcp_config.json` and `~/.codex/config.toml`. Both were
    restored from the backup, and their sha256 hashes match the originals (`2282ab3d...`,
    `ebf420d1...`).
- Screenshots are in `.ptah/tmp/onb-screens/`. The paths below are relative to that folder.

## Requested items

| # | Item | Result |
|---|------|--------|
| 1 | "Main connection" is the page title | Pass. The h1 reads "Main connection" (`dark-1600-top.png`). |
| 2 | Each card has a consistent title and description | Partial. The markup is shared and the text matches. At 1024px and in a 3-column layout, the detail card header squeezes the title, description and badge (F2). |
| 3 | Install instructions open in a modal | Pass with a defect. The dialog opens, Esc closes it, and focus returns to "How to install" with a visible ring. All tab panels show at once (F1). |
| 4 | Wider page, so a third card fits on desktop | Partial. The column is 1440px at 1600 (measured). A third column fits by arithmetic, but the header collides at that card width (F2). The empty slot is not visible (F4). |
| 5 | The cards come from one list | Pass. `CONNECTION_OPTIONS` drives the radio cards, the placeholders, the detail cards and the announcements. |

## Findings

### High

**F1. The install dialog shows every OS tab panel at once.**
- Evidence:
  - `modal-dark-1280-open.png` shows the macOS/Linux, PowerShell, CMD and npm commands together.
  - `modal-ptah-glass-light-1280-open.png` has "Windows" selected, yet focus lands on the
    macOS/Linux panel.
  - Measured: every panel has `display: grid` even when `hidden` is true. The Tab key goes through
    the "hidden" panels.
- Cause: in `install-guide-modal.component.ts`, the tabpanel has `class="mt-3 grid gap-2"` and
  `[hidden]`. The Tailwind `.grid` utility comes after preflight's `[hidden]` rule and has the same
  specificity, so it wins. The tabs do nothing, and the ARIA tab pattern tells a screen reader the
  wrong thing.
- History:
  - The Claude block on `main` had the same bug.
  - It is new for Codex: its old panels had no `grid` class.
  - Jest misses it because jsdom loads no Tailwind CSS.
- Fix: render only the active panel (`@if (activeTab() === tab.id)`), or bind
  `[class.grid]="activeTab() === tab.id"`, or add `[class.hidden]`. A spec cannot catch this
  without CSS, so check it again in the next visual run.

**F2. The detail card header squeezes the title.**
- Evidence:
  - `dark-1024-panels.png`: in the Claude Code card, the "Claude Code" title wraps to 2 lines, the
    description to 3 lines and the badge to 2 lines. The Codex card beside it reads on one line
    each. This is the inconsistency item 2 was meant to remove.
  - `sim-1280-three-columns.png` is a runtime-only preview: 3 equal columns set as a DOM style at
    1280px, with no source change. In it, the "Not installed" chip **overlaps** the "Claude Code"
    title. The title box is 56px tall, so it wraps to 2 lines.
- Cause: in `provider-panel.component.ts`, the header is `flex flex-wrap justify-between`. The
  heading is `flex-1 min-w-0`, so it shrinks instead of letting the status chip and "How to install"
  wrap to their own line.
- Fix: give the heading a floor so the chip and button wrap below it, for example
  `basis-[14rem]` / `min-w-[14rem]` on the heading host. Another option is to move "How to install"
  out of the header, beside the "No claude command was found." row. Fix this before a third card is
  added, because 3 columns at 1280 (about 366px per card) is the target layout.

### Medium

**F3. The detail cards are not equal height.**
- Measured heights:
  - 1600px: Claude 206px, Codex 246px.
  - 1280px: 206px and 266px.
  - 1024px: 291px and 306px.
- Evidence: `dark-1280-panels.png`.
- The radio cards are equal (90px each).
- Cause: the page grid is `items-start`.
- If equal heights are wanted, use `items-stretch`, make the `ptah-provider-panel` host `h-full`,
  and add `h-full` to the inner `<section>`.

**F4. There is no visible space for a third card at 1600 or 1280.**
- Cause: `CONNECTION_GRID_CLASS` uses `repeat(auto-fit, minmax(min(100%,20rem),1fr))`. `auto-fit`
  collapses the empty tracks, so the two cards stretch across the full row.
- Measured:
  - 1600px: `gridTemplateColumns` is `694px 694px 0px 0px`.
  - 1280px: `553px 553px 0px`.
- Evidence: `dark-1600-top.png` and `dark-1280-top.png`.
- When a third descriptor is added, it will take a column. Today, though, nothing shows that a
  third slot exists. At 1600 the grid would also allow 4 columns.
- Options:
  - Keep it. This is a valid product choice: no empty slot is shown.
  - Use `auto-fill`. Empty slots stay, but you get 4 slots at 1600.
  - Use an explicit `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` with the 20rem floor. This caps the
    grid at 3 columns.

  Decide together with F2.

### Low

- **L1.** On load, the h1 shows a white rectangular outline (`dark-1600-top.png`,
  `00-initial.png`). The shell's `focusHeading()` focuses it programmatically, and a global focus
  style beats `outline-none`. This is probably pre-existing and outside this diff, but the new
  title makes it more visible.
- **L2.** In `ptah-glass-light`, the "Not your main connection" badge border (`border-base-300`) is
  almost invisible (`ptah-glass-light-1280-top.png`). This is an existing style, now in the shared
  heading component.
- **L3.** The step strip still reads "1 Claude Code / Needs install", the chosen provider's name.
  This is consistent with the design, so no change is needed.

### Passed checks

- 760px: no horizontal scroll. The document `scrollWidth` equals `clientWidth` (784), no element
  extends past the viewport, and the cards stack in one column (`dark-760-top.png`,
  `dark-760-panels.png`).
- The modal at 760px fits in 672px with no inner horizontal overflow (`modal-dark-760-open.png`).
- Modal accessibility, live:
  - The dialog is named by `aria-labelledby="install-claude-cli-title"` ("Install Claude Code").
  - Initial focus is on the active tab.
  - ArrowRight moves to "Windows".
  - Tab stays inside the dialog.
  - Esc closes it, and focus returns to `ready-install-open` with a visible 2px ring
    (`modal-dark-1280-after-esc.png`).
  - The Close button also returns focus.
- Modal contrast:
  - Dark: body text is about L 0.96 and muted text L 0.90, on a dark glass panel.
  - Light: text is L 0.24 and muted text L 0.40 (ptah-glass-light) or L 0.49 (anubis-light), on a
    light panel. Both read clearly (`modal-ptah-glass-light-1280-open.png`).
- Focus ring: a 2px solid outline in base-content color plus a 5px dark halo on tabs. Buttons get a
  2px outline (`modal-dark-1280-focus-tab.png`).
- Themes checked: `ptah-glass` (default), `ptah-glass-light` and `anubis-light`, set at runtime
  through `data-theme`.

## Code review notes

- **Signals and OnPush:** good overall. Every new component is OnPush and uses `input()`,
  `output()`, `computed()` and `signal()`. `panels` is a `computed` over the readiness signals, and
  `mountReading` derives from it.
  - `ConnectionChoiceComponent.roleOf(id)` is a method that the template calls on each change
    detection. It is cheap, but a `computed` map keyed by id would match the rest of the file
    (low).
- **Input names:** `ConnectionOptionHeadingComponent` has an input named `role`, which shadows the
  ARIA `role` attribute name. A static `role="..."` written by a later user would set both the
  input and the host's ARIA role. Rename it, for example to `connectionRole` (low).
- **List-driven descriptors:** clean.
  - The remaining per-provider spots are `readinessOf` (a typed `Record<ProviderKind, ...>`, so a
    missing entry fails at compile time) and the provider-specific sign-in help in
    `provider-panel.component.ts`. That help still branches on `view().provider === 'claude-cli'`,
    which is expected.
  - `connectionOption()` throws for an unknown id. That is acceptable because `ProviderKind` is
    closed.
- **Behaviour change:** `installVisible` now hides "How to install" when `source === 'bundled'` for
  Claude Code too. Before, the Claude install block ignored `source`. This is harmless if Claude is
  never bundled; it is worth noting in the PR.
- **Template bindings:** both bindings work at runtime.
  - The static `class` merges with `[class]="gridClass"` (measured grid columns).
  - The arbitrary-value binding `[class.max-w-[1440px]]` gives a 1440px column at 1600.
- **Modal and radio group accessibility:**
  - The modal reuses `NativeModalComponent` correctly: native `showModal()`, a Tab trap, `cancel`
    for Esc, and focus return. The trigger has `aria-haspopup="dialog"`. Re-check closes the dialog
    before it emits, so focus never fights the inert backdrop.
  - The only modal defect is F1.
  - The radio group is labelled by the `sr-only` legend. `aria-describedby` is bound only for
    `other`. The radio inputs are native.
  - The role badge text ("Main connection") is part of each radio's accessible name. This is
    slightly redundant with the legend, but acceptable.
- **Dead code:** none found. `CommandCopyRowComponent`, `NgTemplateOutlet`, `docsUrl`,
  `codexDocsUrl` and `icons.externalLink` are all still used by the sign-in help in the panel.
  `name` and `commandName` are now thin proxies of `option()`, which is fine.
- **Specs:** they pass, but they cannot catch F1 or F2, which depend on CSS and layout. Refresh the
  e2e visual baselines (`onboarding-ready-visual`) after the fixes, as the batch report already
  says.

## Screenshot index (`.ptah/tmp/onb-screens/`)

- **Initial state:** `00-initial.png`.
- **Dark theme, per width:** `dark-{1600,1280,1024,760}-top.png` and
  `dark-{1600,1280,1024,760}-panels.png`.
- **Runtime-only 3-column preview at 1280:** `sim-1280-three-columns.png`.
- **Modal, dark:**
  - `modal-dark-1280-open.png`
  - `modal-dark-1280-focus-tab.png`
  - `modal-dark-1280-focus-later.png`
  - `modal-dark-1280-windows-tab.png`
  - `modal-dark-1280-after-esc.png`
  - `modal-dark-760-open.png`
- **Light themes:**
  - `ptah-glass-light-{1280,760}-top.png`
  - `anubis-light-{1280,760}-top.png`
  - `modal-ptah-glass-light-1280-open.png`
  - `modal-anubis-light-1280-open.png`
