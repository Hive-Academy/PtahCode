# Codex skill commands and Electron live test

## Part 1

- `codex-runtime/src/lib/codex-protocol-methods.ts:240` and `codex-runtime/src/lib/codex-context.ts:996` use the Codex `skills/list` catalog for the session cwd. Enabled skills resolve to the protocol's structured skill input, including plugin-qualified names. Chat and lane turns preserve their text and attachments.
- `rpc-handlers/src/lib/chat/session/chat-slash-command-router.service.ts:402` and `agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts:992` dispatch recognized skills in live and resumed main chat. Unsupported built-ins and unknown slash commands still return `CODEX_UNSUPPORTED_OPTION`. The agy ACP precedent gates skill admission on the agent catalog.
- `cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:835` and `:1060` attach resolved skills at lane start and on follow-up or steer. The live and stopped-lane composer catalogs advertise skills from the lane workspace so the message coordinator can admit a typed skill command. Native compaction keeps its existing path.
- `agent-sdk/src/lib/codex-app-server/codex-chat-session-controls.ts:243` and `shared/src/lib/providers/entries/codex-provider-entry.ts:20` use the same Codex model mapping on warm turns and when opening a session. Electron exposed the regression when a Luna follow-up passed the raw `haiku` alias.
- Seven Jest specs passed, 551 tests total, using the requested per-project command. `codex-runtime.spec.ts` 148, `codex-app-server-lane.adapter.spec.ts` plus `agent-message-coordinator.lane-messaging.spec.ts` 118, `codex-chat-adapter.spec.ts` 126, `workspace-provider-profile-resolver.spec.ts` 110, and `chat-slash-command-router.native.spec.ts` plus `chat-continue-slash-before-resume.spec.ts` 49. ESLint on changed TypeScript files reported zero errors and eight existing warnings. `git diff --check` passed.

### CodeRabbit follow-up

- `cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts:932` records preamble delivery when a prompt turn starts. A resumed native `/compact` leaves messaging guidance pending. The regression spec at `codex-app-server-lane.adapter.spec.ts:697` verifies the first prompt after compaction includes the guidance and the second omits it.
- `rpc-handlers/src/lib/chat/session/chat-session.service.ts:3713` rechecks for a live stream after the Codex metadata lookup and before interrupting a stale session. The regression spec at `chat-continue-slash-before-resume.spec.ts:528` attaches a stream during the lookup and verifies that slash routing proceeds with the stream intact.
- The two focused Jest suites passed all 110 tests. ESLint reported zero errors and two existing `max-lines` warnings. The Electron results below come from the original live sweep, before these review changes.

## Part 2

Used the documented Electron dev target's setup steps (`build-dev`, `copy-renderer-dev`, development `build-main`), then launched its Electron executable with the dev bundle and CDP on port 19334. A temporary patch to the generated bundle directed Electron's app data into an isolated profile. The app used an isolated Codex home and a disposable Git project inside the worktree. The two bundled skills were staged into that project's `.agents/skills` and the isolated Codex home. In Settings, selected OpenAI Codex for the main agent and `gpt-6-luna`. The composer used the explicit Luna ID for the first sweep after the alias error, then the Haiku tier mapped to Luna for the post-fix retest. All main-chat rows use the same persisted session.

