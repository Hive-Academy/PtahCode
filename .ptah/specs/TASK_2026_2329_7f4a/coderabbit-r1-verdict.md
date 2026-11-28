# VALID

An idle provider session can retain an inherited `yolo` level after the user
saves `ask` as the workspace default. The next continue can reuse that session
and skip the code that reads the saved level.

## Evidence

- The popover disables Autopilot for its tab's session ID, and the frontend
  service sends null when that tab has no session.
  `libs/frontend/chat-ui/src/lib/molecules/chat-input/autopilot-popover.component.ts:333`
  `libs/frontend/core/src/lib/services/autopilot-state.service.ts:213-223`,
  `:297-302`
- With a session ID, the RPC routes the effective level to that session's
  runtime controls and saves the default. Electron binds the provider-session
  control to `setSessionPermissionLevel`, which changes the live provider
  permission and stores the choice on the session. With null, the RPC takes the
  settings-only path and leaves other sessions untouched.
  `libs/backend/rpc-handlers/src/lib/handlers/config-rpc.handlers.ts:396-434`,
  `:485-504`
  `libs/backend/agent-sdk/src/lib/codex-app-server/session-runtime-router.ts:40-48`
  `libs/backend/rpc-handlers/src/lib/chat/codex-host/native-session-controls.ts:244-251`
  `apps/ptah-electron/src/di/provider-session-composition.ts:441-453`
  `libs/backend/agent-sdk/src/lib/provider-session/provider-session-session-controls.ts:199-214`
- An ordinary chat starts without an explicit level. Its host preparation
  reads the workspace default through the Electron binding, so the running
  provider may have inherited `yolo` without an explicit choice in that tab.
  `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:1789-1793`
  `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-chat-host-ports.ts:132-145`
  `apps/ptah-electron/src/di/provider-session-composition.ts:349-358`, `:411`
- With no attached stream, `autoResumeIfInactive` calls
  `interruptSession(id, 'stream-exit')`. The provider controls retain an idle
  record for that cause. The continue supplies no permission override, and
  `resumeSession` takes its retained-record branch, bypassing `open` and
  `prepare`. The runtime uses the retained permission to track the turn's
  permission and mode.
  `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:3343-3368`,
  `:3470-3491`, `:3551-3556`
  `libs/backend/agent-sdk/src/lib/provider-session/provider-session-session-controls.ts:150-185`
  `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts:250-277`, `:303`
  `libs/backend/acp-runtime/src/lib/acp-provider-session-runtime.ts:343-362`

## PR reply

Confirmed. A toggle with a session ID updates that session's live permission,
while a toggle from a tab without a session only saves the default. A retained
provider session that inherited `yolo` could therefore keep using it on continue
after the saved default changed to `ask`. The fix preserves explicit session
choices and refreshes inherited permission before the resumed prompt, using
`ask` if the settings read fails. The regression spec covers the downgrade,
the read-failure fallback, and explicit tab choices.

Replacement attach now shares the permission queue with tab toggles, so a
toggle during attach reaches the replacement process before it receives the
prompt.

## Changed files

- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts`
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.spec.ts`
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-ports.ts`
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-session.ts`
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-session-controls.ts`
- `libs/backend/agent-sdk/src/lib/provider-session/provider-session-turn-stream.ts`
- `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-chat-host-ports.ts`
- `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-open-request.spec.ts` (Round 2)
- `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-open-request.ts`
- `.ptah/specs/TASK_2026_2329_7f4a/coderabbit-r1-verdict.md`

## Checks

- Focused Jest with the agent-sdk config and `--runInBand --coverage=false --runTestsByPath` passed all 57 tests in `provider-session-chat-adapter.spec.ts`. Node emitted an ES module configuration warning.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` passed.
- `npx eslint` on the eight changed TypeScript files exited successfully with zero errors and one `max-lines` warning for `provider-session-chat-adapter.ts` (766 lines counted, limit 700).
- Ptah search and symbol reads supplied the trace. Scoped `rg` searches filled gaps where Ptah search returned no matches or the dependency index was still building.

## Round 2

- Replacement attach runs on the session's permission queue and publishes the
  live process before releasing that queue. The resumed prompt waits for
  toggles queued during attach. A deferred-permission spec verifies that the
  replacement receives `ask` before the prompt and agrees with adapter readback.
  `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts:397`
  `libs/backend/agent-sdk/src/lib/provider-session/provider-session-session-controls.ts:240`
  `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.spec.ts:898`
- The open-request spec verifies that the supplied `ask` wins over the saved
  `auto-edit` and skips the saved reader.
  `libs/backend/rpc-handlers/src/lib/chat/provider-session-host/provider-session-open-request.spec.ts:105`

### Round 2 checks

- Focused agent-sdk Jest passed all 58 tests in `provider-session-chat-adapter.spec.ts`.
- Focused rpc-handlers Jest passed all 12 tests in `provider-session-open-request.spec.ts`.
  Both Jest runs emitted the Node ES module configuration warning.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` passed.
- `npx eslint` on all nine changed TypeScript files passed with zero errors and
  one `max-lines` warning for the adapter (770 lines counted, limit 700).
  Resolving the warning would require a larger refactor.

## Round 3

- Marked the permission queue's rejection handler as `reported` for the
  degradation audit. The earlier caller still receives its rejection, and
  later changes can run.
- The first provider acquisition now receives the explicit session permission
  or the prepared workspace default. Adapter specs cover both inputs.
- A retained session records the refreshed inherited permission before
  applying it. If the process has exited, the adapter releases it before
  acquiring a replacement. The resume specs verify that the replacement
  applies the refreshed level before prompting and that a rejected application
  prevents the prompt.

### Round 3 checks

- Focused agent-sdk Jest passed all 61 tests in
  `provider-session-chat-adapter.spec.ts`. Node emitted the existing ES module
  configuration warning.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` passed.
- ESLint passed on the three changed TypeScript files with zero errors and one
  existing `max-lines` warning for the adapter (774 lines, limit 700).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`
  reported `TOTAL 0 unsuppressed site(s)`.

### PR reply for the initial acquisition thread

The initial attach now passes the explicit permission or the prepared
workspace default to the open request. An explicit level skips the saved
default read, and the adapter spec covers both first-acquisition paths.

### PR reply for the exited process thread

Permission refresh now saves the new level and drops an exited process before
re-acquiring. The replacement receives the refreshed level before the prompt.
The regression spec also verifies that a rejected permission prevents prompting.

## Round 4

Added a regression spec for a retained process whose inherited permission refresh
rejects with `Permission refused`. The first resume rejects without prompting or
releasing the process, and the open approval settles as `cancel` with reason
`superseded`. A second resume reuses the same process and waits for the saved
permission to apply before prompting.

- Focused agent-sdk Jest passed all 62 tests. Node emitted the existing ES module
  configuration warning.
- ESLint passed on the changed spec with zero errors and warnings.
