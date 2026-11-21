# Phase 2 CI fix report: `ui-class-audit` (PR #1449)

Result: `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` exits 0.
Both rules show 0 token counts over baseline. No baseline file changed. `--update-baseline` did not run.

Paths below are relative to `libs/frontend/chat/src/lib/settings/` unless a full path is given.

## Rule `raw-spacing`

### 1. Glass card block padding (9 files)

| | Class |
| --- | --- |
| Before | `class="[[data-glass=on]_&>section]:py-0"` on each `ptah-form-section` host |
| After | `flushInGlass` input on `ptah-form-section` |

Shared mechanism: a new boolean input `flushInGlass` on `PtahFormSectionComponent`
(`libs/frontend/ui/src/lib/patterns/form-section/form-section.component.ts`).
When it is true, the inner `<section>` gets the class `[[data-glass=on]_&]:py-0`.

Files that now use `flushInGlass`:

- `advanced-settings.component.ts`
- `advanced/codex-sandbox-setting.component.ts`
- `license/license-status-card.component.ts`
- `output-style/output-style-config.component.ts`
- `pro-features/agent-behaviour-section.component.ts`
- `pro-features/claude-builtins-config.component.ts`
- `pro-features/mcp-port-config.component.ts`
- `pro-features/vscode-lm-config.component.ts`
- `settings.component.html`
- `advanced/advanced-settings-group.component.ts` (`[flushInGlass]="contentSurface()"`, see rule `daisyui-class`)

The class `[[data-glass=on]_&>section]:[border-bottom:0]` stays on the three hosts that had it.
The audit does not block it.

Why the rendering is the same:

- Before, the rule was `[data-glass=on] .host > section { padding-block: 0 }`, specificity (0,2,1).
- After, the rule is `[data-glass=on] .section-class { padding-block: 0 }`, specificity (0,2,0).
- Both are stronger than the base `py-[var(--ptah-gap-group)]`, specificity (0,1,0).
- The target element is the same `<section>`. The condition is the same `data-glass="on"` ancestor.
- With glass off, the token padding stays, as before.

### 2. Numeric spacing

| File | Before | After |
| --- | --- | --- |
| `output-style/output-style-editor.component.ts` (3) | `p-3` | `p-[var(--ptah-space-3)]` |
| `pro-features/system-prompt-drawer.component.ts` (3) | `p-3` | `p-[var(--ptah-space-3)]` |
| `pro-features/system-prompt-drawer.component.ts` | `px-5` | `px-[calc(var(--ptah-space-4)_+_var(--ptah-space-1))]` |
| `pro-features/system-prompt-drawer.component.ts` | `py-3` | `py-[var(--ptah-space-3)]` |
| `pro-features/claude-builtins-config.component.ts` | `pl-7 pr-7` | `pl-[calc(var(--ptah-space-6)_+_var(--ptah-space-1))] pr-[calc(var(--ptah-space-6)_+_var(--ptah-space-1))]` |

Why the rendering is the same: `--ptah-space-3` is 0.75rem (`p-3`, `py-3`).
`--ptah-space-4` + `--ptah-space-1` is 1.25rem (`px-5`). `--ptah-space-6` + `--ptah-space-1` is 1.75rem (`pl-7`, `pr-7`).
No `--ptah-space-5` or `--ptah-space-7` token exists, thus `calc()` of two tokens gives the value.
Each class keeps its utility (`p`, `px`, `py`, `pl`, `pr`), thus the CSS order against the `ptahInput` padding does not change.

### 3. `ml-auto`

`pro-features/claude-builtins-group.component.ts` (meta text in the disclosure button):

- Before: `ml-auto shrink-0 ...`
- After: `flex-1 shrink-0 whitespace-nowrap text-right ...`
- Same rendering: the text is the last flex item. It now takes the free width and aligns its text to the right.
  `whitespace-nowrap` and `shrink-0` keep the text on one line, thus the wrap point of the row does not change.

`pro-features/claude-builtins-config.component.ts` (filter in the summary bar):

- Before: `<div class="relative ml-auto flex min-w-40 max-w-64 flex-1 items-center">`
- After: `<div class="flex min-w-40 flex-1 justify-end">` around `<div class="relative flex w-full max-w-64 items-center">`
- Same rendering: the wrapper has the same flex values and the same minimum (10rem), thus the bar wraps at the same width.
  The filter fills the wrapper to a maximum of 16rem and stays at the right end.
- Cost: one more `div` in the DOM.

## Rule `daisyui-class` (`<dynamic>`)

None of the three expressions had a DaisyUI class. Each one was an expression that the audit cannot prove safe.

