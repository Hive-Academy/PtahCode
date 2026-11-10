# Batch A1 — adopt extracted styling directives (machines + reviews consumers)

Executor: Glm lane (machines-ui edits), stopped early by the agent budget. The orchestrator
completed the review settings drawer and this document.

## Adopted

| File | Element | Directive + look | Class list before | Static leftovers after |
| ---- | ------- | ---------------- | ----------------- | ---------------------- |
| `machines-ui/.../add-machine-pane.component.ts` | submit (`add-machine-submit`) | `[ptahSetupAction]="'primaryCompact'"` (`btn btn-primary btn-sm`) | `btn btn-primary btn-sm` + 4 focus-visible classes | the 4 focus-visible classes |
| `machines-ui/.../add-machine-pane.component.ts` | cancel (`add-machine-cancel`) | `[ptahSetupAction]="'ghost'"` (`btn btn-sm`) | `btn btn-ghost btn-sm` + 4 focus-visible classes | `btn-ghost` + the 4 focus-visible classes |
| `machines-ui/.../machine-list.component.ts` | add (`machine-list-add`) | `[ptahSetupAction]="'ghost'"` (`btn btn-sm`) | `btn btn-sm gap-1` + 4 focus-visible classes + `[class.btn-primary]` / `[class.btn-ghost]` | `gap-1` + the 4 focus-visible classes; the two class bindings are unchanged |
| `review-runs-ui/.../review-settings-drawer.component.html` | Close | `[ptahSetupAction]="'ghost'"` | `btn btn-ghost btn-sm` | `btn-ghost` |
| `review-runs-ui/.../review-settings-drawer.component.html` | Retry | `[ptahSetupAction]="'ghost'"` | `btn btn-ghost btn-sm` | `btn-ghost` |

Each element keeps the same class set, DOM, attributes and handlers. The expected pixel change is 0.

## Left local

| File | Element | Reason |
| ---- | ------- | ------ |
| `review-settings-drawer.component.html` | Save review settings (`btn btn-primary`) | No look has this exact class set (`primaryFull` adds `mt-4`). A new look or a size change is Wave 2 work. |
| machines and reviews selects | none adopted | The two consumers have no select with the `select select-bordered select-sm` frame. |
| machines and reviews icon buttons | none adopted | No button has the `btn btn-ghost btn-xs` rail frame. |

## Files changed

- `libs/frontend/machines-ui/src/lib/components/add-machine-pane/add-machine-pane.component.ts`
- `libs/frontend/machines-ui/src/lib/components/machine-list/machine-list.component.ts`
- `libs/frontend/review-runs-ui/src/lib/components/review-settings-drawer.component.{html,ts}`

## Decisions

- **Keep `btn-ghost` static on ghost consumers.** The `ghost` look is `btn btn-sm` because its
  source (analyze page) has no `btn-ghost`. A consumer adds `btn-ghost` locally. Reversible.
- **No new look for the Save button.** A new look only for a consumer is not an extraction.