| Step | Expected | Actual | Result | Screenshot |
| --- | --- | --- | --- | --- |
| Plain chat | Luna replies | `LIVE-READY` | PASS | [Plain chat](live-test/04-plain-message.png) |
| Idle `/compact` | Native compaction | `Context compacted` | PASS | [Idle compaction](live-test/05-compact-idle.png) |
| Plain after idle compact | Same session replies | Explicit Luna returned `AFTER-COMPACT-IDLE`. The rebuilt app also returned `ALIAS-RETEST-OK` with the Haiku tier selected. | PASS | [Initial follow-up](live-test/08-after-compact-idle-explicit-luna.png), [Haiku retest](live-test/18-compact-idle-follow-up-retest.png) |
| Running `/compact` | `CODEX_BUSY`, active turn continues | Electron IPC returned `CODEX_BUSY` and the turn kept streaming. The composer queues by default, so the busy check used the renderer's Electron preload RPC. | PASS | [Running turn](live-test/19-compact-busy-retest.png) |
| Plain after busy compact | Same session replies | The same Codex transcript recorded `AFTER-COMPACT-BUSY` and, on retest, `FINAL-BUSY-FOLLOWUP-OK`. | PASS | [Retest turn completion](live-test/23-busy-follow-up.png), [Transcript excerpt](live-test/main-process.log) |
| `/status` | Typed refusal | Renderer displayed `Message delivery failed. Codex app-server does not support /status in Ptah chat.` | PASS | [Status refusal](live-test/09-status.png) |
| Plain after `/status` | Same session replies | `AFTER-STATUS` | PASS | [Follow-up](live-test/09-status-follow-up.png) |
| `/model` | Typed refusal | Renderer displayed `Message delivery failed. Codex app-server does not support /model in Ptah chat.` | PASS | [Model refusal](live-test/10-model.png) |
| Plain after `/model` | Same session replies | `AFTER-MODEL` | PASS | [Follow-up](live-test/10-model-follow-up.png) |
| `/orchestration` | Skill runs | Codex cited the skill's `Pre-flight` section and returned `ORCHESTRATION-OK`. | PASS | [Orchestration](live-test/11-orchestration.png) |
| Plain after `/orchestration` | Same session replies | `AFTER-ORCHESTRATION` | PASS | [Follow-up](live-test/11-orchestration-follow-up.png) |
| `/session-handoff` | Skill runs | Codex cited `Wrap up` and returned `SESSION-HANDOFF-OK`. | PASS | [Session handoff](live-test/12-session-handoff.png) |
| Plain after `/session-handoff` | Same session replies | `AFTER-SESSION-HANDOFF` | PASS | [Follow-up](live-test/12-session-handoff-follow-up.png) |
| Codex CLI lane `/compact` | Warm lane runs native compaction | Spawned a lane in the app, observed `LANE-READY`, and sent `/compact` from the lane composer. The Codex lane transcript recorded native compaction. | PASS | [Lane ready](live-test/15-codex-lane-result.png), [Lane compact](live-test/16-codex-lane-compact.png) |

| Codex CLI lane `/session-handoff` | Native skill input | The message coordinator delivered the advertised command raw, the Codex rollout recorded the skill content, and the lane returned `Wrap up` and `LANE-SKILL-OK`. | PASS | [Lane skill](live-test/21-codex-lane-skill.png) |

### Errors and logs

- Initial workspace admission rendered `Message delivery failed. Cannot start a session in this folder: ancestor of app installation directory (d:\projects\ptahcode\.claude-worktrees\codex-slash-commands contains d:\projects\ptahcode\.claude-worktrees\codex-slash-commands\dist\apps\ptah-electron). Please open a real project folder.` The disposable sibling project resolved this. [Screenshot](live-test/02-worktree-admission.png)
- Initial post-compact follow-up displayed `Codex reported a runtime error.` Codex reported `The 'haiku' model is not supported when using Codex with a ChatGPT account.` Main log reported `[ERROR] [CodexChatAdapter] runtime-failed: turn. CodexChatAdapterError: Codex chat turn: runtime-failed`. [Screenshot](live-test/06-after-compact-idle.png)
- Console triage for the live sweep. The `/status` and `/model` entries are expected typed refusals, and the follow-up messages passed. The generic runtime error matches the initial Haiku alias failure above, which passed on retest after the mapping fix. The renderer's 242 ms long-frame warning is a performance observation from the dev run. The available evidence does not establish a recurring stall or its cause.
- Busy IPC returned `Codex chat is busy. Try again when the current operation finishes.` The main log recorded `[DEBUG] RPC: chat:continue failed (CODEX_BUSY)` during the compact attempt, followed by streamed text. It recorded `[INFO] [AgentMessageCoordinator] Delivering a raw lane command` with `"command":"compact"`, then `[DEBUG] [AgentProcessManager] Command turn settled without a parent completion`.



Selected main-process lines and Codex rollout markers are in [main-process.log](live-test/main-process.log). All requested live steps ran. The Electron preload and CDP were used for the renderer checks and screenshots. This CLI did not expose a skill loader, so the repository agent-lanes skill was read directly. The uncached stopped-lane path was covered by Jest. The test Electron process tree was stopped, CDP port 19334 closed, and copied Codex credentials were removed.


