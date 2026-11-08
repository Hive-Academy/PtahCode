# Phase F code style review

Score: 6/10
Verdict: REVISE
Review family: codex (implementer: claude)

## Findings

1. **Serious — Permission event boundary asserts a fuller type than it validates.** `libs/frontend/machines-ui/src/lib/services/session-event-reducer.ts:400-411` checks only `id`, `toolName`, and `toolInput`, then casts the payload to `PermissionRequest`. That contract also requires numeric `timestamp` and `timeoutAt` and string `description` (`libs/shared/src/lib/types/permission.types.ts:60-67`). A malformed log event can therefore enter component state with missing required fields; the existing reducer spec even constructs such an incomplete request at `session-event-reducer.spec.ts:236-240`. Validate and construct the complete request at the event boundary, and add a spec that rejects malformed required fields.

2. **Serious — Each pending approval owns a one-second interval.** `libs/frontend/machines-ui/src/lib/components/remote-approval-block/remote-approval-block.component.ts:309-346` starts an interval for each answerable request; `remote-session-view.component.ts:278-290` renders one block for each pending permission, while `session-event-reducer.ts:367-377` places no bound on that list. A session with many concurrent prompts creates proportionally many timers and signal updates. Give the session view one clock shared by its approval blocks, or schedule the next deadline centrally. Keep the existing destroy cleanup.

3. **Moderate — The new view components carry too much layout and coordination in one file.** `libs/frontend/machines-ui/src/lib/components/remote-session-view/remote-session-view.component.ts:74-336` contains the transcript, approval, and composer template, followed by view state and session lifecycle coordination at `:337-732`; `machines-view.component.ts:85-383` similarly combines the page template with navigation and machine actions through `:534`. At 761 and 609 lines respectively, these files are hard to scan next to the already extracted transcript, approval, list, and readiness components. Move the composer and its interaction state into a focused component, and keep the page component responsible for selecting and composing panes. Preserve typed `input()`/`output()` contracts.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Accept the `/services` entry and route wiring. | Keep the narrow entry; eager import of the main barrel. | `libs/frontend/machines-ui/src/services.ts:18-29` exports services and types only; `apps/ptah-extension-webview/src/app/app.routes.ts:190-203` loads the component lazily; `eslint.config.mjs:270-274` and `tsconfig.base.json:128-130` mirror the existing service-entry exception and alias. | Yes |
| Accept duplicated worker timeout copy for this phase. | Keep UI-local constants pinned by specs; import backend code into the webview; move the contract to shared. | `libs/frontend/machines-ui/src/lib/utils/remote-session-copy.ts:9-21` restates worker timeout values; `remote-session-copy.spec.ts` pins them; `batch-25-report.md:63` records the frontend/backend boundary reason. A later shared contract would remove drift risk. | Yes |
| Do not flag casts used after closed-set membership checks. | Keep the narrowing casts; replace them with another parser. | `libs/frontend/machines-ui/src/lib/services/machines-feed.ts:154-169` checks values against `MACHINE_CONNECTION_STATES` and `MACHINE_STATE_REASONS` before casting. | Yes |

Scope: reviewed the Phase F code diff against the requested frontend, shell, shared-contract, and backend files and the Batches 22–26 reports. This was a read-only review; no checks were run.
