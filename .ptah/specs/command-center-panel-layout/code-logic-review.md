# Code Logic Review — command-center-panel-layout

Scope: uncommitted diff on `fix/command-center-panel-layout` (8 files in `libs/frontend/command-center` and `libs/frontend/chat`). I read the whole of `command-scene-renderer.ts` (label write path), `command-scene.component.ts`, `command-overlay-positioner.ts`, `panel-resize.service.ts`, `resize-handle.component.ts` and the page CSS/HTML. I did not run tests; the caller reports the scoped verify passing.

| Metric | Value |
| --- | --- |
| Score | 7/10 |
| Verdict | REVISE (small, cheap fixes; no blocking defects) |
| Blocking | 0 |
| Serious | 0 |
| Moderate | 3 |
| Minor | 3 |

## Answers to the requested checks

### (a) `[style*='translate3d']` reveal — CORRECT in every positioned state
- The only code that positions a plate is `scene/command-scene-renderer.ts:632-645`. A plate with `node.labelRect` gets `style.transform = translate3d(...)`; one without gets `display:none`, so it is never meant to be seen.
- `setSnapshot` clears `labelStyles` (`command-scene-renderer.ts:143`). The next `draw` then sees `previous === undefined` and rewrites the transform, so a visible plate always ends up with the inline transform.
- Rounded zero (`translate3d(0px,0px,0)`) still contains the substring.
- Reduced motion only sets `active = false` (`:252-255`). `invalidate()` still schedules one `draw`, so plates are placed.
- There is no non-WebGL renderer. When the 2D context is missing, `canvasUnavailable` is emitted and the page does not render the stage, so the overlay never exists.
- The one case that stays hidden is a stage that is off-screen or in a hidden tab (`setHidden`, `command-scene-renderer.ts:191-201`). The plates are not at a position anyone can see, so this is fine.
- The `[style.visibility]` binding now emits `null`. Angular removes only that property, so the inline `translate3d` survives and the CSS rule reveals the plate. Inline `hidden` still wins for label-suppressed nodes (`visibleLabelIds`).

### (b) Hover card, pointer events, clip
- The hover card (`fixed z-20`, `command-overlay.component.ts:198`), the card anchor and the bridge are outside the new wrapper, so they are not clipped. The card keeps its stacking order: the wrapper's `clip-path` stacking context sits at z-auto, below `z-20`/`z-19`.
- The wrapper is `pointer-events-none` and the plates are `pointer-events-auto`, so hit-testing is unchanged.
- The `MutationObserver` in `command-overlay-positioner.ts:58-64` observes `firstLabel.parentElement`. That is now the wrapper, which still contains every plate, so style changes on plates are still seen. Wrapper style changes are filtered out because the wrapper has no `data-node-id`.
- The clip is a no-op for real placements. Layout clamps labels to `top = reservedTop + 10 + 6` (`command-scene.component.ts:193`, `scene-layout.ts:163`), so a positioned plate is never cut. The side and bottom margins are at least 6px, which covers the 4px focus ring. Only the 24px drop shadow can be trimmed at the bottom, which is cosmetic.

### (c) Drag math
- Without `container`: identical to before (`resize-handle.component.ts:58-63`, `innerWidth - x`, default clamp argument). No chat regression.
- With `container`: `rect.right - paddingRight - pointer.x` is the correct content-edge distance. See defect 2 for the clamp base.

### (d) `--rail-width`, dragging, stacked layouts
- The `--rail-width` binding and the `rail-dragging` class both read signals in an OnPush template, so they update together. `null` removes the property and the fallback widths apply. This is OK.
- `onDragEnded` always resets `dragging`.
- For the stacked layout and the breakpoints see defects 1 and 3.

### (e) Page-scoped `PanelResizeService` — OK
- `ChatViewComponent` provides its own `PanelResizeService` (`chat-view.component.ts:222`). The embedded chat view is created through `NgComponentOutlet` with an environment injector (`session-embed.component.ts`), so it never reaches the page provider. `AgentMonitorPanelComponent` and `display-sidebar-wiring` are not instantiated directly in the Command Center subtree.
- The only consumers of the page-scoped instance are the page and the new handle. The page spec confirms it differs from the root instance.

### (f) Nx boundaries — OK
`command-center` already imported `@ptah-extension/chat` in a dozen files, and `PanelResizeService` and `ResizeHandleComponent` are both exported from the chat barrel (`services/index.ts:81`, `components/index.ts:44`). The diff adds no new project dependency.

## Defects

### 1. Resize handle is live in the stacked (<=720px) layout — Moderate
- File: `command-center-page.component.css:33` (720px container block) together with `command-center-page.component.html:187`.
- Scenario: the 720px block switches `.layout` to `display:flex`, so `grid-template-columns` and `--rail-width` are ignored. The handle is still absolutely positioned at the left edge of the full-width rail.
- Impact:
  - The user sees a `col-resize` cursor and a drag target that visibly does nothing.
  - A drag or double-click silently changes `customWidth`, and the rail jumps to that width when the window is widened again.
  - A 6px strip over the rail edge can steal touch gestures.
