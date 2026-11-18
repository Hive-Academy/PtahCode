# Lane brief — move long Settings hints into the ptah-field info popover

Worktree (work only here): `D:\projects\ptah-extension\.claude-worktrees\fix-settings-field-info-hints-ca36b7999aeb`
Deliverable: `.ptah/specs/TASK_2026_2278_5790/lane-report.md` (files changed, checks run with results, open points).

## User decision

Long help text below an input goes behind an info icon at the END of the input and shows as a
popover. A hint of one short line stays below the field. The API exists:
`<ptah-field label=".." hint="short" info="long text">` (`libs/frontend/ui/src/lib/surfaces/field.component.ts`).
It adds a trailing button "More about <label>", a popover, an sr-only copy of the info text and
adds that id to the control's `aria-describedby`. The reference use is the Context budgets fields
in `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts` (around
line 300-360): `[hint]="rangeHint(setting)" [info]="helpText(setting)"`, input `ptahInput` with
class `tabular-nums` (no `size="sm"`, no `join-item`), unit span
`<span ptahFieldTrailing class="shrink-0 whitespace-nowrap pr-[var(--ptah-gap-heading)] text-xs text-base-content-muted" aria-hidden="true">`.

## Change 0 — `libs/frontend/ui/src/lib/surfaces/field.component.ts` (+ its spec)

Every id and data-testid must stay in the DOM. A text that moves into the popover keeps its id
and data-testid on the always-present sr-only info element. Add two optional inputs:

- `infoTextId = input<string | null>(null)`: when set, the sr-only `<span class="sr-only">` with
  the info text uses this id instead of the generated `ptah-field-info-<n>`. The control's
  `aria-describedby` must then reference this id (and never keep a stale generated or earlier
  custom id: filter the previously written id too).
- `infoTestId = input<string | null>(null)`: `data-testid` of that same sr-only span.
Keep `infoPanelId` and the popover trigger unchanged. Add spec cases: custom id + test id on the
span, `aria-describedby` holds the custom id and not the generated one, default still uses the
generated id.

## Changes (under `libs/frontend/chat/src/lib/settings/ptah-ai/`)

1. `lane-guards-settings.component.ts` (+ `lane-guards-settings.logic.ts` if the text moves there):
   - Field "Repeat-call stop at": `hint` becomes only `'Range: ' + field.min + ' or greater.'`.
   - `info` holds the long paragraph that is now in `<p id="lane-guards-intro" ...>` ("This guard
     stops a lane when it repeats the same call this many times. Lanes also have ... start a fresh
     lane for the remaining work."). Put that text in a constant (for example `info` on
     `LaneGuardField`) and delete the visible `<p id="lane-guards-intro">` paragraph. Pass
     `infoTextId="lane-guards-intro"` and `infoTestId="lane-guards-intro"` on that field, so the id
     and data-testid stay in the DOM on the sr-only info text. The unit spec keeps its
     `byTestId('lane-guards-intro')` text assertions (same strength) and also asserts that the
     input's `aria-describedby` contains `lane-guards-intro`. The `field.help` sentence is covered
     by the first sentence of the paragraph; do not show it twice.
   - The error branch `ptahFieldBeforeHint` span: show only `Range: {{ field.min }} or greater.`.
   - Keep the input `size="sm"` and classes (the spec asserts `input-sm`, `flex-1`).
2. `session-budget-settings.component.ts`:
   - Number fields (Token budget, Cost budget (USD), Fallback weighted tokens, Tighten at (%),
     Handoff at (%), Handoff after compactions, Tighten auto-compact window (tokens)):
     `[hint]="'Range: ' + range(field.key) + '.'"`, `[info]="field.help"`. The error branch
     `ptahFieldBeforeHint` span shows only `Range: {{ range(field.key) }}.`.
   - Make these fields look like Context budgets: input without `size="sm"` and without
     `join-item min-w-0 flex-1` (keep `tabular-nums`); unit span with the Context budgets classes
     above (render it only when `unitSuffix(field.key)` is not empty, if it can be empty).
   - "Budget unit" and "Token measure" (`ptah-field` around `ptah-select`): move the hint text to
     `info`, and set no `hint` (there is no range). Keep the sr-only `<p>` elements with ids
     `session-budget-unit-help`, `session-budget-token-measure-help`,
     `session-budget-token-measure-resolved` and all `aria-describedby` values unchanged.
   - Leave the toggles (`ptah-setting-row`) unchanged.
3. `local-stt-panel.component.ts`: "Whisper model" field: `hint="Downloads on first use."`,
   `info="Curated models download to ~/.ptah/models/ on first use."`. "Custom model id or folder"
   field: no `hint`, `info="Enter an owner/name repository or an absolute folder path."`.
4. `local-tts-panel.component.ts`: "Custom model id or folder" field: no `hint`,
   `info="Enter an owner/name repository or an absolute folder path."`.

Update the related specs (`*.component.spec.ts` beside each file) to the new structure. Do not
weaken assertions: when a spec read text from the removed paragraph or the old hint, assert the
same text in the `info` (for example the sr-only `[id^="ptah-field-info-"]` element, or the
trigger `button[aria-label="More about <label>"]` and the popover text after a click), and assert
the new short hint. Add one assertion per changed component that the info button exists.

## Rules

- A hint of one short line stays below the field; only long text moves into `info`.
- The other moved hints use generated ids today (no consumer id or data-testid), so they need no
  `infoTextId`. If you find a moved hint with its own id or data-testid, keep it the same way.
- Do not touch Providers files: `ptah-ai/cli-*`, `lanes-*`, `ptah-cli-*`, `agent-orchestration-*`,
  `providers/*`, `settings.component.html`.
- Keep every other id, data-testid and aria-label. Keep label text.
- Strict TypeScript: no `any`, no `as unknown as`, no `[innerHTML]`, no skipped tests.
- No raw spacing classes where a token exists. Do not add new utility classes beyond those listed.
- Angular: standalone, OnPush, signals, built-in control flow (already in place).
- Checks (only these, focused): 
  `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <changed specs>`,
  `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/surfaces/field.component.spec.ts`,
  `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json`,
  `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json`,
  `npx eslint <changed files>`.
  Do not run `npm run verify`, `nx`, build, serve, e2e or package targets.
- Never commit, push, merge, stash or reset. The coordinator commits.
- Electron is the priority host; this change is renderer-only.
