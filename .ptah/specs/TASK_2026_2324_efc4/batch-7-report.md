# Batch 7 report - Electron visual review fixes on the lane composer

Source findings: `visual-review-2320.md`. No git actions taken. Nothing in `libs/backend/**`,
`subagent-lane-composer*`, `agent-monitor.store.ts` or `claude-rpc.service.ts` was changed.

## Width check (orchestrator correction)

Every finding below was checked against the code and layout logic for a full desktop window.
The review's lane screenshots (`52-agy-state-now.png`, `B1-*`, `L10-*`) were taken at a 1000 px app
width (window minimum is 800 px, so this is a normal window size and not a forced narrow container).
The only forced-width results are the 720/400/320 container sweeps.

- B1/M6 do not depend on width. Before the fix, the composer was `sticky bottom-0` inside the lane panel's own
  scroller, so every transcript taller than the panel scrolled under it at any window size.
- M9 needs a 400/320 px container and is dropped: not reproduced at desktop width.

## Findings

| # | Result | What changed |
| --- | --- | --- |
| B1 | Fixed | The CLI lane panel no longer scrolls. Its `ptah-chat-session-layout` now holds a `[sessionTranscript]` scroller (`flex-1 overflow-y-auto`) and a `[sessionComposer]` slot below it, the same layout as `chat-view.component.html:70,257`. The composer is outside the scroller, so transcript rows cannot pass under it. The flat transcript's auto-scroll finds the new scroller through `findScrollingAncestor` (overflow-y check). The panel keeps `data-glass-surface="chrome"`, the size container and the layout as its direct child, so the glass rule `[data-glass-surface='chrome']:has(> ptah-chat-session-layout)` still applies. |
| M6 | Fixed (same root as B1) | The attachment tray and queued cards are inside the composer, which is now outside the scroller. |
| S2 | Fixed | The lane card adds `chat-composer-column chat-composer-card`, as main chat's `cardClasses` does (`chat-input.component.ts:825`). That brings main chat's focus treatment from `styles.css` ("Active composer" block): no ring on the textarea in glass (`.chat-composer-card textarea:focus-visible { outline: none; box-shadow: none }`, specificity 0,4,1, above the glass 2 px ring plus 5 px halo rule at 0,4,0), a primary frame or glow on the card while focus is inside, and an outline fallback for reduced transparency and more contrast. Forced colours keep the textarea's own outline. The light-glass card also gets main chat's denser fill (`b1 / 0.74`). |
| S3 | Fixed (lane and main chat; both use the shared `queued-message-list`) | Card fill changed from `bg-primary/5` (translucent) to `bg-[color-mix(in_oklch,oklch(var(--p))_5%,oklch(var(--b1)))]`: opaque base-100 with the same 5 % primary tint, theme tokens only, and the same form as an existing class in the repo. |
| S4 | Fixed to at least 4.5:1 (estimate), 6:1 not guaranteed | The lane status line takes `data-glass-surface="plate"`, the same plate as main chat's status line (`chat-input.component.ts:428-430`), and gets `py-0.5`. It now sits outside the scroller, so no transcript text is behind it. See the contrast notes for the remaining gap to 6:1. |
| S5 | Fixed (all `/` lists, main chat included) | The selected-row badge rule in `styles.css` only matched `.badge.badge`, but the row renders `<span ptahBadge>` (`[data-ptah-badge]`), so the gold tint stayed on the gold selection. The selector is now `:is(.badge.badge, [data-ptah-badge])` and gives the inverted pair (pc fill, p ink). |
| M1 | Fixed | `selectedModel` now picks the first of pending, record `model`, catalog `currentModel` and `observedModel` that is not `mixed-model`. `observedModel` can lag a turn behind (`lane-turn-settings.store.ts:15-17`). The id then maps to its catalog row through `findLaneModelOption`: exact match, then case-insensitive id or name, then the longest catalog id that a dated recorded id extends. The pill keeps one display name and the menu marks the row. The compact-bar chip uses the same rules. |
| M2 | Fixed | New optional input `emptyLabel` on `ptah-composer-model-picker` (default `''`, so main chat is unchanged). While no model is known, the lane passes "Loading models…" while the catalog loads, and "{CLI} default" (e.g. "Codex default") once it is ready. |
| M3 | Fixed | (1) An effect clears the last action note whenever the lane starts or ends a run. This removes the stale "Sent. It joined the running turn." and "Queued for the next turn…" (the latter is visible in `52-agy-state-now.png` on a done lane). (2) A send that resumes a stopped lane sets "Sent. {CLI} resumes with your message.", so the stopped-lane hint "Resume with message: …" does not show between the accepted send and the record's switch to running. The hint itself depends on `stopped` (record status). I could not prove from source that it can show during a running turn. The window above is the only path I found. |
| M4 | Fixed | The model and effort menu footer on a stopped lane now reads "Applies from your next message, which resumes the lane." Running lanes keep "…The lane keeps running.", and the next-spawn text is unchanged. |
| M7 | Fixed | `agent-continue-input` passes `agent().displayName \|\| agent().cli` as the lane composer's `cli` label, the same name the header and placeholder already use. That name is the adapter's display name: "Claude", "Codex CLI", "Antigravity". Status texts, the compact bar ("Codex CLI is working…") and the Resume aria-label now use it. The image-block text now shows the lane's own reason (e.g. "Images need a running lane. Remove the image to send.") and no longer a generic "{cli} lanes cannot take images". |
| M9 | Dropped | Not reproduced at desktop width (needs a 400/320 px container). |
| S1, M5 (code), M8, lane header chip | Not in this batch | Not assigned. M5 is covered by the L2 investigation below. |

