# Phase B Electron evidence spec

Three opt-in Playwright tests were written at `apps/ptah-electron-e2e/src/specs/chat/caller-attribution-evidence.spec.ts`. They were **not run**. `PTAH_EVIDENCE=1` is required. Each test launches a real Electron app with an isolated temporary profile, home, and `PTAH_DB_PATH`, selects the Codex provider through the existing `auth:saveSettings` RPC, creates a tab in the UI, and takes full-page and cropped screenshots under `.ptah/tmp/electron-evidence/`.

## Cases

- **item a:** Codex calls `ptah_session_start` for a trivial child. The test waits for a new Rail card with `rail-child-glyph`, checks the original parent card has `rail-child-count`, and checks no tool output shows `unattributed-caller`.
- **item b:** Codex calls `ptah_agent_list` and `ptah_agent_spawn`; the lane is instructed to call `ptah_agent_report` with `E2E-REPORT-MARKER`. The test requires a `chat-peer-message` carrying the marker in the active parent tab.
- **item c:** Codex in `ask` permission mode requests `git status`. The test requires a `ptah-permission-request-card` with that command, captures it, **denies** through its accessible button, and captures the settled UI.

These are the three acceptance cases extracted from the user's prose. Each is a separate grep-able test. Assertions use the real UI; item a checks the visible parent and child relationship through both Rail cards. Item b's active-tab message is the direct report delivery evidence. If the runtime renders a report differently, that test will fail and the screenshot/trace should guide selector adjustment.

## Selector sources

- `visibleNewSessionTrigger` in `apps/ptah-electron-e2e/src/support/new-session-trigger.ts`; `li[ptah-canvas-rail-card][data-tab-id]` in `libs/frontend/canvas/src/lib/canvas-rail/canvas-rail-card.component.ts` and `live-follow-up-queue.spec.ts`.
- `rail-child-glyph` and `rail-child-count` in `libs/frontend/chat-ui/src/lib/molecules/compact-session/compact-rail-card.component.ts`, passed the relation from `libs/frontend/chat/src/lib/components/molecules/compact-session/compact-session-card.component.ts`.
- `chat-peer-message` in `libs/frontend/chat/src/lib/components/organisms/message-bubble.component.html`; lane report is represented as an inbound peer message in its renderer specs.
- `ptah-permission-request-card` in `libs/frontend/chat/src/lib/components/molecules/tool-execution/tool-call-item.component.ts`; the Deny button's accessible name in `libs/frontend/chat-ui/src/lib/molecules/permissions/permission-request-card.component.ts`.
- Composer and send selectors from `apps/ptah-electron-e2e/src/specs/chat/live-follow-up-queue.spec.ts`.

## Build chain and risks

`.ptah/tmp/caller-evidence-chain.sh` builds `ptah-electron:build-dev` and `ptah-electron:copy-renderer-dev` under `scripts/verify.mjs --exec` locks, then runs each item under its own lock and writes `caller-evidence-{a,b,c}.log`, including `=== exit N`. A failed item does not prevent later items from running. `build-dev` is required because `launchPtah` resolves `dist/apps/ptah-electron/main.mjs`; `copy-renderer-dev` supplies `dist/apps/ptah-electron/renderer` (see `apps/ptah-electron/project.json` and `support/electron-launcher.ts`).

Live Codex authentication and an available Codex lane are prerequisites. Runs spend real model tokens. The test does not open provider-auth settings or embed credentials; it reuses the existing `CODEX_HOME` and records only UI screenshots. Screenshots can still contain user-visible conversation content, so run in the isolated evidence workspace. The chain and tests were intentionally not executed by this lane.

Focused checks passed: `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.json`, `npx eslint apps/ptah-electron-e2e/src/specs/chat/caller-attribution-evidence.spec.ts`, and scoped Ptah diagnostics (0 errors, 0 warnings). No Playwright or Electron run was made, so runtime pass/fail counts are unknown.

## Decisions

- Use `ask` mode and deny `git status` in item c. Options were allow or deny; the renderer exposes both, and deny is a reversible response to this harmless request. The test records the choice in its title and screenshot name.
- Use the existing RPC provider-selection flow from `live-follow-up-queue.spec.ts` instead of navigating to provider-auth settings. The flow is already used by a live Codex E2E spec and preserves real authentication.
