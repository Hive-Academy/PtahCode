# Form controls family research

Scope: `apps/ptah-extension-webview/src` and `libs/frontend/**`. Template HTML and inline TypeScript templates. Specs, stories and `libs/frontend/webview-e2e-harness` are excluded. The count script is `.ptah/specs/TASK_2026_940_eef5/form-controls-census.py`.

## Census

Method: `python -I .ptah/specs/TASK_2026_940_eef5/form-controls-census.py [totals|recipes|a11y|ui|excl|pages]`. The script reads `git ls-files` (1,566 `.html` and `.ts` files). It blanks TypeScript comments, because doc comments name `<select>` in prose. A quote-aware regex reads each `<input`, `<textarea` and `<select` tag, including tags that span lines. It reads the static `class` attribute only. `[class]`, `[ngClass]` and `[class.x]` are not evaluated (36 controls use them). A constant such as `${FOCUS_RING}` stays a literal token. Counts are static source occurrences, not rendered repetitions. The older inventory counts more selects (67) because its search also matched doc comments. The older name-gap figures (38 and 24) used a wider rule.

**316 raw elements:** 237 `input`, 27 `textarea`, 52 `select`.

| Input type | Count | | Input type | Count |
|---|---:|---|---|---:|
| text | 72 | | number | 14 |
| checkbox | 71 | | password | 8 |
| radio | 23 | | date | 4 |
| search | 16 | | url | 4 |
| text (no `type`) | 13 | | range | 1 |
| dynamic `[type]` | 11 | | file, hidden, email | 0 |

By lib group (input / textarea / select / total): `chat-settings` 78/1/17/96; `chat` 16/3/6/25; `chat-ui` 20/2/1/23; `review-runs-ui` 14/2/7/23; `tasks-ui` 14/1/6/21; `memory-curator-ui` 17/1/1/19; `marketplace` 17/0/0/17; `git-ui` 9/2/3/14; `harness-builder` 7/2/1/10; `ui` 7/0/3/10; `onboarding` 3/5/1/9; `app` 5/1/2/8 (all in the gallery); `declarative-dashboard` 5/1/1/7. Ten more groups have 1 to 6 each. `chat-settings` holds 30 % of all controls.

Toggles, checkboxes and radios (by class): `toggle` 17, `checkbox` 41, `checkbox` with no class 13, `radio` 17, `radio` with no class 6. Custom switches: `role="switch"` 5, `ptah-toggle` 0, `role="checkbox"`/`"radio"` 14, `role="radiogroup"` 11, `aria-checked` 19.

Sizes (class token on the element): `input-xs` 22, `input-sm` 77, `select-xs` 8, `select-sm` 25, `textarea-xs` 3, `textarea-sm` 5, `toggle-xs` 6, `toggle-sm` 8, `checkbox-xs` 28, `checkbox-sm` 11, `radio-xs` 8, `radio-sm` 8. No `-md` and no `-lg` class exists. Variants: `input-bordered` 104, `select-bordered` 32, `textarea-bordered` 22, `toggle-primary` 12, `checkbox-primary` 18, `input-info` 1. `input-ghost`, `input-error`, `input-warning` and `input-primary` count 0. Text-like controls (input, select, textarea, 222, with the range input): size `sm` 107, `xs` 33, no size 82.

States: `disabled` 80, `readonly` 9, `required` 5, `aria-invalid` 31 (23 files), `aria-describedby` 53, `[class.input-error]` binding 4 (plus 5 `[class]`/`[ngClass]` with error), `ngModel` 19, `[value]` 183, `[checked]` 85.

Label patterns (first match wins, 316 controls): `aria-label` 136; wrapping `<label>` 100 (157 wrapped in total, because 57 also have an `aria-label`); `id` plus `for` 61 (dynamic ids count if the file has any `for` label, so this is an upper bound); `aria-labelledby` 13; `ptahFieldControl` shell 3; placeholder only 2; none 1. Only 5 wrapping labels use `label-text`. Floating labels: 0. **Controls with no accessible name: 3** (`libs/frontend/chat/src/lib/settings/ptah-ai/lane-guards-settings.component.ts:115`, `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:270`, `libs/frontend/chat-ui/src/lib/molecules/question-card.component.ts:202`). Name quality is not checked: an `aria-label` can be a duplicate or poor text. Helper or error text: 117 controls have muted text within 500 characters after them, 22 have `text-error` or `text-warning` text, and 1 uses `label-text-alt` (approximate, text distance only). `ptah-field` has 3 uses, all in the gallery.

