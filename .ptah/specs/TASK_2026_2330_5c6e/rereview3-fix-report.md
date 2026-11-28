# Codex inactive skill refusal

## Changed files

- `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:412` routes inactive skill lookup through the dedicated Codex resume. The existing acceptance callback still applies explicit model and effort before the skill turn.
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts:357` adds the lookup resume. At line 405 it strips model and effort after profile resolution. At line 469 it passes the original resolved profile object to the Electron lifecycle so its tab association is preserved.
- `libs/backend/codex-runtime/src/lib/codex-runtime.ts:285` passes the lookup-resume option to the context.
- `libs/backend/codex-runtime/src/lib/codex-context.ts:333` tracks the option for the resumed context. At line 1076 it omits unset effort on later turns so the App Server can retain the thread value.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts:293` covers accepted inactive routing, active and inactive refusal, and an inactive lookup exception.
- `libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts:451` covers removal of resolved defaults and preservation of the profile object used by Electron.
- `libs/backend/codex-runtime/src/lib/codex-runtime.spec.ts:2865` reads the actual App Server request frames for missing and failed lookups and verifies that both `thread/resume` and the next `turn/start` omit model and effort.

## Checks

- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts` passed all 36 tests.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts` passed all 130 tests.
- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-runtime.spec.ts` passed all 150 tests.
- `npx eslint libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.spec.ts libs/backend/codex-runtime/src/lib/codex-runtime.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts libs/backend/codex-runtime/src/lib/codex-context.ts libs/backend/codex-runtime/src/lib/codex-runtime.ts` exited 0 with five warnings in existing code. Two were file length warnings and three were missing error cause warnings.
- Jest emitted a config-module loading warning and completed all three suites. Standalone TypeScript checks and host smoke tests were outside this focused run.

## Decisions

- Used the lookup-only resume option from the rereview. It lets skill discovery use the reopened App Server process and retains the thread's model and effort until an accepted turn applies explicit settings.
- Tested router behavior, adapter profile handling, and App Server serialization at their respective boundaries. The adapter spec injects a resolved profile with defaults. The wire spec uses the real runtime against a scripted App Server process.
- Used native PowerShell and `rg` for worktree inspection and edits where needed, including after a Ptah read transport error. No matching CLI skill was surfaced for this backend fix.

