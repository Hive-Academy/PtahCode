# Phase 1 code review

**Verdict: REVISE**

## Blocking

None.

## Serious

### An open popover can retain the previous cap mode

Evidence: `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:107`, `:259`, `:408`, `:437`. The template reacts to `capToViewport`, but the lifecycle effect tracks `isOpen` alone. The positioning service captures `capHeight` when it sets up auto-update. Calling `reposition()` reruns that same configuration.

Failure: switch an open panel from capped to uncapped. Its overflow class goes away, but the inline `max-height` stays and subsequent auto-updates can write it again. Switching from uncapped to capped applies overflow styles without starting height measurement.

Fix: refresh positioning when the cap changes on an open panel, clear the inline height when disabling it, and keep the existing layer and focus in place.

### Superseded positioning passes can overwrite the live height

Evidence: `libs/frontend/ui/src/lib/native/shared/floating-ui.service.ts:198`, `:218`, `:228`, `:280`. The coordinates are guarded by the request token and update sequence. The middleware writes `maxHeight` during the asynchronous computation, outside both guards.

Failure: two computes for the same open element overlap during a resize or explicit reposition. An older `size.apply` can leave its height on the panel after a newer pass has positioned it, pairing current coordinates with stale height. After close, an in-flight write still reaches the outgoing node. An ordinary close/reopen creates a fresh node, so that old write cannot carry its height into the new node.

Fix: give each compute a middleware callback guarded by the same liveness check as its coordinates. Add an overlapping-update test that checks the final height and coordinates together.

### Four existing popover scroll regions now sit inside a second scroll region

Evidence: `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:145`, `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts:307`, `libs/frontend/chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.html:124`, `libs/frontend/chat/src/lib/settings/ptah-ai/lanes-table-detail.component.html:265`, and `libs/frontend/chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.html:196`.

Failure: open a long Capabilities list in a short window. The list keeps its 18rem scroll box while its parent gets a smaller viewport cap. The user can scroll the list and still need to scroll the outer panel to see the bottom of that inner box. The catalog list and preferred lane order have the same structure. Panel-level `overscroll-behavior: contain` does not remove either scroll region.

Fix: give each panel one vertical scroll owner. For these Settings callers, which Phase 1 explicitly keeps capped, remove the redundant inner height/overflow or make the inner scroller the only one and propagate the available height to it.

### Shell mode has two competing maximum widths

Evidence: `libs/frontend/ui/src/lib/native/modal/native-modal.component.ts:67`, `:84`, `:208`. The preset and viewport cap are both utilities for the same CSS property on the same element. HTML class order does not combine their bounds.

Failure: a shell must meet both the 24rem limit of `sm` and the viewport-minus-2rem limit. With one declaration winning, either a large-window `sm` can exceed 24rem or a small window can lose the 2rem limit. For example, daisyUI's `.modal-box` width is 91.667%, which already exceeds `100vw - 2rem` at 320px.

Fix: emit one shell max-width, such as `min(var(--ptah-modal-size), calc(100vw - 2rem))`, with the preset setting the variable. Keep the existing preset utility in plain mode.

## Minor

### Capped panels clip projected shadows and constrain the rail handoff feedback

Evidence: `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:107`, `:145`, `libs/frontend/chat/src/lib/components/templates/app-shell.component.html:258`, `libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts:294`, `:424`, `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:294`, `:395`, and `libs/frontend/chat/src/lib/components/molecules/send-to-messaging/send-to-messaging.component.ts:34`, `:139`, `:460`.

Failure: the New Session card and the two score cards place a `shadow-lg` inside the panel's `p-2` inset. Its downward ink extends past that inset, so the new scroll box clips it even when the card fits vertically. The rail Session actions menu also contains the handoff result, an absolutely positioned status box with a shadow. A successful attach closes the inner picker and renders that status below the handoff row, within the now-clipped actions menu. When the menu is already height-capped, the result cannot paint past the panel viewport.

Fix: put the card shadow on the floating panel itself or give the projected card enough scroll-box inset. Keep the Settings score cards capped. Make the rail's result an in-flow status row or render it in an existing toast surface outside the scroll box.

### Narrow navigation loses half a rem between the strip and content

Evidence: `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.ts:215`, `:317`, and `libs/frontend/ui/src/lib/tokens/ptah-tokens.css:24`, `:566`. The report assumes the group gap and page gutter are equal. The viewport media query reduces only the gutter from 1.5rem to 1rem.

