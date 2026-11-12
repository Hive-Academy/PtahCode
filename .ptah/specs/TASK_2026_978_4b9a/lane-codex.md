# Form owner adoption

## DOM delta by file

| File | Change |
| --- | --- |
| `dashboard-list.component.ts` | Filter search input gains `ptahInput size="sm"`; raw input look classes removed. Existing stacked label, width, ID, value, focus key, and input event remain. |
| `dashboard-table.component.ts` | Filter search input gains `ptahInput size="sm"`; raw input look classes removed. Existing stacked label, width, ID, value, focus key, and input event remain. |
| `surface-checkbox-input.component.ts` | Native checkbox gains `ptahCheckbox size="sm"`; raw checkbox look classes removed. Existing label, ID, checked state, ARIA bindings, focus key, and change event remain. |
| `surface-choice-input.component.ts` | Native single-selection select gains `ptahSelect size="sm"` and owner invalid state; raw select look classes removed. Existing stacked label, options, ID, ARIA bindings, focus key, and change event remain. Radio inputs remain raw because this owner set has no radio directive. |
| `surface-text-input.component.ts` | Native textarea gains `ptahTextarea`; single-line input gains `ptahInput size="sm"`. Both gain owner invalid state and lose raw look classes. Existing stacked label, width, IDs, values, ARIA bindings, focus keys, and events remain. |
| `add-machine-pane.component.ts` | SSH alias and pairing-code cells gain `ptahInput size="sm" tone="mono"`; raw input and focus look classes removed. Code cells keep sizing and alignment classes and gain owner invalid state. Existing IDs, names, ARIA bindings, and events remain. |
| `machine-list.component.ts` | Search input gains `ptahInput size="sm"`; raw input and focus look classes removed. Width, test ID, ARIA label, value, and input event remain. |

`surface-choice-input.component.spec.ts` now checks the owner marker and compact size class on the select.

## Verification and open questions

Compared the changes with merged PR 9's native form-control directive pattern and the owner directive definitions. `git diff --check` passed. `npm run verify -- -p declarative-dashboard,machines-ui` passed lint and typecheck for both projects and tests for declarative-dashboard. The machines-ui test target had 19 passing suites and 5 suites unable to start because its Jest mapping points to an absent `marked` module file under `node_modules`. This is outside the scoped files. A parent report was attempted but the parent inbox was full.

No rendered screenshot was available under the requested verification restriction; visual comparison is still open. The radio group remains raw because no radio owner was supplied. No other requested control variant was left raw.
