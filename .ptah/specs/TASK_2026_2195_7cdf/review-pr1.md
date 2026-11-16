# PR 1 review: `warning` tone for ptahButton

Read-only review of the uncommitted `git diff` in this worktree. All line numbers refer to the working tree.

## Findings

### F1 — Major (a11y): outline warning ink fails the repo contrast gate

`ptah-button.css:314-318` paints the outline text and border with `var(--ptah-btn-warning-bg)`, which is raw `oklch(var(--wa))` (`ptah-tokens.css:143`). The repo already measured raw `--wa` as text: 23 of 32 stock themes stayed under 4.5:1, the worst at 1.01:1 (`apps/ptah-extension-webview/src/styles.css:323-325`). The light theme proves the need: it overrides warning text with `--state-ink-need: #8d6700` (`styles.css:336`). So the resting outline text breaks WCAG 1.4.3, and the border breaks 1.4.11 (3:1), in light themes. Dark themes pass. Two structural gaps follow:

- The outline ink is hard-wired to the fill token. A theme cannot tune the outline text without changing the fill. The danger group avoided this by keeping tone off outline.
- The danger tone has a per-theme contrast spec (`apps/ptah-extension-webview/src/app/status-badge-contrast.spec.ts:173-232`). The warning tone has none.

Fix direction: give the outline a contrast-tuned warning ink, as the state-ink system does, and add a warning block to the contrast spec. The filled variant is safe: it keeps the `--wa`/`--wac` pair that the old `.btn-warning` used (`styles.css:3378`).

### F2 — Minor: busy spinner colour missing for outline warning

`ptah-button.css:429` themes the spinner for the filled warning. No rule exists for `.btn-outline[data-tone='warning'][aria-busy='true']::before`. The generic spinner keeps `--ptah-btn-secondary-fg` (`ptah-button.css:414`). A busy outline warning button shows a neutral spinner inside a warning border. `usage-evidence.md:219` requires loading behaviour for both variants. Add the rule with `border-color: var(--ptah-btn-warning-bg)`.

### F3 — Minor (docs): stale tone comment

`button.directive.ts:39` still says "Ghost variant ink only; other variants ignore tone." The warning tone now also paints primary and outline. Update the comment.

### F4 — Minor (spec gap): the ghost exclusion of warning is not pinned

If `ptah-button.css:269` regressed from `:is([data-tone='danger'], [data-tone='muted-danger'])` back to a bare `[data-tone]`, all five tests in `button-css.spec.ts` would still pass. The regressed selector holds no `[data-tone='warning']` literal, so tests 1 and 5 skip it and test 2 never sees it. Ghost plus warning would inherit the error-red hover again. Add an assertion that no ghost rule matches the warning tone.

## Checks that pass

- Disabled wins over the new rules. The filled rest rule (`ptah-button.css:295`) and the outline rest rule (`:314`) have specificity (1,4,0). The disabled rule (`:372`) is also (1,4,0) and comes later in the file, so it wins. The outline disabled rule (`:387`) is (1,5,0) and also wins.
- All four new hover and active rules carry the guard `:not(:disabled, [disabled], [aria-disabled='true'])` (`:302`, `:308`, `:320`, `:326`). A busy button also keeps its tone: `syncBusyAria` sets `aria-disabled`, and the disabled rule skips `[aria-busy='true']`.
- Selection does not conflict. `:not(.btn-primary, .btn-error)` at `:357` keeps selection off the filled warning, as on plain primary. On outline, the selected rule (1,5,0) beats the tone rest rule (1,4,0), so the tone is ignored while selected, as test 5 declares. On hover the tone rule (1,6,0) beats selection. The ghost danger tone already behaves this way, so the pattern is consistent.
- The ghost fix is correct and needed. The old bare `[data-tone]` hover rule would have painted ghost plus warning red, because the directive writes `data-tone` for every non-default tone (`button-host.ts:25`). Line 269 now lists only danger and muted-danger. Ghost plus warning stays inert.
- Tokens mirror the danger group (`ptah-tokens.css:143-155` vs `:128-142`): same names, same 90% and 82% mix ratios, same stock shade `oklch(var(--bc))`. `--wa` and `--wac` are valid DaisyUI variables that the repo already uses (`styles.css:3327`, `:3378`).
- The spec logic is sound for the current CSS. The parser splits on `}` and takes the text before `{`. The warning regex matches all seven warning selectors, including the busy rule at `:429`. The warning exclusion in tests 1 and 5 matches the scope that test 2 asserts.
- The proof site keeps behaviour, ids and aria (`delivery-status.component.ts:37`). The click handler, `type="button"`, the accessible name and the sibling buttons are unchanged. The button had no id and no aria before or after. The directive writes no aria here: `busy` is unset and `selected` is undefined.
- The baseline change is correct. The template now holds no blocked class tokens: the audit judges only class-family attributes (`tools/ui-class-audit/check-ui-classes.ts:429-469`), and `ptahButton`, `variant`, `tone`, `size` are not classes. The removed entry drops three counts and raises none. This matches what `--update-baseline` writes, because it prunes files with no tokens (`check-ui-classes.ts:629-644`).

## Verdict

Request changes. Fix F1, or waive it with an explicit decision, before merge. F2 to F4 are small follow-ups. The rest of the diff follows the established patterns and is correct.
