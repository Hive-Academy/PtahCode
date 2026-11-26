# Codex app-server slash-command fix

## Root cause

- The chat dispatcher omits idle admission for slash commands and sends the prompt in `ChatContinueParams`. The RPC classified streamless sessions as dead before routing the command. Codex uses a stream per turn, so this could cancel pending input or interrupt a live thread. See `chat-session.service.ts:3704`.
- The main chat router sent unsupported commands through the Claude-style slash relaunch path. The Codex adapter refused them with `Codex chat slashCommand: unsupported` (`codex-chat-session-controls.ts:181`). The RPC mapped that to `CODEX_RUNTIME_FAILED` with “Codex chat could not complete the operation.” Native `/compact` already used `thread/compact/start` (`codex-context.ts:1523`). A live Electron reproduction was unavailable.
- CLI lane continuations wrapped `/compact` in a prompt and sent it via `turn/start`. The lane now lists `compact` in the command group and invokes the existing context compaction API on live and resumed threads. See `codex-app-server-lane.adapter.ts:892`.

## Changed files and specs

- RPC handlers — `chat-session.service.ts` preserves the live thread, and `chat-slash-command-router.service.ts` returns `CODEX_UNSUPPORTED_OPTION` with the command name. `chat-continue-slash-before-resume.spec.ts` covers streamless threads. `chat-slash-command-router.native.spec.ts` covers `/model`, `/status`, and a skill name.
- CLI agent runtime — `codex-app-server-lane.adapter.ts` routes compaction through the existing context and checks lane activity first. Its spec covers busy admission, native compaction, recovery after a refusal, a subsequent text turn, and cold resume.

## Decisions

- Unsupported main-chat commands get a typed refusal. Lane commands outside the compact catalog use ordinary text delivery. A stopped lane uses the existing cached catalog to deliver a command on resume. These choices follow the existing dispatcher contract and can be changed independently.

## Verification

- RPC Jest — 4 suites and 98 tests passed.
  ```sh
  npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/session/chat-continue-slash-before-resume.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.provider-session.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-session.native.spec.ts
  ```
- Lane Jest — 81 tests passed before the final command-matcher change. The final adapter and dispatcher run is listed below.
  ```sh
  npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts
  ```
- TypeScript — both commands passed.
  ```sh
  npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
  npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json
  ```
- ESLint — exit 0, two file-length warnings. The Nx module-boundary rule skipped because the worktree had no cached project graph.
  ```sh
  npx eslint libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-slash-command-router.native.spec.ts libs/backend/rpc-handlers/src/lib/chat/session/chat-continue-slash-before-resume.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts
  ```

The first RPC Jest attempt encountered a memory allocation failure. The first lane Jest attempt could not resolve `marked` at the worktree-local path in the Jest preset. A temporary worktree junction to the existing dependencies let both retries run and was removed afterward. Ptah diagnostics timed out before the direct TypeScript checks. Runtime skill discovery was unavailable in this lane.

- Final lane and dispatcher Jest — 2 suites and 104 tests passed.
  ```sh
  npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/agent-message-dispatcher.spec.ts
  ```
- Renderer chat Jest — 2 suites and 147 tests passed.
  ```sh
  npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/services/chat-store/message-dispatch.service.spec.ts libs/frontend/chat/src/lib/services/message-sender.service.spec.ts
  ```
- Platform CLI registration Jest — 1 test passed.
  ```sh
  npx jest --config libs/backend/platform-cli/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-cli/src/registration.spec.ts
  ```
- Electron composition Jest — 2 suites and 33 tests passed with `NODE_OPTIONS=--max-old-space-size=3584`. The initial run exhausted the default V8 heap.
  ```sh
  npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/codex-lane-composition.spec.ts apps/ptah-electron/src/di/codex-runtime-composition.spec.ts
  ```
- CLI engine composition Jest — 6 tests passed using the project's CJS config. The initial command pointed at a nonexistent TypeScript config.
  ```sh
  npx jest --config libs/backend/cli-engine/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.spec.ts
  npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand --coverage=false --runTestsByPath libs/backend/cli-engine/src/lib/codex-lane-runtime-composition.spec.ts
  ```