## Recipes

Sorted classes after removal of layout classes (`w-`, `flex-`, `mt-`, `mb-`, `ml-`, `mr-`, `gap-`, `col-`, `order-`, `min-w-`, `max-w-`, `self-`, `justify-`, `items-`, `shrink`, `grow`, `flex`). **129 distinct recipes** for 316 elements, counted for each element kind and recipe pair: text input 29, search 10, number 7, no-type input 6, dynamic-type input 6, password 5, date 2, url 2, range 1, select 16, textarea 19, checkbox with class 9, checkbox with no class 1, toggle 8, radio with class 6, radio with no class 2. 121 elements (38 %) use only core DaisyUI classes. 85 inputs, 17 selects and 20 textareas add extra look classes.

| Count | Element and recipe | Two examples (`file:line`) |
|---:|---|---|
|24|input, no class|`apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.component.ts:65`; `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:190`|
|16|input `input input-bordered input-sm`|`libs/frontend/chat/src/lib/settings/ptah-ai/local-stt-panel.component.ts:146`; `libs/frontend/chat/src/lib/settings/ptah-ai/local-tts-panel.component.ts:141`|
|13|input `input input-bordered`|`libs/frontend/chat/src/lib/components/organisms/session-inspector/inspector-session-actions.component.html:67`; `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts:194`|
|12|input `font-mono input input-bordered input-sm text-xs`|`libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts:343`; `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:259`|
|9|input `bg-base-100 border-base-content-muted focus-visible:outline* input input-bordered input-sm min-h-9 text-base-content`|`libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:440`; `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:672`|
|5|input `focus-visible:outline-[oklch(var(--s))] input input-bordered input-xs`|`libs/frontend/git-ui/src/lib/review-canvas/comparison-bar.component.ts:189`; `libs/frontend/git-ui/src/lib/review-canvas/file-diff-section.component.ts:298`|
|16|select, no class|`apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.component.ts:68`; `apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.component.ts:109`|
|13|select `select select-bordered select-sm`|`libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:158`; `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts:179`|
|5|select `select select-bordered select-xs`|`libs/frontend/git-ui/src/lib/review-canvas/comparison-bar.component.ts:148`; `libs/frontend/git-ui/src/lib/review-canvas/comparison-bar.component.ts:166`|
|4|textarea `textarea textarea-bordered`|`libs/frontend/onboarding/src/lib/proposal/answer-dock.component.ts:35`; `libs/frontend/onboarding/src/lib/proposal/new-project-intake.page.ts:219`|
|2|textarea `font-mono textarea textarea-bordered textarea-sm`|`libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts:379`; `libs/frontend/messaging-gateway-ui/src/lib/components/allow-list-editor.component.ts:24`|
|17|checkbox `checkbox checkbox-primary checkbox-xs`|`libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.ts:393`; `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts:373`|
|10|checkbox `checkbox checkbox-sm`|`libs/frontend/chat/src/lib/components/molecules/confirmation-dialog.component.ts:58`; `libs/frontend/declarative-dashboard/src/lib/components/surface-checkbox-input.component.ts:42`|
|8|checkbox `checkbox checkbox-xs`|`libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:192`; `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:210`|
|13|checkbox, no class|`libs/frontend/chat-ui/src/lib/atoms/theme-toggle.component.ts:310`; `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts:154`|
|4|toggle `focus-visible:outline* toggle toggle-primary toggle-sm`|`libs/frontend/chat/src/lib/settings/ptah-ai/go-vet-consent-config.component.ts:181`; `libs/frontend/marketplace/src/lib/ui/capability-toggle.component.ts:202`|
|3|toggle `toggle toggle-primary toggle-sm`|`libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts:522`; `libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts:423`|
|3|toggle `toggle toggle-xs`|`libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:243`; `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts:255`|
|8|radio `radio radio-sm`|`libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:456`; `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts:493`|
|4|radio `radio radio-xs`|`libs/frontend/chat-ui/src/lib/atoms/motion-preference.component.ts:16`; `libs/frontend/chat/src/lib/settings/output-style/output-style-editor.component.ts:293`|

