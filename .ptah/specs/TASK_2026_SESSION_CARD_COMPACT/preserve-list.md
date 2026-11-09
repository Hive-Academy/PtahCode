# Session card preservation inventory

Every item below is kept or moved. Paths are relative to this worktree. No capability is proposed for removal.

## Card paint and motion

- **Kept**: running, needs, error, done and idle state inks and the 4px left accent; background state blends running and done with `color-mix`. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts:78-108`
- **Kept**: transparent resting fill, hover fill and border, focused primary tint and inset frame, keyboard select ring, and paint-only 180ms transitions. The light theme uses primary-content for frame contrast. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts:57-76,172-197`
- **Kept**: state pill ink contrast mix and newly tinted pill surface; title dot, ellipsis, full title attribute and semibold text. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts:214-219,240-249`
- **Kept**: glass focused glow and callout glow, including forced-colors, contrast and reduced-transparency gates. `apps/ptah-extension-webview/src/styles.css:3940-3967`
- **Kept**: board pane enter and reduced-motion gate. `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-board.component.ts:111-125,235`
- **Kept**: rail FLIP carry/displacement, fresh entrance, shadows and reduced-motion opacity frames. `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-flip.ts:4-93,167-175`; timings `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-motion.ts:1-10`.

## Selection and content

- **Kept**: select button accessible name, aria-current, tabStop, selectRequested; inner button tabIndex. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts:230-237,275-326,337-345,383-395`
- **Kept**: permission Allow, Deny and Open, question Answer, error Output, request IDs and callout group names; ngDoCheck returns focus to selection when a request changes. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts:265-329,422-440`
- **Moved**: dense +N and comfortable +N more into the meta component, with the same aria labels, tabIndex and moreLanes output. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-meta.component.ts:20-29`; forwarding `compact-rail-card.component.ts:260-264,354-358`.
- **Kept**: up to three comfortable lane rows and laneSelected. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts:334-349`
- **Moved**: known todo count/title, linked task ID/full title/aria and missing-task strike, agents, CLI, rounded context and known git diff/title into the meta component. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-meta.component.ts:30-47,64-68`
- **Kept**: branch, model and elapsed comfortable line and reserveActionCorner title clearance. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts:129-131,251-257`

## Canvas wrapper

- **Kept**: menu trigger and keyboard interaction, menu actions and rename popover. `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:247-407,577-770`
- **Kept**: workflow badge and its 20px extension. `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:82,185-189`
- **Kept**: Needs you attention frame, count and dynamic extra height. `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:78-82,134-145,191-221,513-520`
- **Kept**: collapsed 56px mode, accessible collapsed control and frame. `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:82,121-131,155-181`
- **Kept**: board/test data hooks: card state, request ID, rail card, attention count/extra and attention frame. `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts:51,269-326`; `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:76-80,192-194`.

## Proposed Removals

None.

## Note from review

- Dense card with a callout: the callout row takes the meta row place, so the `+N` lanes
  button does not show while a callout shows. This is the same as `main`, where the callout
  branch also replaced the dense `+N` row.
