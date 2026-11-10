# Batch 01 review: Settings field shell

Verdict: APPROVE (no blocker). Two should-fix items on test coverage, two notes.

## DOM equality (check 1)
Compared removed markup with the shared template, per adopter.
- Order is the same: label, control, readable note (before hint), hint, error, stored notice.
- Label: same tag, class, `for`. Hint `<p>`: same `id` (`<id>-help`) and class
  `text-xs text-base-content-muted`. Whitespace: ` {{ hint() }} ` collapses to the same text.
- Error `<p>`: the ORIGINAL had no `class` in both adopters, so no class was lost.
  Lane guards keeps `role="alert"` (`errorRole`), session budget gets no `role` (null removes it).
  `id`, `data-testid` are kept.
- Host `<div>` keeps the static class list. The marker attribute is removed by the host binding.
- Differences found: none in the rendered DOM. One text composition change: the hint is now one
  string input (`field.help + ' Range: ' ...`), which gives the same text.

## Findings
1. should-fix: inline snapshots cover the default state only.
   `lane-guards-settings.component.spec.ts:77-86`, `session-budget-settings.component.spec.ts:134-153`.
   Not covered: the error state (`<id>-error` paragraph, `input-error` class, `aria-invalid`,
   `aria-describedby` with two ids), the stored-value notice (`<id>-stored`,
   `settingsFieldAfterError` slot), and the unit-less row without a readable note.
   The readable note IS covered (rows tokens and fallbackWeightedTokens show it).
   Fix: add one snapshot per adopter in an error state. Add one for a stored-value notice.
   The snapshots cannot prove the pre-change DOM by themselves: confirm they were captured on
   the original code (for example with `git stash`-free checkout of `HEAD` in a temp worktree).
2. should-fix: `settings-field.component.spec.ts` (44 lines, one `it`) has no test for
   `errorRole` null, the two optional slots, and the marker attribute removal.
   Fix: add short tests for these three points.
3. note: `host: { '[attr.ptahSettingsField]': 'null' }`
   (`settings-field.component.ts:9`) is correct. Angular runs the binding on the first
   change detection and calls `removeAttribute`. There is a very short time where the attribute
   exists. No visual effect. Add a one-line comment to say why.
4. note: `ngProjectAs` on `<ng-container>` inside `@if`
   (`session-budget-settings.component.ts` ~L335, ~L342) is valid: the block has one root node
   and Angular honors `ngProjectAs`. The snapshot rows with the readable note prove it.
5. note: eslint-disable (`settings-field.component.ts:5`) is narrow (one line, one rule) and
   justified: the selector `div[ptahSettingsField]` is the established extracted-component
   pattern. The comment above it is a plain `//` comment, so ESLint takes the disable for the
   next line only. Good.

## Project rules (check 4)
- Standalone, OnPush, `input()` / `input.required()` only: pass.
- No `any`, `@ts-ignore`, `as unknown as`, `console.*` in changed source: pass
  (the spec casts `row as Element` after a null check: acceptable).
- Chat imports `SettingsFieldComponent` from `@ptah-extension/ui` only: pass.
  `libs/frontend/ui/src/index.ts` is unchanged (git status clean): pass.
  The new export is in `extracted/index.ts`, which the root index already re-exports.
- Tokens: only existing Tailwind/DaisyUI semantic classes are moved: pass.
- State and validation stay in the feature components: pass.

## Behavior (check 5)
- `(input)`, `(change)`, `[ptahBusyDisabled]`, `aria-invalid`, `aria-describedby` are inside the
  projected control and unchanged.
- Error input: lane guards `fieldMessage(key)` returns `string | null`.
  Session budget `errors()[key] ?? null`. Both truthy-checked in the shell as before.
- No regression found by reading. Run the full spec files to confirm.

## Out of scope in the diff
Spec files also contain Prettier reformatting of unrelated lines
(`data-glass-surface` expectations, a removed blank line, an `expect.stringContaining` wrap).
note: harmless, but it enlarges the diff. Revert if you want a minimal PR.
