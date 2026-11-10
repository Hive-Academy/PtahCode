# Batch B0 — shared list-detail shell (libs/frontend/ui)

Status: complete. Contract from the batch brief and `context.md` "Shared contract (B0)"
implemented as fixed; nothing renamed.

## Files changed

- `libs/frontend/ui/src/lib/surfaces/list-detail.component.ts` — NEW `ptah-list-detail`.
- `libs/frontend/ui/src/lib/surfaces/list-row.directive.ts` — NEW `button[ptahListRow]`.
- `libs/frontend/ui/src/lib/surfaces/list-detail.component.spec.ts` — NEW (4 tests).
- `libs/frontend/ui/src/lib/surfaces/list-row.directive.spec.ts` — NEW (2 tests).
- `libs/frontend/ui/src/lib/surfaces/index.ts` — two `export * from` lines added.
- `apps/ptah-extension-webview/src/app/ui-gallery.component.ts` — new "List detail"
  section via a private `ListDetailDemoComponent` wrapper (3 rows + detail text).
- `apps/ptah-extension-webview/src/app/ui-gallery.component.spec.ts` — one count updated
  (`[ptahListRow]` 4 → 7; my section adds 3 button rows to the existing 4 `div` rows).

No other file touched. No change to `styles.css`, `tailwind.config.js`, chat/canvas/voice/setup
pages, `libs/frontend/machines-ui` or `libs/frontend/review-runs-ui`.

## Final template of ptah-list-detail

```html
<div
  class="flex min-h-0 min-w-0 flex-1 gap-4"
  [style.--ptah-list-width]="listWidthStyle()"
  [style.--ptah-leading-width]="leadingWidthStyle()"
>
  @if (hasLeading()) {
    <aside
      class="surface-1 rounded-2xl p-5 min-w-0 min-h-0 overflow-y-auto hidden min-[1200px]:block min-[1200px]:flex-none min-[1200px]:w-[var(--ptah-leading-width)]"
      [attr.aria-label]="leadingLabel() || null"
      data-glass-surface="content"
      data-testid="list-detail-leading"
    >
      <ng-content select="[listDetailLeading]" />
    </aside>
  }
  <section
    class="surface-1 rounded-2xl p-5 min-w-0 min-h-0 overflow-y-auto flex-1 min-[768px]:block min-[768px]:flex-none min-[768px]:w-[var(--ptah-list-width)]"
    [class.hidden]="detailOpen()"
    [attr.aria-label]="listLabel()"
    data-glass-surface="content"
    data-testid="list-detail-list"
  >
    <ng-content select="[listDetailList]" />
  </section>
  <section
    class="surface-1 rounded-2xl p-5 min-w-0 min-h-0 overflow-y-auto flex-1 min-[768px]:block"
    [class.hidden]="!detailOpen()"
    [attr.aria-label]="detailLabel()"
    data-glass-surface="content"
    data-testid="list-detail-detail"
  >
    <ng-content />
  </section>
</div>
```

Host: `class: 'flex min-h-0 min-w-0 flex-1'`, `data-testid="list-detail"`.

Responsive behavior: the list pane is `flex-1` below 768 px and becomes a fixed
`var(--ptah-list-width)` pane from 768 px (`min-[768px]:flex-none` overrides `flex-1`).
The leading pane exists only when `hasLeading` and stays `hidden` below 1200 px.
Below 768 px `[class.hidden]` keeps exactly one pane: `detailOpen()` hides the list,
`!detailOpen()` hides the detail. Both panes carry `min-[768px]:block`, and Tailwind
orders media variants after base utilities, so both are visible from 768 px whatever
`detailOpen` says — the same idiom the foundation list-detail uses.

## Container-query or media-query choice

