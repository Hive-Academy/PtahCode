# Handoff predecessor tab ID fix

## Root cause and fixes

The slash-command router passed the caller's `tabId` as a top-level adapter argument, but omitted it from `sessionConfig`. The adapter forwards `sessionConfig` into `executeSlashCommandQuery`; its lifecycle re-registration therefore used the session ID as the record's tab ID. Handoff persists that record's `tabId` as `predecessorTabId`, so the renderer could not find the predecessor by tab ID.

Design B adds `tabId` to the router's re-query `sessionConfig`. A search for `executeSlashCommandQuery` calls found one production call site, in `sdk-agent-adapter.ts`; it forwards the supplied `sessionConfig` and has no separate re-query config to fix. The router is its only `executeSlashCommand` caller in rpc-handlers. The existing `session-handoff-closer.ts` timeout result was left intact.

Design A first looks up the stored predecessor tab ID. If that misses, it looks up a tab by `predecessorTabId` as a session ID, then by `predecessorSdkId`. The SDK ID match guard remains before closing. The close operation uses the found tab's actual ID, so previously stored records with a session ID can close the renderer tab. If both session lookups miss, it replies `absent`.

## Regression evidence

- **Red, backend:** `preserves the caller tab id in the slash re-query session config` failed before the router fix. Expected `sessionConfig.tabId: "tab"`; received `sessionConfig: { model: "sonnet", projectPath: "/workspace" }`, with `tabId: "tab"` only outside the config. Jest: 1 failed, 17 skipped.
- **Red, frontend:** `closes the renderer tab when a stored predecessor tab id is a session id` failed with the original closer lookup. Expected `findTabBySessionId("sdk-1")`; the mock had zero calls. Jest: 1 failed, 33 skipped.
- **Green, backend:** focused router spec passed, 18/18 tests.
- **Green, frontend:** closer spec passed, 35/35 tests, including the SDK mismatch guard case.

The backend regression proves the value that reaches lifecycle re-registration is the renderer tab ID. Handoff persistence reads the resulting record's `tabId` (`session-handoff.service.ts:608`). A direct cross-project integration assertion on the persisted handoff record after a slash re-query was not added; that requested regression remains unmet.

## Changed files

- `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:396` — put `tabId` in re-query config.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts:249` — regression on the adapter argument.
- `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.ts:65` — session ID fallback and actual tab ID for close.
- `libs/frontend/chat/src/lib/services/auto-handoff-source-closer.service.spec.ts:48` — lookup mocks and close, absent, and SDK mismatch coverage.

## Check results

- Backend focused Jest: PASS, 18 tests.
- Frontend focused Jest: PASS, 35 tests.
- Backend spec typecheck: PASS.
- Frontend spec typecheck: FAIL with 809 lines of diagnostics across the project. A targeted scan found no diagnostics naming `auto-handoff-source-closer.service.ts` or its spec. Examples include TS2352 casts in unrelated component specs and TS2737 BigInt literals under a lower ES target in shared code.
- ESLint on both requested source trees: exit 0, 0 errors, 290 warnings.
- `git diff --check`: PASS.
