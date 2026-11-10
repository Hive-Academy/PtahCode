# Batch 0b Report: UI Gallery Sections & Token Specimens

## Files

| File | Line count | Purpose |
|---|---|---|
| `apps/ptah-extension-webview/src/app/ui-gallery.component.ts` | 124 | Thin gallery shell (`UiGalleryComponent`) with `ptah-page-header` back navigation to `/chat`, Dark/Light `ThemeService` switch (`ptah-glass` / `ptah-glass-light`), in-page `<nav aria-label="Gallery sections">` index, and ordered section components. |
| `apps/ptah-extension-webview/src/app/ui-gallery/gallery-section.component.ts` | 23 | Shared section wrapper (`ptah-gallery-section`) with required `id` and `title` inputs, `h2` (`text-ptah-section-title`), `gap-ptah-heading` from heading to content, and `gap-ptah-group` between projected groups. |
| `apps/ptah-extension-webview/src/app/ui-gallery/gallery-tokens-spacing.component.ts` | 124 | Spacing token section (`#tokens-spacing`) displaying the 7 `--ptah-space-*` scale bars and 9 real white-space rule specimens (`gap-inline`, `gap-label`, `gap-controls`, `gap-field`, `gap-group`, `gap-section`, `surface-pad`, `dialog-pad`, `gap-heading`) with token captions. |
| `apps/ptah-extension-webview/src/app/ui-gallery/gallery-tokens-type.component.ts` | 128 | Typography token section (`#tokens-type`) displaying all 8 `--ptah-text-*` roles with sentence samples and metrics plus a "Hierarchy in use" specimen ordering page title, section title, group title, body, field label, control, and hint. |
| `apps/ptah-extension-webview/src/app/ui-gallery/gallery-tokens-shape.component.ts` | 148 | Shape, elevation, motion, and state token section (`#tokens-shape`) displaying radius (`control`, `surface`, `chip`), border (`default`, `strong`), elevation (`0`–`3`), `:focus-visible` outline ring, motion duration previews (`fast`, `base`, `slow`), control heights (`xs`, `sm`, `md`, `field`), icon sizes (`xs`, `sm`, `md`), and state inks (`ok`, `warn`, `err`, `info`). |
| `apps/ptah-extension-webview/src/app/ui-gallery/gallery-components.component.ts` | 137 | Existing `@ptah-extension/ui` foundation component samples (`Buttons`, `Fields`, `Metrics`, `List and detail` with `ngListbox selectionMode="explicit"`, `Inbox layout`, `Statuses`, `States`, `Meters`, `Surfaces`) wrapped in `ptah-gallery-section` with zero inner markup changes. |
| `apps/ptah-extension-webview/src/app/ui-gallery/inbox-layout-demo.component.ts` | 28 | Extracted `InboxLayoutDemoComponent` keeping its own component template scope so `ptah-inbox-layout` and `ptah-list-detail` do not collide. |
| `apps/ptah-extension-webview/src/app/ui-gallery.component.spec.ts` | 117 | Unit specs keeping existing foundation sample and back-button tests green while adding coverage for token section specimen counts, `ThemeService.setTheme('ptah-glass-light')` / `('ptah-glass')` switching, and section index link parity. |
| `apps/ptah-extension-webview/src/app/app.routes.spec.ts` | 163 | Route specs updated to read joined sources from `ui-gallery.component.ts` and `ui-gallery/`, plus a new assertion verifying neither `SURFACE_ROUTE_IDS` / `ACCEPTED_INITIAL_VIEWS` nor any non-gallery app source references `ui-gallery`. |
| `.ptah/specs/TASK_2026_926_6b1f/batch-0b-report.md` | 48 | Batch 0b deliverable report. |

## Decisions

1. **Section wrapper uniformity (`ptah-gallery-section`)**: Wrapped each of the 3 token sections and each of the 9 moved component sections in `ptah-gallery-section` (12 sections total) so every section on `/ui-gallery` has an `h2` with `text-ptah-section-title`, `gap-ptah-heading` spacing, and a matching anchor in `<nav aria-label="Gallery sections">`. Inner markup of the 9 existing component samples was preserved unchanged. Reversible: yes.
2. **Heading hierarchy inside typography specimens**: Because `ptah-page-header` renders the single `h1` on the page and `ptah-gallery-section` renders `h2` per section, the "Hierarchy in use" specimen inside `gallery-tokens-type.component.ts` renders the page-title and section-title visual roles on `<p>` elements under an `h3` group heading so heading levels (`h1` -> `h2` -> `h3`) are never skipped or duplicated. Reversible: yes.
3. **Tooling and skill loading**: Read `.claude/skills/angular-frontend-patterns/SKILL.md`, `.claude/skills/frontend-design/SKILL.md`, and `.claude/skills/ui-ux-designer/SKILL.md` directly from the repository because the host CLI skill catalogue lists only built-in host skills. Called `ptah_search_files` and `ptah_get_diagnostics` first; because the attached MCP server was rooted in the sibling worktree rather than the `feat/ui-gallery-sections` worktree, used native file reads and `npm run verify -- -p ptah-extension-webview` in the target worktree.

## Verify

Command executed from worktree root:

```bash
npm run verify -- -p ptah-extension-webview
```

Summary output:

```text
 NX   Successfully ran targets lint, typecheck for project ptah-extension-webview
  Run duration:      46.1s
[verify 2026-11-10T19:17:59.774Z] starting verify test (ptah-extension-webview)
√  nx run ptah-extension-webview:test
 NX   Successfully ran target test for project ptah-extension-webview
  Run duration:      1m 21s
[verify 2026-11-10T19:19:26.000Z] lock released after 167.0s, exit code 0
```

## Not done / needs the coordinator

- Live Electron screenshots of `/ui-gallery` in `ptah-glass` and `ptah-glass-light`: per the verification rules and `.ptah/specs/TASK_2026_926_6b1f/look-approval-checklist.md` section C, this lane did not run `build`, `serve`, `dev`, or launch the Electron app. Coordinator can capture or authorize the Electron preview screenshots when needed for Look approval.

## Corrections after the review and the final check

- The three review findings of `review-0b.md` are corrected (theme restore on destroy, token
  utilities in the samples, two new tests).
- The code formatter split three template strings that tests read as source text. The route
  spec now accepts white space in these assertions. The type specimens show the pixel value
  next to the rem value. The gallery constructor has the `public` modifier (lint rule).
- Final `npm run verify -- -p ptah-extension-webview`: lint and typecheck passed, test passed
  (exit code 0).
