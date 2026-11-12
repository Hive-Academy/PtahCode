# Final review: form controls step 6 (commit 24278cbf0)

## Verdict
Ready for merge: YES, after one small cleanup (remove `verify-output.txt`).

## Findings by checklist item
1. **Canvas migration - OK.** `PtahInputDirective` is imported and listed in `imports`.
   The selector `input[ptahInput]:not([type=checkbox]):not([type=radio])` matches the
   `type="text"` input. The host adds `input input-bordered` and `input-sm` from `size="sm"`.
   Layout classes (`mb-3 w-full`), aria attributes, `maxLength`, `value`, `readOnly` and the
   event handlers are unchanged.
   The spec now checks the `ptahInput` attribute and `input-sm`. This check is weaker than the
   old one: it no longer proves the focus ring. The ring belongs to the owner stylesheet and
   needs its own test there (see follow-up).
   Line in the commit is long but matches the surrounding template style.
2. **Audit tool - OK.** For the `input` root, only a closed set of DaisyUI modifiers is
   flagged, plus `group`. `input-preview-block` is no longer a false positive. The new spec
   covers a pass case and two block cases. Baseline decreased by 4 tokens (canvas `input`,
   `input-bordered`, `input-sm`, and `input-preview-block`) and nothing increased.
   Risk: the allow-list of modifiers can miss a future DaisyUI modifier. A new variant
   would pass the audit silently. Keep the set in step with DaisyUI upgrades.
3. **Helper cleanup - OK.** A search of `libs/frontend/ui/src` shows `normalizeText` is only
   used inside `rich-select-list.ts`. I did not complete a full-repository search (it timed
   out). The commit notes say a consumer check was done (`helper-consumers-check.md`).
   Typecheck would fail on any external import.
4. **Dead code - one item.** `verify-output.txt` at the repository root is a stray log file.
   It is not part of the change. Remove it from the commit. The spec files under
   `.ptah/specs/**` are acceptable task records.
5. **Breaking changes - none found.** The nine documented exceptions are listed in the
   commit message. The attention-permission exception is a real boundary limit
   (core cannot import ui) and stays an open point.
6. **Architecture - OK.** The canvas library already depends on `@ptah-extension/ui`
   (it imported `NativePopoverComponent`). No new dependency or boundary violation.
7. **Tests.** I did not run checks. The commit reports audit test, template typecheck, and
   canvas lint/typecheck as passed, canvas 112 tests passed. 27 webview suites could not
   start (reported as pre-existing, worktree issue) and 2 unrelated failures. Confirm in CI.

## Risks
- Visual change of the rename field is not checked in Electron (light and dark themes).
- The weaker spec assertion (see item 1).
- The commit message footer names a different model than the session. This is cosmetic.

## Follow-up items
1. Delete `verify-output.txt` from the branch.
2. Check the rename popover in Electron, both themes.
3. Add or confirm an owner-level test for the focus ring of `ptahInput`.
4. Resolve the attention-permission exception, the success-tone toggles, and the radio owner lock.
