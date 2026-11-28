# Batch 4 — Background models resolution and picker layout

## Root cause and fix

The blank provider sentinel reached the generic catalog loader without the workspace’s resolved route. The loader could then select a different provider, so an inherited Claude Subscription setting could show an OpenRouter catalog error. Background model editors now pass the ready route’s provider and auth label separately from the saved selection. The picker scopes catalog requests, retry, saved-list notices, and errors to the fixed, explicitly selected, or supported inherited provider. It clears stale catalog state on provider changes and invalidates pending results on close. Unresolved routes and unsupported inherited providers issue no catalog request.

The row summary and editor show the effective provider and a saved model ID or role default. Concrete defaults come from the provider’s tier mapping. The existing save paths preserve blank inheritance values, Enhancement’s `inherit` sentinel, manual model IDs, scope, and Setup’s provider/model pair.

The settings picker uses stacked shared rich selects with searchable model options and wrapping feedback. The editor opts into the shared popover’s viewport cap and repositions when its content changes size. Main agent reassignment and Setup recovery use the attached CDK panel for focus and measurement. The Decision model tests exercise the attached portal and its CDK focus boundary.

## Files changed

- `libs/frontend/chat/src/lib/settings/providers/` — `provider-consumer-assignments.component.ts`, `provider-consumer-assignments.component.spec.ts`, `provider-consumer-rows.ts`, `provider-consumer-rows.spec.ts`, `main-agent-reassign-popover.component.ts`, `main-agent-reassign-popover.component.html`, `main-agent-reassign-popover.component.spec.ts`, `decision-model-row.component.spec.ts`
- `libs/frontend/ui/src/lib/native/provider-model-picker/` — `provider-model-picker.component.ts`, `provider-model-picker.component.spec.ts`, `provider-model-search-field.component.ts`
- `libs/frontend/chat/src/lib/settings/ptah-ai/cli-model-effort-popover.component.ts`

## Decisions

- Use an opt-in inherited route input at the picker boundary. The alternative was changing the shared loader fallback. Settings owns route and readiness information, and the same picker serves callers in both hosts. The host binding is reversible.
- Close an open editor on a workspace switch. The alternative was keeping it open and rebasing the draft. Existing settings saves are scope-aware, and closing discards the old editor’s pending catalog response and prevents queued writes from crossing scopes. This behavior is reversible at the settings host.

## Checks

| Check | Result |
| --- | --- |
| Focused chat Jest | 7 suites, 203 tests passed |
| Focused UI Jest | 1 suite, 78 tests passed |
| UI library TypeScript | Passed |
| Chat library TypeScript | Passed |
| Renderer TypeScript | Passed |
| ESLint | 12 source and test files, 0 errors and 2 file-length warnings |
| Ptah diagnostics | Timed out on the scoped TypeScript check twice. The tool reported the HTML template as unsupported. The direct TypeScript checks passed. |

The chat Jest command mapped `marked` to the installed dependency in the parent checkout because the worktree lacks a local `node_modules`. ESLint skipped its module-boundary rule because the worktree has no cached Nx project graph.

## Open risks

Electron rendering and keyboard interaction at 400 px and wide pane widths still need verification in a running renderer for this worktree. The available Electron process was the installed application, and the worktree had no running renderer. Jest exercised the catalog, portal focus, and viewport-cap bindings in jsdom.
