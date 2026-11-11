# Button adoption rules (batch 1b, look approved)

The token look of family 1 is the product look. `ptahButton` / `ptahIconButton` hosts (attribute
`data-ptah-button`) take it. A raw `class="btn ..."` element keeps the old DaisyUI/glass look
until it moves to a directive. Import both directives from `@ptah-extension/ui` and add the
used ones to the `imports` array of the standalone component that owns the template.

## Mapping (old classes -> directive)

| Old classes | New |
|---|---|
| `btn btn-primary` | `ptahButton variant="primary"` |
| `btn btn-ghost` | `ptahButton variant="ghost"` |
| `btn btn-outline` (no colour), plain `btn btn-sm` (no variant), `btn btn-secondary` | `ptahButton variant="secondary"` (the default; omit the input) |
| `btn btn-error`, `btn btn-outline btn-error` | `ptahButton variant="danger"` |
| `btn btn-link` | `ptahButton variant="link"` |
| `btn-xs` / `btn-sm` / `btn-md` | `size="xs"` / `size="sm"` (default, omit) / `size="md"` |
| `btn-square` or `btn-circle`, or a control whose only child is an icon | `ptahIconButton label="..."` (`variant` default `ghost`) |

- Icon-only control: `label` is the accessible name and the tooltip. Take it from the old
  `aria-label` (else `title`, else the clearest visible meaning). Dynamic text: `[label]="expr"`.
  Remove the old `aria-label` and `title` on that element. Keep `data-testid`, `(click)`,
  `[disabled]`, `[attr.*]`, `@if` structure and every other attribute.
- `type`: keep an explicit `type`. Add `type="button"` to a `<button>` that sits inside a `<form>`
  or `<ptah-...-form>` and has no type, unless it must submit (then `type="submit"`). The
  directive already defaults a `<button>` to `type="button"` when no type is given.
- Busy: `[busy]="expr"` replaces a manual `opacity-60 cursor-wait` / `loading` class / spinner
  span plus `aria-busy` when the control only shows a pending state.
- Remove from `class` only: `btn`, the variant class, the size class, `btn-square`, `btn-circle`.
  Also remove utilities that the family now owns and that would be dead or misleading:
  `h-*`, `min-h-*`, `px-*`, `py-*`, `p-0`, `rounded-*` (on the button), `border`, `border-*`,
  `normal-case`, `font-*`, `text-xs|sm|base`, `gap-*`, `text-error|success|warning`,
  `text-base-content`, `bg-*`. Keep layout utilities: `w-full`, `shrink-0`, `flex-shrink-0`,
  `ml-auto`, `mr-*`, `mt-*`, `-mr-1`, `self-*`, `justify-*`, `order-*`, `hidden`/responsive display.
  If no class is left, drop the `class` attribute.

## Do NOT convert (leave the element as it is and list it under "Skipped" with the reason)

- The chat composer and the canvas rail (`libs/frontend/canvas` rail controls and the
  `libs/frontend/chat` composer files: input area, send/stop/attach/model-picker row).
- `btn-warning`, `btn-success`, `btn-info`, `btn-accent`, `btn-neutral` (no family variant yet;
  list them so the coordinator can decide).
- Controls that need wrapping text (`h-auto`, `whitespace-normal`, `text-left` multi-line labels).
- Chips and toggle pills (`rounded-full` filter chips), `join-item` button groups, `btn-active`
  toggles, tab-like and menu-like controls, and anything with a dynamic `[class]` / `ngClass`
  binding that builds the btn classes (report it).
- Buttons that are not DaisyUI `btn` (custom styled) and `<label class="btn">`.
- Existing `ptahButton`/`ptahIconButton`, `ptahSetupAction`, rail-icon-action directives.

## Checks the lane must pass before it reports

- `git diff --stat` only lists files of the assigned group. No `.spec.ts` change unless a test
  reads a removed class: then update the test to the directive attributes.
- Every changed component imports exactly what it uses (no unused import).
- No leftover `title="..."` or `aria-label` on a converted icon button; every `ptahIconButton`
  has a non-empty `label`.
- Do not run build, serve, e2e or the whole test suite. Do not commit or push.
- Write the report: table `file:line | old classes | new attributes | notes`, then
  `## Skipped` (file:line | reason), then counts: converted, skipped.
