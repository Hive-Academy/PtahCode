# Review: form adoption changes

## Findings

- **P3 — Spec gap: dynamic rich-select trigger IDs and stable popup IDs are not covered.** `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select-trigger-id.spec.ts:12-40`. The spec uses a static `triggerId` and checks only the trigger and label. It does not change the input after render or open the listbox to confirm `aria-controls` and option IDs remain tied to the generated ID. Suggested fix: bind `triggerId` to a signal, change it after initial render, and assert the label follows while listbox and option IDs remain stable.
- **P3 — Spec gap: field description linkage is not asserted for adopted controls.** `libs/frontend/chat-ui/src/lib/molecules/setup-plugins/mcp-directory-browser.component.spec.ts:452-465,518-547`. The new tests check visible description text and label `for`, but not that the password input and combobox trigger have `aria-describedby` pointing to the field hint. Suggested fix: assert the attribute contains the hint element ID for both cases, including after selection and a later bound ID update.

## Other observations

- No confirmed source defect, observer/effect loop, or stale label `for` in the reviewed diff. The `syncId` signal update is guarded, and the observer's own writes converge.
- The MCP browser diff also adopts `ptahInput` for search and `ptahCheckbox` for target checkboxes at `mcp-directory-browser.component.ts:188-195,399-405`. These add directive-owned classes/data attributes outside the required-input block; I found no functional regression from those changes.
- Targeted checks passed: `npm run verify -- -t test -p ui -- --testPathPatterns=field-bound-id.spec.ts` and `npm run verify -- -t test -p ui -- --testPathPatterns=rich-select-trigger-id.spec.ts`. No build, serve, e2e, or workspace-wide check ran. The MCP browser spec was reviewed but not executed under the task's UI-only test command restriction.
- Ptah skill discovery was available, but returned no locally invocable review skill; review used the diff and source inspection.