| File | Before | After |
| --- | --- | --- |
| `advanced/advanced-settings-group.component.ts` | `[class]="contentSurface() ? flushInCard : ''"` | `[flushInGlass]="contentSurface()"`. The constant `FLUSH_IN_GLASS_CARD` and the field `flushInCard` are deleted. |
| `license/license-status-card.component.ts` | `[class]="'size-3 shrink-0 ' + membershipState().iconClass"` | `class="size-3 shrink-0"` plus `[class.text-warning]`, `[class.text-success]`, `[class.text-base-content-muted]` keyed on `membershipState().tone`. The `iconClass` field is deleted. |
| `pro-features/claude-builtins-group.component.ts` | `[class]="thumbClass()"` | Static `class` with the thumb base classes plus `[class.translate-x-3]`, `[class.translate-x-1.5]`, `[class.bg-primary-content]`, `[class.bg-base-content/70]` keyed on `switchState()`. `THUMB_CLASS` and `thumbClass` are deleted. |

Why the rendering is the same: each state gives the same class set as before.
`tone` maps one to one to the old `iconClass` (`warn`, `ok`, `neutral`).
New spec assertions prove the class set of each switch state and of the warning icon.

## Spec changes

- `libs/frontend/ui/src/lib/patterns/form-section/form-section.component.spec.ts`: new test for `flushInGlass`.
- `advanced/advanced-settings-group.component.spec.ts`: the flush class is now read on the inner `<section>`.
- `pro-features/claude-builtins-config.component.spec.ts`: same change.
- `pro-features/claude-builtins-group.component.spec.ts`: thumb class assertions for `on`, `mixed`, `off`.
- `license/license-status-card.component.spec.ts`: state icon class assertions.

## Audit output summary

```
ui-class-audit: TOTAL 874 blocked token(s) across 216 file(s); 0 token count(s) over baseline
ui-class-audit [raw-spacing]: TOTAL 605 blocked token(s) across 39 file(s); 0 token count(s) over baseline
```

The audit also reports 4 decreases that this change did not make (`codex-sandbox-setting` `mt-0.5` and `pb-2`, `local-stt-panel` `gap-1`, `local-tts-panel` `gap-1`).
A decrease passes. The baseline does not record them yet.

## Checks

| Command | Exit code | Result |
| --- | --- | --- |
| `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts` | 0 | 0 over baseline, both rules |
| `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath <13 specs>` | 0 | 13 suites, 440 tests passed |
| `npx jest --config libs/frontend/ui/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/ui/src/lib/patterns/form-section/form-section.component.spec.ts` | 0 | 24 tests passed |
| `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` | 0 | no errors |
| `npx tsc --noEmit --project libs/frontend/ui/tsconfig.lib.json` | 0 | no errors |
| `npx eslint <19 changed files in libs/>` | 0 | 0 errors |

The 13 chat specs: `advanced-settings`, `advanced/advanced-settings-group`, `advanced/codex-sandbox-setting`,
`license/license-status-card`, `output-style/output-style-config`, `output-style/output-style-editor`,
`pro-features/agent-behaviour-section`, `pro-features/claude-builtins-config`, `pro-features/claude-builtins-group`,
`pro-features/mcp-port-config`, `pro-features/system-prompt-drawer`, `pro-features/vscode-lm-config`, `settings`.

Logs are in `.ptah/tmp/` (`audit2.log`, `jest-chat.log`, `jest-ui.log`, `tsc-chat.log`, `tsc-ui.log`, `eslint.log`).

## Not done

- No render in Electron and no screenshot. The task permits no build or serve target. The rendering statements above come from CSS analysis and class assertions, not from a visual check.
- `typecheck-templates` (`ngc --noEmit`) did not run. It is an `nx` target. The coordinator must run it because templates changed and a new input is in use.
- The first `eslint` run found 4 errors (`no-duplicate-attributes`: static `class` with `[class]`). The fix was the `[class.x]` bindings. The second run exits 0.
- `eslint` reports the `max-lines` warning for `claude-builtins-config.component.ts` (726 lines, limit 700). The file was above the limit before this change. This change adds 4 lines.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| `flushInGlass` input on `ptah-form-section` | (a) arbitrary property `[padding-block:0]` on each host, (b) a `--ptah-*` token, (c) an input | (a) passes the audit only because the audit does not read arbitrary properties, and it cannot replace the dynamic `[class]` of `advanced-settings-group`. (c) removes 10 class copies and the `<dynamic>` count with one mechanism in the pattern component. | Yes |
| Layout change, not `[margin-left:auto]`, for `ml-auto` | arbitrary property, or layout | The settings rule requires that spacing comes from patterns or tokens. An arbitrary property hides raw spacing from the audit. | Yes |
| `calc()` of two tokens for 1.25rem and 1.75rem | new tokens, or `calc()` | `ptah-tokens.css` has no step 5 or step 7. The task scope does not include the token file. | Yes |

## Other change in the worktree

`.ptah/specs/TASK_2026_2285_304a/decisions.md` has one new line (row 46) that this lane did not write. This lane did not touch the file.