## Contrast values

Computed from the theme sources (`tailwind.config.js`, OKLCH to sRGB, WCAG 2.x). I took no Electron
screenshots or pixel samples, so the S4 glass figures are estimates.

| Pair | ptah-glass | ptah-glass-light | anubis | anubis-light |
| --- | --- | --- | --- | --- |
| S3 "Queued" label (`base-content`) on the new card | 14.39 | 14.35 | 14.33 | 15.57 |
| S3 status label (`base-content-muted`) on the new card | 11.97 | 6.05 | 5.84 | 5.90 |
| S5 selected badge (`p` on `pc`) | 9.88 | 6.16 | 4.82 | 6.84 |
| S4 status text on opaque base-100 (glass off, reduced transparency) | 13.07 | 6.49 | 6.06 | 6.03 |
| S4 status text on the plate (`b1/0.5`) over the backdrop the review measured | 12.13 | 4.81 | 5.58* | 6.23 |

\* With glass off (anubis default), the plate draws nothing and the opaque row applies.

How the S4 estimate was made: I derived the backdrop luminance from the review's measured ratio (3.43 in ptah-glass-light),
then put main chat's plate over it. 4.81 meets the 4.5:1 minimum but not the design spec's 6. This backdrop was sampled while the
transcript showed through (B1), so the real value after B1 should be the same or higher. The worst case is a black scene pixel
(1.66 with the plate). Reaching 6:1 everywhere in light glass needs a denser shared `--glass-plate`
(about 0.9 alpha: 5.18 on black, 6.13 on the measured backdrop). That token is shared with main chat and pinned by
`glass-scrim.spec.ts`, so I propose it here and did not change it. **Re-measure S3/S4 in Electron.**