Failure: open the existing Settings page at a 600px viewport. The gap from the nav strip to the main content was 1.5rem on main. It becomes 1rem with the new padding owner. There is also a fractional container interval above 639px and below 640px where neither nav padding branch applies after the frame padding is removed. At 640px and wider, a navigation instance with zero tabs also loses the original second gutter. I found no production caller with an empty navigation list.

Fix: preserve `--ptah-gap-group` as the main column's narrow block-start spacing while moving the frame inset to the main column. Make the mobile nav inset the baseline and override it at the desktop container breakpoint. Preserve the empty navigation case or document and test the deliberate compatibility change.

### The card rule replaces Output style's padding and stacks on some form sections

Evidence: `apps/ptah-extension-webview/src/styles.css:3245`, `libs/frontend/chat/src/lib/settings/output-style/output-style-config.component.ts:63`, and `libs/frontend/ui/src/lib/patterns/form-section/form-section.component.ts:53`.

Failure: in glass-on Settings, Output style loses its 1.5rem block padding. The new higher-specificity shorthand sets it to 1.25rem along with the new horizontal inset. On Membership, Claude Code tools, and VS Code language model, the rule instead adds 1.25rem on the form-section host while the inner section keeps its 1.5rem block padding. Agent behaviour, MCP & Browser and Fine-tuning also stack card padding around a padded form section. Evidence for those placements is in `license/license-status-card.component.ts:108`, `pro-features/claude-builtins-config.component.ts:88`, `pro-features/vscode-lm-config.component.ts:47`, `pro-features/agent-behaviour-section.component.ts:127`, `pro-features/mcp-port-config.component.ts:89`, and `advanced-settings.component.ts:167`, relative to `libs/frontend/chat/src/lib/settings`.

Fix: preserve Output style's block inset with a specific local rule if it still owns that spacing. Use one block inset on the newly padded form cards, either on the card or on the inner form section, scoped to the affected glass-on cards. Keep the global fallback lower in specificity than component padding overrides so the intended three voice-card exceptions are independent of injection order.

### The new specs leave rendered geometry and cap lifecycle untested

Evidence: `libs/frontend/ui/src/lib/native/shared/floating-ui.service.spec.ts:321`, `:335`, `libs/frontend/ui/src/lib/native/popover/native-popover.component.spec.ts:279`, `libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts:222`, `:238`, `:308`, and `libs/frontend/ui/src/lib/patterns/settings-layout/settings-layout.component.spec.ts:275`, `:362`.

Failure: the service test calls the captured `apply` directly and checks the raw CSS value. The component tests mock positioning or check tokens and classes. Both can pass with the live cap bugs above, with conflicting shell widths, and with lost narrow nav spacing. The modal shell tab-wrap test, drawer close-click test, and row hint/projection tests do assert behavior or DOM relationships. The shell scroll, settings geometry, and row alignment/trim checks rely on class names.

Fix: add mocked overlap and live input transition tests that assert final height/coordinates, clear on disable, and cover close/reopen using fresh elements. In the coordinator's Electron pass, assert effective cap and scroll ownership, modal width and scroll geometry, and navigation spacing around the viewport and container breakpoints. Exercise the first and last row's actual padding and the empty action slot in that same pass.

## Verified

