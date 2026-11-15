Verdict: APPROVED

# Code Style Review — `TASK_2026_1195_7222`

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 8/10 |
| Assessment | APPROVED |
| Blocking issues | 0 |
| Serious issues | 0 |
| Minor issues | 0 |
| Files reviewed | 6 |

The changed imports pass the configured Nx boundary rule. The score is 8 rather than 9 because removal of the core barrel alias is a source-level API break for consumers outside this workspace, even though it is required to restore the declared dependency direction. There is no remaining in-repository import of that alias.

## Five style questions

### 1. What breaks in six months?

A caller still importing `AttentionPermissionActionsComponent` from `@ptah-extension/core` will fail to compile after the removal at `libs/frontend/core/src/index.ts:8`. The supported export is `libs/frontend/notification-center/src/index.ts:1`; repository callers now use it at `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:39` and `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-session-callout.component.ts:9`.

### 2. What would a new team member misread?

They might assume the local imports in `libs/frontend/notification-center/src/lib/notification-center.component.ts:11` and `libs/frontend/notification-center/src/lib/notification-snackbar.component.ts:8` should use the public barrel. Those files are inside the same library; importing their own barrel would introduce an avoidable internal cycle. Cross-library consumers use the public barrel.

### 3. What does this cost to maintain?

The change adds no abstraction. It makes component ownership explicit in the notification-center barrel at `libs/frontend/notification-center/src/index.ts:1`. The remaining cost is migrating any untracked consumer of the old core alias.

### 4. Where is this inconsistent with the rest of the repository?

No inconsistency found. Adjacent tests use a local component import and core types, for example `libs/frontend/notification-center/src/lib/notification-center.component.spec.ts:11-12` and `libs/frontend/notification-center/src/lib/notification-snackbar.component.spec.ts:1-5`; the restored test follows that shape at `libs/frontend/notification-center/src/lib/components/attention-permission-actions.component.spec.ts:1-3`.

### 5. What would you have done differently?

No code change is warranted. Keeping the alias in core would recreate the forbidden core-to-feature dependency under `eslint.config.mjs:393-396`. If external consumers exist, provide a migration note directing them to `@ptah-extension/notification-center`.

## Blocking issues

None.

## Serious issues

None.

## Minor issues

None introduced by these changes.

## File-by-file

### `libs/frontend/core/src/index.ts`

Score 8/10 — 0 blocking, 0 serious, 0 minor. The component is absent from the core export list at line 8, so core no longer exposes a feature component. This is a source-level API break for old core imports; the notification-center barrel owns the component at `libs/frontend/notification-center/src/index.ts:1`.

### `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts`

Score 8/10 — 0 blocking, 0 serious, 0 minor. Line 39 imports the component through the notification-center public entry and line 68 registers it in the Angular standalone component. Canvas is tagged `scope:webview`, `type:feature` at `libs/frontend/canvas/project.json:7`, so this feature-to-feature edge is allowed.

### `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-session-callout.component.ts`

Score 8/10 — 0 blocking, 0 serious, 0 minor. Line 9 uses the public notification-center entry, and line 21 includes the component in Angular imports. Chat-ui and notification-center both have `scope:webview`, `type:feature` tags (`libs/frontend/chat-ui/project.json:7`; `libs/frontend/notification-center/project.json:7`).

### `libs/frontend/notification-center/src/lib/notification-center.component.ts`

Score 9/10 — 0 blocking, 0 serious, 0 minor. Line 10 keeps `AttentionItem` in core, while line 11 resolves the component within the same library. The component is registered at line 19; this avoids importing the library's own barrel.

### `libs/frontend/notification-center/src/lib/notification-snackbar.component.ts`

Score 9/10 — 0 blocking, 0 serious, 0 minor. Lines 4-8 distinguish core contracts from the local component. Line 18 registers that component. This matches the sibling notification-center component's import direction.

### `libs/frontend/notification-center/src/lib/components/attention-permission-actions.component.spec.ts`

Score 9/10 — 0 blocking, 0 serious, 0 minor. The `.spec.ts` file sits beside its component; lines 1-3 import `AttentionItem` from the core public entry and the component locally. Seven colocated tests cover action choice, denial text, disabled actions, focus, and duplicate mounted items; the focused Jest run passed all seven.

## Pattern compliance

| Repository rule or nearby convention | Status | Evidence |
| --- | --- | --- |
| `type:core` depends only on core/util | PASS | `eslint.config.mjs:393-396`; `libs/frontend/core/src/index.ts:8` |
| Feature-to-feature imports permitted within webview scope | PASS | `eslint.config.mjs:292-295,373-380`; four project tag declarations at line 7 |
| Cross-library component imports use a public barrel | PASS | `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts:39`; `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-session-callout.component.ts:9`; `libs/frontend/notification-center/src/index.ts:1` |
| Same-library imports use local files | PASS | `libs/frontend/notification-center/src/lib/notification-center.component.ts:11`; `libs/frontend/notification-center/src/lib/notification-snackbar.component.ts:8` |
| No project import cycles | PASS | Notification-center imports core and ui, with no notification-center import back from core; scoped ESLint boundary rule completed with zero errors. |
| Tests are colocated and use `.spec.ts` | PASS | `libs/frontend/notification-center/src/lib/components/attention-permission-actions.component.spec.ts:1-3` |
| Public API compatibility | QUALIFIED | `libs/frontend/core/src/index.ts:8`; `libs/frontend/notification-center/src/index.ts:1` — old core import path is removed, new owner export is present. |

## Verification

- Scoped ESLint on the six reviewed files: 0 errors, 1 warning. The warning is the existing `max-lines` condition in `canvas-rail-card.component.ts:742`; this PR only changes its import.
- Focused notification-center Jest suite: 1 suite passed, 7 tests passed.
- Ptah TypeScript diagnostics: no diagnostics in the six requested files. It reported errors in sibling files within the same projects; those are outside this review's changed lines, so they do not establish a regression from this import change.

## Maintenance debt

- Introduced: migration requirement for any consumer of the former core export.
- Retired: core-to-feature re-export and the resulting invalid dependency direction.
- Net: simpler, explicit component ownership.

## Decisions

- **Approve the API move.** Options were to retain the core alias or import from the owning notification-center library. Core is constrained to core/util dependencies (`eslint.config.mjs:393-396`), and the component is exported from notification-center (`libs/frontend/notification-center/src/index.ts:1`). The choice is reversible only by relocating the component into an allowed lower layer, not by restoring the alias.

## Verdict

- Recommendation: APPROVE
- Confidence: HIGH for boundary and import consistency; MEDIUM for consumers outside this repository.
- Key concern: Removing the core barrel export changes the import path for any external caller.
- What a 10/10 version would do differently: document the import migration if the core barrel has consumers outside this workspace.
