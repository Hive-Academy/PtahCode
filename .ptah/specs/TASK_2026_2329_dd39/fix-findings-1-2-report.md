# Findings 1 and 2

## Changes

- The Memory curator row and editor use the ready active route when the saved override is missing credentials. The provider control keeps the saved override selected, the editor explains the fallback, and the picker loads the active route's catalog. Opening the editor performs no settings write. The regression checks that the only initial request is for Claude Subscription and that selecting a connected provider loads and saves that selection.
- The row and picker display the role tier alias for an unpinned model. Renderer data includes the main agent's resolved model and the provider's catalog, neither of which identifies the curator's configured tier target. Explicitly pinned role model IDs still display as model IDs. Tests cover a provider with a static tier and a catalog containing a custom model, and a provider with no static tier mapping.

## Files

- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-assignments.component.ts` and its spec
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts` and its spec
- `libs/frontend/ui/src/lib/native/provider-model-picker/provider-model-picker.component.ts` and its spec

## Decisions

- Scoped the saved override fallback to curator authentication failures evidenced by `needs-key` or `unauthenticated` with a ready, supported active provider. The runtime explicitly falls back on auth failure and handles native-runtime refusals and quota failures separately. Using every blocking readiness state would guess at runtime behavior. This is reversible in the row derivation.
- Kept the fallback catalog separate from the provider selection. Substituting the active provider as the selection could obscure the saved override or change its value during an edit. The model controls are disabled during fallback, and the provider control remains available for explicit reassignment. This is reversible in the picker and its host binding.

## Checks

| Check | Result |
| --- | --- |
| Focused chat Jest | 2 suites, 43 tests passed |
| Focused UI Jest | 1 suite, 78 tests passed |
| Electron and renderer TypeScript | Both app projects passed |
| Chat and UI TypeScript | Both library projects passed |
| ESLint | 6 files checked, 0 errors, 1 file-length warning in the assignments component |
| Scoped Ptah diagnostics | Timed out after 45 seconds |

Electron visual verification and Angular template compilation were unavailable under the permitted checks. Ptah reported no connected browser session, and the focused assignment specs exercised the renderer template in Jest.