Class-less selects: 16 (the class comes from a directive or no class is set). Class-less radios: 6 (3 `peer sr-only` card radios in `theme-toggle` and `motion-style-picker`, 3 plain).

Own-size overrides: 38 text-like controls set `h-*` or `min-h-*` (`h-8` 15, `min-h-8` 11, `min-h-9` 9, `h-9` 4. Counts are tokens, and one control can have two). 38 controls have `focus-visible:outline*` classes. 34 use `font-mono`. 20 use `bg-surface-0`.

## Current owner

`libs/frontend/ui/src/lib/surfaces/field.component.ts` (`ptah-field`): required `label`, optional `hint` and `error`. It sets `for`, `id`, `aria-describedby` and `aria-invalid` on the marked control. `field-control.directive.ts` (`ptahFieldControl`) adds `<tag> <tag>-sm border-surface-border text-sm`. Uses: `ptah-field` 3 and `ptahFieldControl` 14 outside the lib (8 in the gallery, 6 in `review-runs-ui`). **No raw recipe equals this output (0 matches).**

Other owners in the lib:

- `extracted/settings-field` (`div[ptahSettingsField]`): label, hint and error shell. 2 uses outside the lib.
- `extracted/setup-field` (`select[ptahSetupField]`): `select select-bordered select-sm` with optional `w-full`. 2 uses outside the lib. 13 raw selects have exactly this recipe.
- `native/dropdown` (`ptah-native-dropdown`, 6 uses), `native/option` (3), `native/autocomplete` (0 outside, used inside two pickers), `native/provider-model-picker` (4), `provider-model-search-field` (3), `native/peer-session-picker` (1), `native/form/json-schema-form` (1, holds 5 raw controls).
- `overlays/` and `selection/` (`ptah-dropdown`, `ptah-autocomplete`, `ptah-option`, `[autocompleteInput]`): 0 uses outside the lib.
- Missing: toggle, checkbox, radio, select component, input and textarea directive, search and secret input, tooltip-free helper pattern. `ptah-toolbar` has 1 use.

## Zero-pixel candidates

Global CSS sets `--input-height: 32px` as `min-height` for `.input` and `.textarea` (`apps/ptah-extension-webview/src/styles.css:2158`). That equals `--ptah-control-h-sm` (2rem). DaisyUI sizes xs (1.5rem) and sm (2rem) equal `--ptah-control-h-xs` and `--ptah-control-h-sm`. The unsized DaisyUI input is 3rem and does not equal `--ptah-control-h-md` (2.5rem). Confirm in the Electron browser before you rely on this.

**99 elements use only core classes with an xs or sm size:** input 20 (`input-sm` 16, `input-xs` 4), select 18, checkbox 36, radio 15, toggle 10. These are class-equality candidates, not DOM or pixel proof. **22 core-only elements have no size** (input 13, textarea 4, toggle 2, select 1, checkbox 1, radio 1). They need a look decision (3rem or 2.5rem). Colors use theme variables and `--ptah-control-edge` (not yet used by inputs). The 85 inputs with extra classes need look approval first. The 64 controls with own height, background, radius, border or focus classes differ from the token look.

## Exclusions

| Exclusion | Count | Reason |
|---|---:|---|
| Composer-style textareas (`chat-input`, `lane-composer`, `commit-composer`, `remote-composer`, `reply-composer`) | 5 | Chat composer (`libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:293`) keeps its look (user decision U2). Review the other four one by one. |
| `contenteditable` | 22 mentions in 13 files, mostly canvas | Not a form control. Handlers and attributes, not editors. |
| Code editor (CodeMirror in `libs/frontend/git-ui/src/lib/spot-editor`) | 8 mentions | Own library. |
| Terminal (xterm text) | 3 mentions, 0 elements | Text only, no element. |
| `input type="range"` | 1 (`libs/frontend/chat/src/lib/settings/ptah-ai/web-search-config.component.ts:286`) | No recipe. |
| `file` and `hidden` inputs | 0 | None exist. |
| Radios with `peer sr-only` (card pickers) | 3 | Visual state belongs to the card. |
| JSON schema form | 5 controls | Generated forms. Adopt after the owners exist. |

