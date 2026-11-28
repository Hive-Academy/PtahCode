# Settings overlays and routing evidence

Investigate and plan the Electron renderer fix for TASK_2026_2329_dd39. The reported cases are the Provider connection list clipped at the bottom of Add Ptah CLI Agent Instance, “CLI default” colliding with Network, and “Yolo”/“Allowed” controls crowding the expanded instance group header. Provider and instance subforms repeat information and actions. Background models shows generic inheritance labels and can report an OpenRouter key error while Claude Subscription is active. Routing evidence prints the task-kind × effort grid even when most combinations have no samples.

## Renderer and shared UI

- `apps/ptah-extension-webview/src/main.ts:59` bootstraps the main renderer. `package.json:157` declares `@angular/cdk` at `~22.2.7`. `libs/frontend/ui/package.json:5` lists it as a peer. The renderer already imports CDK overlay CSS and the rich-select stylesheet in `apps/ptah-extension-webview/src/styles.css:10,22`.
- `libs/frontend/ui/src/lib/overlays/{popover,dropdown}/` has CDK connected overlays and `overlays/shared/overlay-positions.ts` has position maps. `selection/autocomplete/autocomplete.component.ts:65` is an example of trigger width matching and viewport push. The affected settings use `ui/src/lib/native/{modal,drawer,popover}/` and `ui/src/lib/form-controls/rich-select/`. Chat UI uses the same public UI library, for example `libs/frontend/chat-ui/src/lib/molecules/permissions/deny-message-popover.component.ts:33`.
- Git history has reusable connected-overlay code in `b38217532` and the older suggestions dropdown at `21cfe2fc4^`. `b4c512eb3` introduced the two CLI forms with the shared native modal. `cf644f685` introduced rich select and `98f70fe9e` made its panel fixed. The inspected history yielded CDK overlay positioning and focus examples but no earlier CDK Dialog implementation for these settings forms.

## Settings entry points

Paths in this section are relative to `libs/frontend/chat/src/lib/settings/`.

| Surface | Files |
| --- | --- |
| CLI instances | `ptah-ai/cli-orchestration-matrix.component.ts:217` opens `providers/add-cli-instance-modal.component.html:1,89`. The matrix reaches `ptah-ai/lanes-table.component.html` via `ptah-ai/cli-provider-grid.component.ts:9`. The model cell, inherited defaults and row details live in the table and its `lane-model-effort-cell`, `cli-lane-default-cell` and `lanes-table-detail` components. |
| Provider subforms | `providers/providers-settings.component.ts:583` mounts `providers/provider-setup-wizard.component.ts`. The wizard uses a drawer and discard dialog. `providers/connection-detail-drawer.component.ts:67` hosts connection editing. `providers/cli-tier-mapping-modal.component.html` is a second CLI dialog with model search. |
| Background models | `providers/agents-routing-settings.component.ts:133–156` opens the section, `providers/provider-consumer-assignments.component.ts:183,255` opens the row editor, and `providers/provider-consumer-rows.ts:296–328` reads Memory curator and Enhancement assignments. The shared picker is `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts`. The renderer-side route read is `libs/frontend/core/src/lib/services/providers-settings-state.service.ts:357–367`. |
| Routing evidence | `ptah-ai/decision-matrix-page.component.ts:98` hosts `ptah-ai/routing-evidence.component.ts`, which reads `agent:getRoutingEvidence`. |

Findings are from source and local Git history. Electron reproduction and visual verification are implementation acceptance checks.