- Fix: add `.rail-resize-handle { display: none; }` to the `@container (max-width: 720px)` rule. Optionally also gate the handle in the template.

### 2. Clamp base ignores grid padding — Moderate (visible only at the 75% cap)
- File: `resize-handle.component.ts:71`.
- Scenario: `setCustomWidth(..., container.clientWidth)` clamps to `0.75 * clientWidth`, which includes the 32px of horizontal padding. The CSS cap `min(..., 75%)` resolves against the content box (`clientWidth - 32`).
- Impact: when dragging toward the cap, the stored value can exceed what is rendered by up to 24px. The rail stops following the pointer, and the stored width then reads as "wider than shown" after a window resize.
- Fix: pass the content width: `container.clientWidth - paddingLeft - paddingRight`. Read both paddings from the same `getComputedStyle` call you already make.

### 3. Width tiers use viewport `@media`, narrow bands use container width — Moderate
- File: `command-center-page.component.css:2,4,5`.
- Scenario: the page sizes everything else with `@container` (host is `container-type: inline-size`), but the 440/540 tiers use `@media (min-width)` on the viewport. The old `<=1000px` container band pinned the rail to 240px. That clause was removed.
- Impact: where the container is narrower than the viewport (any left chrome or sidebar), the rail takes 360-540px of a 721-1000px container. The stage then gets about 160-500px, which is too narrow for the scene, the stats band (`@container min-width:1100` row layout) and the dock. The 75% cap only stops the total collapse.
- Fix: express the tiers with `@container (min-width: ...)` thresholds (for example 360 default, 440 at a container width of 1100 or more, 540 at 1300 or more). Alternatively keep the viewport tiers and add a container clause such as `min(var(--rail-width, 360px), 40%)` for the 721-1000 band. Match the chat sidebar's numbers by container width, not viewport width, if the intent is "same proportions".

### 4. Missing tests for the changed behaviour — Moderate (spec quality)
- Files: no spec for `resize-handle.component.ts`. Page spec `command-center-page.component.spec.ts:239,668`. Overlay spec `command-overlay.component.spec.ts:84`.
- Gaps:
  - Nothing asserts the container branch of `onDragMoved`: padding subtraction, `clientWidth` argument, or the unchanged no-container path (the chat regression the task cares about).
  - Nothing asserts that the `.rail-dragging` class follows `dragging()`.
  - The overlay "clips unpositioned plates" test checks only the wrapper's `clipPath` string and `transform === ''`. It never checks the reveal contract. At minimum assert that `command-overlay.component.css` contains the `.command-plate{visibility:hidden}` and `[style*='translate3d']` pair (the page spec already uses this CSS-text style), or set an inline transform on a plate and assert it is not hidden.
  - The 1000px assertion (`:668`) does `.split('}')[0]`, so it inspects only the first rule in the block. It passes today, but it would miss `grid-template-columns` added to a later rule in that block.
- Fix: add `resize-handle.component.spec.ts` with a stubbed `CdkDragMove` and a fake container (`getBoundingClientRect`, `clientWidth` and padding via `style`). Cover both branches, plus dragging-class and CSS-pair assertions.

## Minor and non-blocking notes
- `command-center-page.component.css:2`: `transition: grid-template-columns 200ms` is unconditional. Double-click reset and breakpoint changes animate the stage width, so the stage `ResizeObserver` re-lays-out the canvas every frame for 200ms. It also has no `prefers-reduced-motion` guard. Consider gating it behind `@media (prefers-reduced-motion: no-preference)`.
- `command-overlay.component.ts:59`: the clip is `inset(Npx 0 0)`. If a future shadow or outline is larger than the layout margin it will be clipped at the left, right and bottom. `inset(Npx -24px -24px -24px)` would make it top-only. Not needed today.
- `statsBandHeight` starts at 72 (`command-center-page.component.ts:331`) while the CSS default band is 144px below the 1100px container width, so the clip is wrong until the `ResizeObserver` fires. This is harmless because plates are hidden until placed.
- The handle is inside the rail (6px at its left border). The 12px column gap is not grabbable, and the handle has no keyboard or `aria-valuenow` support. Both match the existing chat handle, so I did not treat them as defects.
- Drag math compares `pointerPosition` (page coordinates) with `getBoundingClientRect` (viewport coordinates). This only matters under horizontal page scroll, which the Electron shell does not have. The chat path makes the same assumption.
- The old comment about `RAIL_MIN_CONTENT_WIDTH` and "Widen the window" was dropped from the CSS. No code references it any more. With the service minimum of 300px this is consistent.

## Verdict
REVISE: apply defects 1 and 2, and add the specs from defect 4. Defect 3 is a product-judgement call. If the design really is "match the chat sidebar", record that decision; otherwise move the tiers to container queries. The plate-reveal and clip logic (check a) is sound and needs no change.