- **Scope.** The 22 paths modified in the working tree have identical baselines at `HEAD` and local `main`. The unrestricted `git diff main -- libs apps` includes 232 paths, so I isolated the 22 working-tree edits and reviewed the Phase 1 contract. I used Ptah workspace analysis and read-only Git and `rg` for the diff and literal selectors. Native skill invocation was unavailable in the exposed tool list, so I read the repository's Angular frontend patterns skill directly.
- **Plain modal.** All nine production modal templates continue to use plain mode, including task creation, skill consent, the quarantine and reconciliation dialogs, editable-section discard, account removal, catalog, CLI add, and tier mapping. `native-modal.component.ts:98–133` keeps header, default content, footer, then backdrop in the same order. The three wrappers add DOM ancestry while `display: contents` preserves box layout. I found no production `.modal-box > …` stylesheet rule or direct-child query relying on the old slot ancestry. The focus trap still queries descendants and excludes the external backdrop button. Escape propagation, native cancel, backdrop click, inert state, and destroy close use the same code as main (`native-modal.component.ts:182–194`, `:224–273`).
- **Setting row and form section.** Existing projected controls remain direct children of `[data-ptah-setting-control]`, preserving the field and rich-select selectors in `ptah-field.css:23` and `ptah-select.css:30`. The action box is empty for existing callers. Start alignment, row density, dividers, derived hint IDs, and label relationships stay the same (`setting-row.component.ts:25–88`). The form-section wrapper retains the title ID, heading level, `tabindex="-1"`, and heading-before-description order. No production caller was found that selects the heading as a direct child. Its default wrapper has no extra margin or padding (`form-section.component.ts:53–94`).
- **Settings layout.** With tabs mode, both the gap and frame padding and the existing 768px split stay in place. Tabs mode with no tabs keeps a single frame gutter. Navigation with tabs moves the inset to the main column and keeps the two-column arrangement at container widths of at least 640px. The narrower and empty-navigation differences are recorded above. The page icon precedes the heading and the navigation state mark gains its existing label as a native title (`settings-layout.component.ts:193–235`, `:310–327`).
- **Accessibility.** Section and page icons and the drawer X are `aria-hidden`. The drawer close control retains its button, accessible name and spot in the focus order (`native-drawer.component.ts:100–111`, `:308–333`). The projected row action, when present, follows meta and precedes the primary control in the DOM. The drawer tooltip is hover-only, including when keyboard focus returns to the button later. This is a reasonable deviation for the existing auto-focus behavior because the tooltip text duplicates the button name and avoiding the focus-triggered top layer keeps the opening experience intact. If a visible keyboard tooltip is required, suppress just the initial programmatic focus and let subsequent keyboard focus open it (`tooltip.directive.ts:21–24`, `:47–65`).
- **Popover sizing.** The uncapped middleware remains offset, flip and shift. Capped middleware runs size after best-fit flip and shift, floors the available height, sets the requested 128px lower bound on the computed pixel term, and respects the token upper bound. Forwarding the same boundary to size is justified. The installed Floating UI implementation uses the full clipping height when vertical shifting is enabled, which matches the existing `keepInViewport` behavior of allowing anchor overlap. The 128px floor can exceed the space on the chosen side when cross-axis shift is off. The failure fallback applies the token and anchors under the trigger without measuring available space. These are limits of the specified policy and fallback (`floating-ui.service.ts:176–217`, `native-popover.component.ts:373–386`).
- **Card cascade.** The global rule is specificity `(0,4,0)`. The default Angular emulated `:host-context` ancestor branch also has four attribute selectors after adding host and content scope. The component rule wins a tie when inserted later. The zero vertical insets in `voice-config.component.ts:169`, `go-vet-consent-config.component.ts:264`, and `voice-elevenlabs-summary.component.ts:42` therefore survive that order. Equal padding declarations on one element do not add up. The Setup card's inline zero at `settings.component.html:146` still wins. The confirmed stacking and utility replacement involve the cards listed in the finding above.
- **Other deviations.** Defining `--ptah-icon-lg` is justified because the planned utility already references it and the baseline had no definition. Splitting the row trim classes into individual keys, putting the action after meta, and using modal part data attributes preserve the intended contracts. The modal layout type is available in its declaring module, and the barrel omission does not prevent template binding. The glass-on shadow suppression gives up the requested scroll cue in that theme. The solid local gradient covers in `native-modal.component.ts:139–149` explain the choice given the separate glass fill in `styles.css:3164–3195`. Electron still needs to establish whether the borders give an adequate result for the design.

### Popover caller inventory

51 production template sites found across `libs/frontend` and `apps`, with all actual sites under `libs/frontend`. The five planned opt-outs are present. The table covers all 46 remaining sites. “Safe” means the content structure has no confirmed nested scroll or out-of-panel paint conflict from the cap. It is a static assessment, with the viewport and lifecycle limits above applying to every capped site.

Paths below are relative to `libs/frontend`.

