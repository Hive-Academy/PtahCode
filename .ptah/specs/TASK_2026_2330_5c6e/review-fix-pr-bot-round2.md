# PR #1516 review fixes, round 2

## Findings

- **Serious — fixed.** The live and stopped catalog paths pass their remaining skill budget to the RPC (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-catalog.ts:15`). The transport removes the pending request and rejects at that deadline (`libs/backend/codex-runtime/src/lib/codex-app-server-process.ts:327`). It recognizes late replies from the issued skill ID sequence (`libs/backend/codex-runtime/src/lib/codex-app-server-process.ts:426`). The catalog's existing settled-result handling observes the rejection and returns models, efforts and the built-in command with skills marked unavailable. Regressions cover both catalog paths and process survival beyond the ordinary timeout, with a late reply and a successful follow-up (`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts:1854`, `libs/backend/codex-runtime/src/lib/codex-app-server-process.spec.ts:1165`).
- **Moderate — fixed.** Resuming an inactive Codex session for a skill passes the requested effort with the model before invoking the skill (`libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:410`, `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts:291`).

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-catalog.ts`
- `libs/backend/codex-runtime/src/lib/codex-runtime.types.ts` (outside the original PR-bot diff)
- `libs/backend/codex-runtime/src/lib/owned-codex-context.ts` (outside the original PR-bot diff)
- `libs/backend/codex-runtime/src/lib/codex-context.ts` (outside the original PR-bot diff)
- `libs/backend/codex-runtime/src/lib/codex-app-server-process.ts` (outside the original PR-bot diff)
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts`
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts`
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts`
- `libs/backend/codex-runtime/src/lib/codex-app-server-process.spec.ts` (outside the original PR-bot diff)

## Checks

- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-app-server-process.spec.ts libs/backend/codex-runtime/src/lib/codex-runtime.spec.ts`
  Passed, 222 tests in two suites. Exit 0.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts`
  Passed, 87 tests. Exit 0.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts`
  Passed, 33 tests. Exit 0.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`
  Passed. Exit 0.
- `npx tsc --noEmit --project apps/ptah-extension-webview/tsconfig.app.json`
  Passed. Exit 0.
- `npx tsc --noEmit --project libs/backend/platform-cli/tsconfig.lib.json`
  Passed. Exit 0.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`
  Passed. Exit 0.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane-catalog.ts libs/backend/codex-runtime/src/lib/codex-runtime.types.ts libs/backend/codex-runtime/src/lib/owned-codex-context.ts libs/backend/codex-runtime/src/lib/codex-context.ts libs/backend/codex-runtime/src/lib/codex-app-server-process.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts libs/backend/codex-runtime/src/lib/codex-app-server-process.spec.ts`
  Passed with zero errors and five warnings. Two files exceeded `max-lines`, and three existing catch blocks in `codex-context.ts` triggered `preserve-caught-error`. Exit 0.

The first Codex runtime Jest run exited 1 because the regression exposed a late reply closing the process after timeout cleanup. The final run passed after the receive path was updated. Jest emitted a config loader warning, and the final Codex runtime run briefly warned about open handles before exiting 0. The process spec also checks that cleanup leaves zero timers.

Scoped `ptah_get_diagnostics` on the nine changed TypeScript files returned unavailable after its 45 s deadline on both attempts. The four focused `tsc` commands above passed as the fallback. Native skill discovery was unavailable in this lane.

## Decisions

- Enforce the catalog deadline inside the transport. Cancellation via a signal was the alternative. A request-local timeout uses the existing pending-request timer and lets both catalog paths share one timeout.
- Use a separate sequence of negative integer IDs for skill requests. A per-request record for late replies would retain state for every RPC that never answers. The protocol validator accepts signed integer IDs, and the sequence recognizes previously issued skill IDs with constant state. Both changes are reversible.
- Pass effort directly in the resume config, matching ordinary chat resume. Applying effort after resume would add a settings operation. This change is reversible.

