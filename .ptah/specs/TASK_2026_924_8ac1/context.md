# Context: TASK_2026_924_8ac1

Date: 2026-11-10. Type: RESEARCH (documentation and planning only, no production code).

## Request

The user wants "a consistent enterprise level application and a shared design components over
the settings pages and also the other pages", without repeated work. The approved method
(2026-11-10) is family by family across the full Electron renderer, not page by page:

1. One inventory of the full renderer by control family.
2. One owner for each family: a component in `libs/frontend/ui`. Features give data and
   handlers only.
3. Three layers: tokens, behavior (Angular CDK and `@angular/aria`), components.
4. Extract first behind a DOM-equality gate, then change the look one time per family.
5. A lint ratchet per completed family.
6. One gallery page in Electron as the visual-review reference.

Form direction that is closed: no native select at the end, a rich select, floating-label
inputs, built in Angular with CDK, HyperUI and Preline only as a visual reference.

## Deliverables

- `renderer-component-inventory.md`: the inventory by family.
- `design-system-plan.md`: the unified plan.
- `inventory/lane-*.md`: the raw lane reports that the inventory uses as evidence.

## Related tasks

- TASK_2026_904: component system, top-down plan. Wave 1 merged. Wave 1b not started.
- TASK_2026_919_8ffc: Settings forms (pull request #1056). Its Settings inventory has 114
  controls. This task does not count Settings again.

## Method

Three CLI lanes counted the control families, one lib group each:

| Lane | Executor | Scope |
|---|---|---|
| A | codex | `libs/frontend/chat` without `settings/` |
| B | Claude API (ptah-cli) | `chat-ui`, `canvas`, chat support libs, the app shell, and the audit of `libs/frontend/ui` |
| C | codex | the 17 feature page libs |

The coordinating session ran raw pattern counts for the full renderer and compared them with
the lane counts.
