# Code Logic Review — TASK_2026_2329_dd39

| Metric | Result |
| --- | --- |
| Verdict | NEEDS_REVISION |
| Score | 5/10 |
| Blocking | 0 |
| Major | 5 |
| Minor | 1 |
| Failure modes | 6 |

The focused settings and overlay suites pass, including the new child-first dismissal cases. The implementation has material gaps in two acceptance paths and breaks consumers of the shared popover. Those failures put it below the sound band. The core portal, submit, defaults, and evidence-summary paths are wired and exercised, which puts it above the foundation-level failure band.

## Five logic questions

1. **How does it fail silently?** A background role can show a concrete built-in model even when the runtime resolves the role alias through a configured tier mapping. The UI still looks resolved. See finding 2.
2. **What user action produces unexpected behavior?** Opening an attachment menu while the composer is compacting moves focus outside the region the composer tracks. Scrolling an unregistered Settings pane can also leave an overlay at its prior position. See findings 3 and 5.
3. **What data produces a wrong answer?** A saved OpenRouter curator override with revoked credentials and an active Claude Subscription keeps OpenRouter as the UI catalog target even though the curator falls back to its active provider after an auth failure. See finding 1.
4. **What happens when a dependency fails?** The picker clears the old list on provider changes, exposes catalog error and retry state, and guards async completions with a generation counter at `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts:775`, `:877`. The remaining failure is choosing the stale provider before starting that otherwise guarded load.
5. **What was missing from the requirements?** The shared primitive changes where other renderer features find projected content and whether DOM events reach their hosts. Composer activity and Canvas test queries still assume host descendants. See findings 3 and 4.

## Failure modes and fixes

### 1. Major — A saved, unusable OpenRouter curator override still fetches OpenRouter

`libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:880` initializes the draft from the saved provider even when the route says that provider needs a key. The picker prioritizes that draft at `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts:624` and excludes only unsupported IDs from catalog requests at `:866`. The separate readiness check at `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts:863` has no effect on the load. With saved `curatorProvider: 'openrouter'`, an OpenRouter `needs-key` connection, and active Claude Subscription, opening the row can request OpenRouter and show its key error. The curator rides the active provider after a provider auth failure at `libs/backend/agent-sdk/src/lib/curator-llm-adapter/sdk-internal-query.curator-llm.ts:309`. The new regression spec at `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.spec.ts:794` puts OpenRouter in a stale route response and leaves the stored assignment blank.

**Fix.** Feed the editor a role-specific effective provider and a separate saved override. For a saved override the runtime falls back from, load the effective catalog without rewriting the saved value. Keep the explicit-provider flow for a user choosing another provider. Add the test with a saved OpenRouter override, a missing key, and a ready Claude Subscription route. Assert zero OpenRouter catalog calls.

### 2. Major — The model named as the role default can differ from the dispatched model

`libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts:188` and `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts:701` derive the displayed default from provider metadata. The curator sends a tier alias for a blank model at `libs/backend/agent-sdk/src/lib/curator-llm-adapter/sdk-internal-query.curator-llm.ts:367`. Its runtime resolution checks configured environment mappings before static provider tiers at `libs/backend/auth-providers/src/lib/auth/model-resolver.ts:75`. A provider with a custom Haiku mapping can therefore display its factory model in both the row and picker while work runs on the custom target.

**Fix.** Use the effective role tier resolution for both displays. When the renderer only knows the tier alias, display that alias until it has a resolved model. Cover a customized tier and a provider without a static tier mapping.

### 3. Major — An open composer menu no longer keeps the composer expanded

`libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:39` portals the panel outside the composer subtree and `:142` focuses it. `libs/frontend/chat/src/lib/directives/composer-activity.directive.ts:44` listens for native toggle events on that subtree and `:58` clears focus state when focus leaves it. The main chat and lane composer use those signals to hold the expanded form during streaming at `libs/frontend/chat/src/lib/components/molecules/chat-input/chat-input.component.ts:768` and `libs/frontend/chat/src/lib/components/molecules/lane-composer/lane-composer.component.ts:643`. Opening a composer popover while streaming can therefore compact the composer during menu interaction.

**Fix.** Track open overlays by their trigger’s owning composer via their open and detach lifecycle. Keep the composer active until the last owned overlay closes or is destroyed. Exercise both streaming composer types through focus transfer into the portal and back.

### 4. Major — The Canvas rail action-menu suite fails after the shared migration

`libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.spec.ts:775` searches the fixture host for a menu that now attaches through the portal at `libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:39`. The same consumer applies a direct-child panel class at `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:259`, which cannot style the portaled panel. The focused Canvas suite fails with 34 failed and 22 passed tests. The failures include tests for available actions and menu keyboard behavior.

**Fix.** Update fixture queries to the owning popover’s panel or test OverlayContainer while retaining the action and keyboard assertions. Move the panel style to a supported panel-level class. Audit other shared consumers for host-local queries, direct-child CSS, and native dialog or popover selectors.

### 5. Major — Connected panels miss scroll events from Settings scroll containers

`libs/frontend/ui/src/lib/native/popover/native-popover.component.ts:40` and `libs/frontend/ui/src/lib/form-controls/rich-select/rich-select.template.ts:50` use the CDK connected overlay defaults. Its reposition strategy observes the document and registered CDK scrollables. The actual settings page scroll element at `libs/frontend/chat/src/lib/settings/settings.component.html:1`, Providers page at `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts:134`, and the Main agent editor body at `libs/frontend/chat/src/lib/settings/providers/main-agent-reassign-popover.component.html:68` scroll without that registration. Scrolling the Main agent editor with its account or provider select open can move the trigger while leaving the child panel in its previous position. Resizing the panel or anchor is a distinct event and does not cover such a scroll.

**Fix.** Register the trigger’s actual scrolling ancestors or supply an ancestor-scroll strategy scoped to the open layer. Connect the Main agent’s height fitting to changes in trigger position as well. Test a nested picker while scrolling the real editor body and an anchored popover while scrolling the Settings pane.

### 6. Minor — Focus-trap assertions now test setup more than behavior

`libs/frontend/ui/src/lib/native/modal/native-modal.component.spec.ts:145` checks a focus sentinel. The replacement coverage exercises nested Escape and focus restoration, but sentinel existence does not show what Tab and Shift+Tab do at the ends of the modal or during transfer from the child search. The Main agent spec likewise dropped its former Tab-boundary assertions with the switch to CDK.

**Fix.** Add behavior coverage that moves forward and backward across the dialog and popover boundaries with the child both open and closed. Verify the open child receives the first Escape, focus returns to its trigger, and parent dismissal returns focus to the opener. Use Electron for real browser tab order.

## Data flow and requirements

| Path | Status | Evidence or gap |
| --- | --- | --- |
| Overlay lifecycle | Partial | Dialog close disposes its ref and drains registered children. Rich-select detach releases its observer and timer. The focused suites cover detach, destroy, Escape, and backdrop ordering. Findings 3–6 cover shared-host and positioning gaps. |
| CLI lanes and Defaults | Implemented | The lanes test covers the single Defaults action and the permission confirmation. Electron sizing across the 400, 640, and 950 px layout tiers is unverified. |
| Provider and instance subforms | Implemented | Instance footer submit is linked to the form. Wizard Done replaces the saved-state submit control. Tier and Main agent focus and measurements target the open panel. The focused suites pass. |
| Background models | Partial | The blank-draft path waits for a ready route and handles late results. Stored unusable overrides and customized tier defaults remain unresolved in findings 1–2. |
| Routing evidence | Implemented | The view filters to sampled cells, keeps details and funnels in disclosures, and handles overlapping aggregate counts. Its focused suite passes. |

## Verification and decisions

- Reviewed the 56-file `git diff main`, changed files, task context, implementation plan, batches, and five batch reports. Read the root `CLAUDE.md`. Ptah file search returned zero for the hidden task folder and directory instructions, so native `rg --files` checked those paths. Ptah source reads supplied the task records and changed source.
- Focused Jest passed for UI (4 suites, 50 tests) and chat (8 suites, 291 tests). Focused Canvas Jest failed (1 suite, 34 failures, 22 passes).
- Scoped Ptah TypeScript diagnostics timed out on both requests. Electron geometry, actual Tab traversal and Angular template compilation remain unverified. Browser status showed no connected renderer.
- Treated saved configuration and runtime resolution as separate values. The alternative would present the saved provider as active in every case, which conflicts with the explicit runtime fallback and the no-unused-provider acceptance case. The display and catalog decision is reversible and does not require a settings migration.

## Verdict

Revise. Confidence is high for the static data-flow issues and the demonstrated Canvas regression. Electron layout and focus behavior still need rendered verification.
