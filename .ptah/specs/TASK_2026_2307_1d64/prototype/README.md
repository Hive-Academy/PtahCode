# Prototype - Providers settings polish (TASK_2026_2307_1d64)

## How to open

Open `index.html` in any browser (`file://`). No build, no network. The toolbar switches theme
(dark = `ptah-glass`, light = `ptah-glass-light`), the frame width (400 / 720 / 1100 px; the frame is a
container, like the settings scrollport) and the surface A to E. A second row switches the states of the
surface. Everything above the dashed frame is prototype chrome and not part of the design.

Interactive: A (Change popover stub), B (Connect provider button, drawer, one radio group with connected rows listed, Sign in closes the drawer, disabled
button), C (X or Cancel opens the modal; Escape = keep editing and the drawer stays; Tab is trapped; the log
line shows where focus returned), D (Eye / EyeOff toggle), E (nav items).

## Sources

Token values: `apps/ptah-extension-webview/tailwind.config.js` (themes `ptah-glass`, `ptah-glass-light`) and
`libs/frontend/ui/src/lib/tokens/ptah-tokens.css`. Current-state markup: see `../design-spec.md` section 1.

## Project rules vs proposals

`[project-rule]`: the existing tokens, `ptahButton` / `ptahBadge` / `ptah-field` shapes, glass radii, the
Settings user decisions in `docs/design-system/settings/README.md` (every field is a floating-label
`ptah-field`; dropdowns use `ptah-select`), one primary action per surface, status is not a button.

## Lane-introduced constraints

All `[lane-proposed]`; they need Gate 1.7 acceptance:

1. Main agent: one merged status badge replaces the "Active/Needs attention/Not set" badge plus the route badge.
2. Main agent: "Change" is a ghost button at the head row end (was the page's gold primary).
3. Wizard step 1: unconfigured providers first, then connected ones with a Connected badge, one radio group (user-requested: all connected providers stay visible).
4. Wizard step 1: per-row "Sign in" ghost button for sign-in providers.
5. Wizard step 1: load-error alert with Retry above the list; the list then shows all providers.
6. Discard modal: "Keep editing" is the default focus; Discard uses the danger variant.
7. Settings nav: navigation-mode width 14.5rem (no token change), child connector offset, status mark in a fixed
   1rem slot with an 8px glyph, no second rail on the parent of the active child.
8. Footer: shorter "Runs 100% locally" copy (see spec section 6, E).

## Not rendered

The prototype was last rendered in headless Chromium (not Electron). The screenshots in `screenshots/` are from the
FIRST revision and are STALE for B (they show the removed "Already connected" disclosure) and E (13/14rem nav); they
were not re-captured in this revision (no browser tool). Re-open `index.html` to see the updated B (one radio group,
descriptions, "Default models available", skeleton, Sign in exit) and E (14.5rem, original item padding). D now uses a
fixed accessible name. Not rendered anywhere: light-theme B-E captures, real-window narrow/embedded reflow, focus
rings from real keyboard input, the Electron renderer, `ptah-select`, Floating UI, the true `ptahButton` / `ptahBadge`
CSS and `ptah-provider-mark` brand marks (initials are used). The C mock does not model a drawer-backdrop opener, the
discard Discard button still uses a tinted prototype style, and the page-entry gate states are not mocked beyond the
disabled button. Contrast outside the table in the spec section 7 is pending Electron verification.
