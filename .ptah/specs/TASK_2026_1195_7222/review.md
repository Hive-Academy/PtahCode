# Independent code review — PR #1289

**Verdict: NEEDS_REVISION** — 1 blocking, 1 serious, 0 minor.

## Findings

### Blocking: the new re-export reverses the library boundary and creates a cycle

`libs/frontend/core/src/index.ts:8` exports `AttentionPermissionActionsComponent` from `@ptah-extension/notification-center`, a `type:feature` project (`libs/frontend/notification-center/project.json:6`). The lint policy permits `type:core` to depend only on `type:core` or `type:util` (`eslint.config.mjs:394-395`). Meanwhile the moved component imports `AttentionItem` from core (`libs/frontend/notification-center/src/lib/components/attention-permission-actions.component.ts:2`), and the notification center and snackbar still import the component through core (`libs/frontend/notification-center/src/lib/notification-center.component.ts:10`; `notification-snackbar.component.ts:6`). Thus the project dependency direction is `core → notification-center → core`; the type-only import still represents a project dependency, and the value re-export creates a runtime barrel dependency. This defeats the boundary fix and is expected to fail the newly added lint gate. Remove the core re-export; import the component from its owning library in external consumers and directly from its sibling file inside notification-center.

### Serious: the component move removes its focused test suite

Commit `79a08488e` deletes `libs/frontend/core/src/lib/components/attention-permission-actions.component.spec.ts:1-164` without moving it beside the component. The removed seven tests cover denial submission and validation, disabled actions, Escape and focus restoration, disclosure ARIA, and unique accessible description IDs. These are the precise behavior and accessibility risks of moving this shared component, used by the bell, snackbar, chat callout and canvas rail (`libs/frontend/notification-center/src/lib/notification-center.component.ts:18`; `libs/frontend/notification-center/src/lib/notification-snackbar.component.ts:17`; `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-session-callout.component.ts:20`; `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:67`). Restore the suite under `libs/frontend/notification-center/src/lib/components/`, adjusting its `AttentionItem` import.

## Other review answers

- **Placement:** `notification-center` is a reasonable owner for permission actions shared by its bell and snackbar, provided consumers use its public export at `libs/frontend/notification-center/src/index.ts:1`. The compatibility re-export in core is the architectural defect.
- **Lint fixes:** Adding `public` to the test host signals (`apps/ptah-extension-webview/src/app/ui-gallery.component.spec.ts:283-284`) preserves template access. Moving the API-key update into a typed event handler (`apps/ptah-extension-webview/src/app/ui-gallery/gallery-provider-form.component.ts:60,96-99`) removes `$any` without changing the signal update. The cast to `HTMLInputElement` is reasonable for this native input handler.
- **CI:** `nx affected -t lint --parallel=2` at `.github/workflows/ci.yml:126-128` fits the existing affected build and dependency gates and limits lint concurrency. Full history is fetched at `.github/workflows/ci.yml:57`, supporting affected detection.
- **Behavior and accessibility:** The component move changes only its type import (99% rename similarity; `libs/frontend/notification-center/src/lib/components/attention-permission-actions.component.ts:2`), so no new template behavior or ARIA defect is apparent from the diff. Deleted coverage prevents regression confidence until restored.

## Verification limits

`node_modules/.bin/nx` is absent in this checkout, so project lint and tests could not run. Scoped Ptah TypeScript diagnostics timed out and reported both files unchecked. The boundary finding rests on the source imports, project tags and explicit lint constraints above.

## Decisions

- Treat `notification-center` as the component owner and remove the core compatibility export. Keeping the export preserves old imports but contradicts the repository's dependency rule and creates a cycle; direct imports are reversible and match the new ownership.