## Proposed API

Keep native DOM and DaisyUI classes at first. Evolve what exists. Do not rebuild `ptah-field`.

- **`ptah-field`** (evolve): keep `label` (required), `hint`, `error`. Add `density = input<'default'|'compact'>('default')`, `state = input<'idle'|'pending'|'saved'|'error'>('idle')`, slots `[ptahFieldPrefix]` and `[ptahFieldSuffix]`. Allow `ptahInput`, `ptahTextarea`, `ptahSelect`, `ptahCheckbox` and `ptahToggle` as the marked control.
- **`input[ptahInput], textarea[ptahTextarea]`** (replace `ptahFieldControl` look): `size = input<'xs'|'sm'|'md'>('sm')`, `invalid = input(false)` (sets `aria-invalid` and the error class), `mono = input(false)`. Host classes map to `input input-bordered input-<size>`. Keep native `value` and `(input)`. Add `ariaLabel` fallback when no field wraps it.
- **`ptah-search-input`** and **`ptah-secret-input`**: icon, clear button, reveal button. Search inputs (16) and password inputs (8) use them.
- **`select[ptahSelect]`** (extend `ptahSetupField`): same size input. Keep native `<select>` through the component step (step 2). Replace with the combobox only after the behavior-parity gate. Reuse `ptah-native-dropdown` and `ptah-native-autocomplete` for menus and combobox.
- **`input[ptahCheckbox]`, `input[ptahToggle]`, `input[ptahRadio]`**: `size = input<'xs'|'sm'>('sm')`, `label = input.required<string>()` (sets `aria-label` when no visible label), `tone = input<'primary'|'neutral'>('primary')`. Switch role for toggle. A component `ptah-radio-group` (`value`, `label`, `orientation`) is optional.

## Reference pages

Five Electron look-sheet pages (dark and light). Counts are inside the named file.

| Page | Controls today | Roles |
|---|---|---|
| `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts` | custom-look text 5, dynamic-type 4, `radio radio-sm` 7 | text, secret, radio |
| `libs/frontend/chat/src/lib/components/molecules/session-filter-bar/session-filter-bar.component.ts` | custom-look text 2, select 2, `checkbox checkbox-xs` 2, `toggle toggle-xs` 2 | compact filter row, all four kinds |
| `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.html` | `input input-bordered` 6 (number 4), `toggle toggle-warning` 1 | unsized input, number, tone toggle |
| `libs/frontend/cron-scheduler-ui/src/lib/components/cron-scheduler-tab.component.ts` | `input input-bordered input-sm` 3, textarea mono 1, select 1, `toggle toggle-primary toggle-sm` 1 | core recipes, textarea |
| `libs/frontend/chat/src/lib/components/molecules/session-organization-editor/session-organization-editor.component.ts` | `select select-bordered select-sm` 4, mono text 1, url 1, `toggle toggle-sm` 1 | select, url, toggle |

Adopt the checkbox look in `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/plugin-catalog-panel.component.ts` as a sixth page if the group needs it.

## Risks and open questions

1. **Unsized `input input-bordered` (13 inputs, 4 textareas) is 3rem tall.** Recommendation: choose `sm` as the default and show the delta in the look sheet.
2. **Native `<select>` cannot have the same DOM as a combobox.** Recommendation: keep `<select>` first with `ptahSelect`. Use behavior parity for the combobox step.
3. **Custom look classes (85 inputs, 64 with own height, focus or surface).** Recommendation: fold into three tones (default, mono, compact) after look approval. Keep `pl-8`, `pr-9` and width classes at the consumer.
4. **Floating label and label-text.** No floating label exists and only 5 `label-text` uses exist. Recommendation: no floating label in step 1. Use `ptah-field` label text above the control.
5. **Settings owns 96 controls (30 %).** Recommendation: do the Settings adoption in the Settings extraction batches. Let the owners accept `ptahSettingsField` as a shell.
Note (not a user decision): **Name coverage is high (3 controls without a name) but name quality is unknown.** Recommendation: add a ratchet rule that requires `aria-label` or a field label on each new control.

## Named exception: radios (decision of the coordinator)

Radios (23 tokens in the baseline) are out of scope for family 2. There is no `ptahRadio` owner. They stay raw as a named exception.
