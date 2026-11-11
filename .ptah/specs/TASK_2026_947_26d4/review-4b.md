# Review 4b: button adoption (chat-ui, harness-builder, command-center)

Scope: all hunks of the diff in 41 files, the 3 spec edits and the `baseline.json` edit.

## Majors

None found.

## Checks that passed

- (1) No attribute lost. `data-testid`, `data-test`, `(click)`, `[disabled]`, `[attr.aria-*]`, `type` and
  `#cancelButton` are intact. No broken tag in any hunk.
- (2) Ghost + border maps to `secondary` (variant omitted, or `variant="secondary"` on the icon button):
  `command-center-header.component.ts:24,37,38`, `command-voice-hud.component.ts:69`.
- (3) The only `variant="danger"` is `permission-request-card.component.ts:132`. Its panel is neutral
  (`bg-base-100/20`), not tinted. Buttons in `bg-error/10` or `alert-error` panels stay raw.
- (4) Every `ptahIconButton` has a `label` or `[label]`. No leftover `title` or `aria-label` on one.
- (5) Imports match use in every changed component. `command-center-page.component.ts` lists both
  directives and its `.html` uses both. No unused import found.
- (6) Skipped elements are unchanged (composer, `btn-warning|success|info`, `join-item`, chips, dynamic class).
- (7) No dead utility class and no layout class wrongly removed. `w-full`, `mt-*`, `shrink-0`,
  `flex-shrink-0`, `m-2`, `max-w-full` and `underline` stay.

## Minors

1. `lane-result-card.component.ts:~131` and `tool-call-header.component.ts:~229`: the old `title` showed the
   full file path. The new `label` shows only `Open <name>`. Users lose the path tooltip.
   The edited specs no longer test this (see 2).
2. Spec edits are weaker than the originals:
   - `lane-result-card.component.spec.ts:82` and `tool-call-header.component.spec.ts:288,309` now only check
     `data-ptah-button`. They do not check the tooltip or `label` text any more.
   - `command-voice-hud.component.spec.ts:108` checks `btn-ghost` and `:156` checks `btn-secondary`. These
     depend on directive host classes (`button-host.ts:12-16`). They are valid but couple the spec to the
     directive. Prefer `data-ptah-button` plus the variant input.
3. `harness-builder-leave-dialog.component.ts:~108-126`: the responsive `min-h-10 min-[460px]:min-h-8`
   touch-target classes are removed. Confirm that size `sm` still meets the minimum target size on narrow
   viewports.
4. `mcp-directory-browser.component.ts:149`: the Dismiss button is on an `alert-info` tinted panel. This is
   not forbidden (ghost, not danger), but check contrast in the visual check.
5. `command-center-header.component.ts:24`: `font-mono text-xs` is dropped. This follows the rules but changes
   the look of the voice status chip. Text keeps `aria-label` and `title` with `ptahButton`. This is allowed
   (not icon-only).
6. `mermaid-diagram.component.ts:35`: `aria-label="Copy Mermaid source"` stays on a button with visible text
   "Copy". This is a pre-existing pattern. It is valid.

## Lane report: false or weak statements

- Row `command-center-header.component.ts:37` is garbled. It repeats the old classes as the "new
  attributes" text and mixes two buttons (the Voice settings text button and the theme icon button).
- Several "new attributes" cells are truncated at 200 characters (for example `mermaid-diagram:35`,
  `command-session-controls:16`). Cut-off text could hide a lost attribute. The diff shows none lost.
- "Converted: 78" matches the table rows (78). The diff has 79 added directive lines, so one more line is
  not in the table. Recount before the PR text.
- "Skipped: about 41" is not an exact count. State the real number.
- "chat-ui / harness-builder / command-center: pass" and "`typecheck-templates` did not run" were not
  re-run in this review. Run `npm run verify -- -t typecheck-templates -p ptah-extension-webview` before the push.
- The `baseline.json` edit is not in the report. It removes the converted files from the class audit
  baseline (30 insertions, 157 deletions). It looks consistent with the converted files. Run the audit
  to confirm that no file is missing or extra.

## Spec edits (8)

Valid, no syntax problem. See Minor 2 for the weakened assertions.
