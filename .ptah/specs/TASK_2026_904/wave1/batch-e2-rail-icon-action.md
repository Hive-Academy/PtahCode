# Batch E2 — rail icon action

## Source DOM/classes before

Dense toggle, verbatim source markup before extraction:

```html
<button
              type="button"
              class="btn btn-ghost btn-xs"
              [attr.aria-pressed]="density() === 'dense'"
              aria-label="Dense cards"
              title="Dense cards"
              [attr.aria-describedby]="
                showDensityHint() ? 'rail-density-hint' : null
              "
              (click)="densityToggled.emit()"
            >
              ≡
            </button>
```

Collapse toggle, verbatim source markup before extraction:

```html
<button
            type="button"
            class="btn btn-ghost btn-xs min-h-6 min-w-6"
            data-testid="rail-collapse-toggle"
            [class.opacity-60]="autoCollapsed()"
            [attr.aria-label]="collapsed() ? 'Expand rail' : 'Collapse rail'"
            [attr.aria-expanded]="!collapsed()"
            [attr.aria-disabled]="autoCollapsed() ? 'true' : null"
            [attr.aria-describedby]="
              autoCollapsed() ? 'rail-collapse-reason' : null
            "
            [attr.title]="autoCollapsed() ? autoCollapseReason : null"
            (click)="onCollapseToggle()"
          >
            {{ collapsed() ? '›' : '‹' }}
          </button>
```

Neither button uses rail component CSS. Utility classes own the appearance. The rail aside remains the single `data-glass-surface="chrome"` owner.

## Extracted API

`RailIconActionDirective` is standalone on `button[ptahRailIconAction]`. Required `label` maps to `aria-label`; optional `active` maps to `aria-pressed` (absent when unset); `disabled` maps to native disabled. `CANVAS_RAIL_ACTION_LOOK` defaults to `btn btn-ghost btn-xs`; `provideCanvasRailActionLook()` accepts an override. Existing inline button content is the icon slot. A directive cannot define Angular named projection slots without a template and new host element; native content preserves the DOM required by the pixel gate.

## After markup and equivalence

Dense toggle after, verbatim:

```html
<button
              ptahRailIconAction
              type="button"
              class="btn btn-ghost btn-xs"
              [active]="density() === 'dense'"
              label="Dense cards"
              title="Dense cards"
              [attr.aria-describedby]="
                showDensityHint() ? 'rail-density-hint' : null
              "
              (click)="densityToggled.emit()"
            >
              ≡
            </button>
```

The native button, class list, icon text node, title, description and click remain. `active` and `label` render the same ARIA attributes. The look's repeated base classes do not alter the class list.

Collapse toggle after, verbatim:

```html
<button
            ptahRailIconAction
            type="button"
            class="btn btn-ghost btn-xs min-h-6 min-w-6"
            data-testid="rail-collapse-toggle"
            [class.opacity-60]="autoCollapsed()"
            [label]="collapsed() ? 'Expand rail' : 'Collapse rail'"
            [attr.aria-expanded]="!collapsed()"
            [attr.aria-disabled]="autoCollapsed() ? 'true' : null"
            [attr.aria-describedby]="
              autoCollapsed() ? 'rail-collapse-reason' : null
            "
            [attr.title]="autoCollapsed() ? autoCollapseReason : null"
            (click)="onCollapseToggle()"
          >
            {{ collapsed() ? '›' : '‹' }}
          </button>
```

The native button, class list, content, test ID, expansion and disabled semantics, title, description and click remain. `label` renders the same ARIA label; unset `active` leaves `aria-pressed` absent. Default `disabled=false` leaves native disabled absent. The look's repeated base classes do not alter the class list.
## Buttons left local

Sort toggle has a changing text label; status chips contain dot, label and count; footer buttons are full-width text/compound controls; finished-group toggle is a row control. These have different anatomy.

## Files changed

`libs/frontend/ui/src/lib/extracted/rail-icon-action/rail-icon-action.directive.ts`, `rail-icon-action.look.ts`, `rail-icon-action.directive.spec.ts`, `index.ts`; `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail.component.ts`; this handoff.

## Verify

Scoped command: `npm run verify -- -p @ptah-extension/ui,@ptah-extension/canvas 2>&1 | Select-Object -Last 30`. The command is still queued behind other worktrees in the machine-wide verification lock; it has produced no tail or exit result. `node scripts/verify.mjs --status` showed 3 occupied slots, 0.7 GB free memory, and this run in the queue. `ptah_get_diagnostics` was unavailable after 45 seconds (TypeScript still running), so its 2 scoped files were unchecked. Tree-sitter syntax analysis passed for all 3 new TypeScript files. No visual screenshot was taken; the later Electron zero-pixel gate owns that check.

## Decisions

- Native attribute directive: chose exact DOM and layout. Angular named projection requires a template and extra host element. Reversible if later design allows it.
- Active state applies only to density because only it had `aria-pressed`. Collapse has no active attribute. Reversible.
- Only density and collapse share icon-only anatomy. Source markup supports leaving other controls local. Reversible.