| Caller | Cap review |
| --- | --- |
| `canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:258` | Safe. Rename form is in flow. |
| `canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:268` | Clips out-of-panel paint from the absolute handoff result. The picker itself opens in its own top layer. |
| `canvas/src/lib/orchestra-canvas.component.ts:115` | Safe. New-session form is in flow. |
| `chat-ui/src/lib/molecules/permissions/deny-message-popover.component.ts:40` | Safe. Denial form is in flow. |
| `chat/src/lib/components/molecules/chat-input/chat-input.component.ts:353` | Safe. The attach menu is in flow. The textarea cap is outside it. |
| `chat/src/lib/components/molecules/mcp-status-chip.component.ts:25` | Safe. The server list is in flow. |
| `chat/src/lib/components/molecules/send-to-messaging/send-to-messaging.component.ts:93` | Safe. The binding picker is in flow. The component's absolute status UI is outside the picker. |
| `chat/src/lib/components/templates/app-shell.component.html:238` | Clips the projected New Session card shadow. |
| `chat/src/lib/settings/advanced/advanced-settings-group.component.ts:144` | Safe. Help paragraph. |
| `chat/src/lib/settings/license/license-status-card.component.ts:170` | Safe. Membership key form is in flow. |
| `chat/src/lib/settings/output-style/output-style-list.component.ts:215,312` | Safe at both sites. Preview and help text. |
| `chat/src/lib/settings/output-style/output-style-notices.component.ts:68,104,127` | Safe at all three sites. Missing, collision, and fallback explanation text. |
| `chat/src/lib/settings/output-style/output-style-parity-section.component.ts:97` | Safe. Parity explanation. |
| `chat/src/lib/settings/pro-features/agent-behaviour-section.component.ts:239` | Safe. Ultracode explanation. |
| `chat/src/lib/settings/pro-features/mcp-port-config.component.ts:193,231` | Safe at both sites. External caller and localhost explanation text. |
| `chat/src/lib/settings/providers/main-agent-scope-badges.component.ts:56` | Safe. Scope rows are in flow. Their inner popover opens in its own top layer. |
| `chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:174` | Safe for the absolute Close control. It is inset at top-right of the relative editor at lines 225–228. The model picker is in flow. |
| `chat/src/lib/settings/providers/providers-settings.component.ts:278` | Nested scroll. The catalog list already has `max-h-64 overflow-y-auto`. |
| `chat/src/lib/settings/providers/setting-scope-row.component.ts:97` | Safe. Scope explanation is in flow. |
| `chat/src/lib/settings/ptah-ai/agent-orchestration-config.component.html:97` | Nested scroll. The order panel already caps and scrolls. The absolute lane drag markers are inset inside rows. |
| `chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts:238,363` | Clips the projected score-card shadow at both sites. |
| `chat/src/lib/settings/ptah-ai/claude-lane-account-cell.component.ts:74` | Safe. Account options are in flow. |
| `chat/src/lib/settings/ptah-ai/cli-lane-default-cell.component.ts:103,231` | Safe at both sites. Default actions and reset content are in flow. |
| `chat/src/lib/settings/ptah-ai/go-vet-consent-config.component.ts:132` | Safe. What-runs explanation. |
| `chat/src/lib/settings/ptah-ai/lanes-table-detail.component.html:28,101,162,204` | Safe at all four sites. Permission, capability help, installation or probe, and credentials content are in flow. |
| `chat/src/lib/settings/ptah-ai/lanes-table-detail.component.html:244` | Nested scroll. All capabilities has `max-h-72 overflow-auto`. |
| `chat/src/lib/settings/ptah-ai/lanes-table.component.html:270,327` | Safe at both sites. Model and effort picker content is in flow. |
| `chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.html:173` | Nested scroll. Capability list already has `max-h-72 overflow-auto`. |
| `chat/src/lib/settings/ptah-ai/ptah-cli-instances.component.html:280,371,428` | Safe at all three sites. Action menu, model, and effort content are in flow. |
| `chat/src/lib/settings/ptah-ai/web-search-provider-rows.component.ts:47` | Safe. Provider information is in flow. |
| `dashboard/src/lib/components/plan-limits/provider-limit-card.component.ts:133` | Safe. Description list is in flow. |
| `git-ui/src/lib/review-canvas/comparison-bar.component.ts:99` | Safe. Comparison options are in flow. |
| `marketplace/src/lib/ui/removal-lock-badge.component.ts:46` | Safe. Lock instructions are in flow. |
| `ui/src/lib/surfaces/field.component.ts:114` | Safe. Inline field help uses the cap as its scroll owner. |

## Not checked

- Electron rendering, computed geometry, scroll shadows, and screen reader output. The requested independent review was static and the coordinator's Electron acceptance pass remains separate.
- Test execution, builds, Nx, verify, and results of the check already in progress. Test findings come from reading the specs.
- Later redesign phases and the unrelated changes between this branch and local `main`.