## Files

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\canvas\src\lib\canvas-detail\canvas-lane-view.component.ts`: CLI lane uses the transcript and composer slots (B1/M6).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\canvas\src\lib\canvas-detail\canvas-lane-view.component.spec.ts`: pins the new structure (no sticky, composer outside the scroller).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\chat\src\lib\components\molecules\lane-composer\lane-composer.component.ts`: S2 classes, M1 model resolution (`findLaneModelOption`), M2 empty label, M3 note clearing and the resume note, M4 footer, image reason text.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\chat\src\lib\components\molecules\lane-composer\lane-composer.component.html`: status line plate (S4), `emptyLabel` binding.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\chat\src\lib\components\molecules\lane-composer\lane-composer.component.spec.ts`: 6 new tests (S2, M1 x2, M2, M3, M4); image text expectation updated.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\chat\src\lib\components\molecules\composer-controls\composer-model-picker.component.ts`: optional `emptyLabel` input.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\chat\src\lib\components\molecules\queued-follow-ups\queued-message-list.component.ts`: opaque tinted card (S3).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\chat\src\lib\components\molecules\queued-follow-ups\queued-message-list.component.spec.ts`: pins the opaque card.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\libs\frontend\chat\src\lib\components\molecules\agent-continue-input\agent-continue-input.component.ts`: display name as the `cli` label (M7).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\apps\ptah-extension-webview\src\styles.css`: selected-row badge selector (S5).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\lane-parity-followups\apps\ptah-extension-webview\src\app\glass-scrim.spec.ts`: pins the new selector.

## Checks

The worktree has no `node_modules`, and `jest.preset.js` maps `marked` to `<worktree>/node_modules/marked/...`, so every
suite failed with "Could not locate module marked". I ran the focused jest command with one CLI override,
`--moduleNameMapper='{"^marked$":"D:/projects/PtahCode/node_modules/marked/lib/marked.umd.js"}'`. That is the preset's only
mapper entry, pointed at the main checkout. No config file was changed.

- jest chat: `lane-composer.component.spec.ts`, `agent-continue-input.component.spec.ts`, `composer-model-picker.component.spec.ts`: 3 suites, 75 tests passed.
- jest chat: `queued-message-list.component.spec.ts`, `queued-follow-ups.component.spec.ts`: 2 suites, 16 tests passed.
- jest canvas: `canvas-lane-view.component.spec.ts`: 25 tests passed.
- jest webview app: `glass-scrim.spec.ts`: 33 tests passed.
- `npx eslint <11 changed files>`: 0 errors. 5 warnings, all existing `no-explicit-any` in `canvas-lane-view.component.spec.ts:53-57`. `@nx/enforce-module-boundaries` was skipped (no cached project graph).
- `npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`: exit 0, 0 counts over baseline. No new dynamic `[class]` binding: the two lane bindings I touched replace existing ones.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0, 0 unsuppressed sites.
- Not run, per the brief: verify, nx, project tsc, `typecheck-templates`. Template changes (canvas lane view, lane composer html, the picker's new input) are therefore not compiled by ngc here. CI or the coordinator should run `typecheck-templates`.

## Investigation answers (no change made)

### L3: "claude lanes cannot take images"

The Claude manifest does not exclude images:
- `CLAUDE_SDK_LANE_TURN_INPUT.images` is `supported` (`libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts:104`).
- The live handle echoes `supported` for the native lane, because `imageInput` is undefined there (`:676-682`).

The refusal comes from the stopped-lane path:
- Without a live handle (lane ended, or handle released), `resolveEffectiveLaneCapabilities` returns `restoredTurnInput` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-effective-capabilities.ts:105-117`).
- `restoredTurnInput` hard-codes `images: refuse('Images need a running lane.')` at line 112, for every CLI.
- In the review's L3 run, the image was attached after the turn ended, so the lane was stopped.
- The old composer replaced that reason with the generic "${cli} lanes cannot take images" (fixed above: it now shows the lane's own reason).

The previous fix that limits images to the `claude-cli` and `anthropic-api` providers is `ptah-cli-registry.ts:412` and `:1059`. It only feeds `imageInput` for Ptah CLI lanes, not the native Claude lane.

Proposed backend fix (agents B/C own the file):
- In `restoredTurnInput`, keep `declared.images` when the adapter's cold resume can carry image content, for example through a manifest flag `turnInput.images.onResume: true`.
- Set that flag for the Claude SDK lanes, whose resume runs a new SDK turn where `buildUserContent` (`claude-sdk-lane-runner.ts:165-190`) already builds image blocks.
- Then confirm the resume path forwards `turn.images` to the first prompt.
- Until then the refusal is intentional, and the text now says why.

### L2/M5: the lane transcript never echoes what the user typed

The lane transcript renders only provider output:
- `CliOutputSegmentType` has no user type (`libs/shared/src/lib/types/agent-process.types.ts:678-687`).
- The execution tree skips user roots by design: "The prompt renders from `messages`" (`libs/frontend/chat-streaming/src/lib/execution-tree-builder.service.ts:406-413`).
- The lane view has no `messages` list.
- The SDK does not echo a user turn pushed into its input stream. The only user-side text that shows is the SDK's own interrupt marker (`SDK_INTERRUPT_SENTINEL`, `libs/backend/agent-sdk/src/lib/types/sdk-types/claude-sdk.types.ts:494`).

The echo should come from the delivery point:
- `AgentMessageRouter` marks a message `delivered` right after `continueWith(...)` (`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-message-router.service.ts:570-576`), and the interrupt path does the same for its send.
- Recommended: emit one lane output segment there with the full text and sender (for example a new `user-message` segment type, or `info` with a `sender` field), so every lane gets the echo in order with the turn it started.
- A renderer-only option: show the user's `delivered` receipts from `AgentDeliveryStore` inside the transcript. This is weaker: receipts hold a `preview`, not the full text, and have no position in the segment stream.
- Both touch backend or shared files owned by other agents, so I made no change.

## Decisions

- Desktop-width scope (orchestrator correction): B1 kept, because it depends on transcript length, not width. M9 dropped. Reversible.
- S4: kept main chat parity (plate) and did not use a lane-only opaque strip. The earlier canvas spec explicitly rejected a "hard box" strip, and the brief asks for main chat's surface. Reaching 6:1 needs a shared `--glass-plate` change (proposed above). Reversible.
- M2 label "{CLI} default" once the catalog is ready. It matches the existing catalog naming ("GPT-6.2-Sol (Codex default)" in `43-codex-resume-running.png`). Reversible.

## Out-of-scope observations

- The sub-agent lane (`sub:` keys) still uses the scrolling `LANE_PANEL_CLASS`. Its composer is owned by agent A. If it is also sticky inside that scroller, it needs the same slot layout.
- `lane-composer.component.ts` (745 lines before this batch) grows by about 50 lines. The model resolution helper could move to its own file if the file keeps growing.