**Media variants `min-[768px]:` / `min-[1200px]:`** (the task's fallback branch). Evidence:

- `apps/ptah-extension-webview/tailwind.config.js:83` — `plugins: [require('daisyui')]` only;
  no `@tailwindcss/container-queries` plugin, so the named-container variants
  `@[768px]/listdetail:` would generate no CSS.
- `package.json` — `"tailwindcss": "^3.4.18"` and no `@tailwindcss/container-queries` entry.
- No named-container Tailwind variant anywhere in `libs/frontend`: existing container
  queries are native CSS `@container` at-rules in inline styles, or the arbitrary at-rule
  variant `[@container(min-width:768px)]:` in `foundation/list-detail.component.ts`.
- The approved prototype itself is viewport-media based: `prototype/machines-a.html`
  uses `@media(max-width:767px)` and `@media(min-width:768px) and (max-width:1199px)`.

Consequence: the host does NOT get `@container/listdetail` (dead class without the
plugin); tiers measure the Electron webview viewport, which matches the prototype.

## Token names used

- `--surface-2` — `apps/ptah-extension-webview/src/styles.css:161`
  (`--surface-2: oklch(var(--b2));`); the `.surface-2` class sits at styles.css:403.
  Used as `hover:bg-[var(--surface-2)]` and selected `bg-[var(--surface-2)]`.
- `--ptah-gold` — styles.css:59 (`--ptah-gold: #d4af37;`), theme-aware at :132 and :3493.
  Used as `border-[var(--ptah-gold)]`.
- `surface-1` pane class — defined in styles.css:389-403; also a Tailwind color
  (tailwind.config.js:38).
- `outline-primary` — daisyUI semantic color (registered by the daisyui plugin).
- Component-owned CSS vars: `--ptah-list-width`, `--ptah-leading-width`.

## Decisions

1. **Media variants, not container variants** — plugin absent (evidence above); the
   task text itself names `min-[768px]:` / `min-[1200px]:` as the fallback.
2. **Widths as computed `'NNNpx'` strings** bound with `[style.--ptah-list-width]` on the
   inner row — the repo's own pattern (`command-center-page.component.html:85` binds
   `--rail-width` the same way; its spec asserts it at command-center-page.component.spec.ts:252).
   The brief's `[style.--ptah-list-width.px]` form was marked "for example"; the repo-proven
   string form is used instead. Static Tailwind classes read the var:
   `min-[768px]:w-[var(--ptah-list-width)]`.
3. **Below-768 pane switching** via named `[class.hidden]` bindings plus static
   `min-[768px]:block` — complete static class strings, no runtime class assembly.
4. **`aria-selected` always renders** — computed `'true' : 'false'` string, because
   `role="option"` must expose both states (and attr bindings remove the attribute on
   `false` in some Angular versions).
5. **Leading pane label** — `[attr.aria-label]="leadingLabel() || null"`: an empty
   `aria-label` would hide the pane content from the accessibility tree.
6. **Directive classes via a computed full-string `[class]` host binding** — repo precedent
   `setup-action.directive.ts` / `setup-field.directive.ts` (both in this lib). Named host
   class bindings cannot carry `bg-[var(--surface-2)]` / `border-[var(--ptah-gold)]`
   (brackets and parens break the host binding key). The three state strings are static
   literals, so Tailwind extracts every class.
7. **Gallery demo isolated in a wrapper component** — the gallery already demos the
   foundation `PtahListDetailComponent`, whose selector is also `ptah-list-detail`;
   two components cannot share one template scope (Angular throws `RuntimeError -300
   "Multiple components match node with tagname"`). The private
   `ListDetailDemoComponent` in the same file gives the new shell its own scope, and the
   foundation demo stays untouched.
8. **Duplicate selector coexistence** — `ptah-list-detail` now matches two components
   (foundation `PtahListDetailComponent`, surfaces `ListDetailComponent`) and
   `ptahListRow` matches two directives (`div[ptahListRow]` foundation,
   `button[ptahListRow]` surfaces). They are element-disjoint for the directive and
   scope-disjoint for the component, but consumers must import exactly one list-detail
   per template scope. Flagging for the coordinator: after B1/B2 migrate, the foundation
   pair may deserve a removal pass.
9. **Gallery spec count** updated 4 → 7 — the spec counts `[ptahListRow]` elements, so the
   required "keep passing" implies this one-number update.

## Verification

- `ptah_get_diagnostics` scoped to all 7 changed files: **no diagnostics** in the
  requested files. (24 errors reported in sibling files are pre-existing repo noise —
  e.g. `foundation/list-detail.component.spec.ts`, `surface-tile.component.spec.ts`,
  `capability-id-codec.ts` — none of them files I touched.)
- `npm run verify -- -t lint -p ui`: **passed** — lock slot acquired after 0 s (no queue
  wait), `NX 1 task: 1 succeeded`, 0/1 cache hits (my new files were actually linted),
  exit code 0, 12.4 s run / 28.4 s under the lock.

## Not verified

- Jest: not run in this lane (coordinator runs tests and typecheck). The three spec files
  are written but their execution is unverified.
- Tailwind class generation: would need a build; classes follow repo-proven idioms
  (`min-[768px]:`, `w-[var(--x)]`, `border-[var(--ptah-gold)]` — the foundation
  list-detail/list-row use the same shapes), but the generated stylesheet was not checked.
- Visual check: no dev server or browser run in this lane; the gallery section was not
  rendered.
- `libs/frontend/machines-ui` and `libs/frontend/review-runs-ui` untouched, per the rules.
