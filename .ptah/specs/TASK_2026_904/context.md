# Context — TASK_2026_904

User request (via session master): build solid, stunning liquid-glass UI components for the
Electron renderer (apps/ptah-extension-webview, Angular 22, Tailwind + DaisyUI). Focus on
common components with component-level tweaks and small liquid-glass principles on top of
DaisyUI, so Stitch-generated designs can be applied easily. Keep and extend the current chat
look and feel (the user likes it).

Reference: https://liquidglassdesign.com/ui
Foundation under review: PR #1028 "feat(ui) shared UI foundation (Phase A)" (owned by another
session; read-only). User screenshot of its gallery: buttons are flat pill outlines, fields are
plain outlined pills, metric cards and list/detail are flat dark boxes.

Constraints: design only; user must approve design.md before implementation. No build/serve/
dev/e2e/package targets. Verify only with `npm run verify -- -p <projects>` if ever needed.
Electron first. Heavy work delegated to CLI lanes (codex, grok).

## Scope correction (user, 2026-11-09)
"I'm not asking for a completely new design system; I want to build on and enhance the one we
already have."
- Start from the EXISTING system: DaisyUI theme(s), Tailwind config
  (apps/ptah-extension-webview/tailwind.config.js), styles.css/app.css, CSS variables, the
  existing `data-glass-surface` attribute and its styles, libs/frontend/ui surfaces, and chat UI.
- Inventory first in existing-system-audit.md (file:line evidence).
- design.md is an enhancement spec: keep token names, theme names and class conventions; add
  only missing pieces (extra surface tiers, rim light/highlight, states, motion,
  reduced-transparency fallback). Each change states "existing → enhanced" and why.
- Enhance existing components (chat + PR #1028 foundation); reuse DaisyUI classes in use.
- liquidglassdesign.com/ui is only a reference for small refinements, not a new look.
- Prototypes show before/after, with existing styles as "before".

## Direction change 2 (user, 2026-11-09)
"This will end up in a duplication over what we already duplicate across pages. The better
solution is to extract common components and patterns we use across components and build up a
unified system design starting by native elements, going forward."
- Primary deliverable is now a DUPLICATION INVENTORY + EXTRACTION PLAN: find repeated markup /
  class strings / patterns across libs/frontend/* and apps/ptah-extension-webview, then define a
  unified layered component system: native-element primitives (button, input, select, textarea,
  checkbox/toggle, link, dialog) → composites (field, card, stat tile, badge, list row, header,
  toolbar, tabs, menu, modal/drawer, toast, empty/loading/error state).
- Glass refinements (design.md tokens) are applied ONCE inside the primitives, not per page.
- Re-assess PR #1028 against the inventory (it may need to become the primitive layer → maybe B).
- New deliverables: duplication-inventory.md, component-system-plan.md; design.md and
  foundation-1028-assessment.md get revised afterwards.

## Direction change 3 (user, 2026-11-09) — composable shared language, reuse first
- Build a shared language: unify repeated components (with their variations) into a composable
  Angular shared design system, so a fix in one component updates all usages.
- Start with: BUTTON (esp. glass buttons, robust variants), INPUTS, DROPDOWNS (advanced Angular
  dropdowns). Some pages already have advanced dropdowns: find and reuse the best existing
  implementation instead of rebuilding ("be intelligent, avoid repeated work").
- Extract from polished pages first: polished = chat, canvas, voice, setup; semi-polished =
  marketplace, thoth, tasks; poorly polished = machines, reviews (being fixed). Apply to the
  poor pages first.
- Composition: content projection slots, ngTemplateOutlet typed contexts, hostDirectives,
  small variant/size/tone signal inputs, provide*() look-and-feel tokens.
- Behavior from a headless library (Angular Aria already in node_modules and used by #1028
  `ngOption`; CDK in package.json); styling stays DaisyUI + glass tokens in libs/frontend/ui.
- New deliverables: core-controls-reuse-map.md (button/input/dropdown), headless-library-
  evaluation.md; then revise component-system-plan.md and design.md.

## Direction change 4 (user REJECTED bottom-up plan and #1028 option B)

User: "i don't want to start generic then go up i want to go the other way around" and
"this is the opposite of what i want you will be going the other way around which will
definitely cause degradation of already working beautiful pages".

Top-down, extract-from-the-best:
1. Polished pages (chat, canvas, voice, setup, any other rated polished) are the SOURCE OF TRUTH.
   Their look must not change. Do not migrate them onto new generic primitives.
2. Extract the components those pages already use, as they are, into shared components
   (content projection, ngTemplateOutlet, hostDirectives, provide*() look tokens for variants).
   Each extraction from a polished page = ZERO visual difference on that page; plan an Electron
   screenshot-diff check per extraction.
3. Apply extracted components to poorly polished pages (machines, reviews, ...) FIRST.
4. No generic L0/L1 starting point. A token/primitive exists only when it falls out of an
   extraction shared by 2+ pages.
5. Re-assess #1028: what it adds that top-down needs (e.g. @angular/aria) vs what conflicts
   (generic primitives, class-audit rules pushing pages to them). Options: merge only parts that
   do not touch polished pages, reduce #1028, or close it. Never recommend making #1028 more generic.
Deliverables: revised component-system-plan.md, revised foundation-1028-assessment.md, new
polish-map.md. Mark old bottom-up sections SUPERSEDED, do not delete.

### Update: #1028 merged (2026-11-09 19:36Z, head 555409ea3, merge commit bcd76af07)
#1028 is now the main baseline. No "reduce/close" options. The assessment states which merged
parts top-down keeps, which must not be pushed onto polished pages (generic ptahButton adoption,
ui-class-audit rules), and which merged rule needs a follow-up so it does not force polished pages
onto generic primitives. This worktree branch predates the merge: read merged code via
`git show bcd76af07:<path>` or pr-1028.diff.

## Approval (2026-11-09)
User: "approved" — top-down component-system-plan.md and polish-map.md (with the merged-#1028
assessment). Next: Wave 1 (buttons, inputs, dropdowns) extraction with Electron zero-pixel gates.
Before implementation: bring this branch up to main (contains #1028 at bcd76af07).
