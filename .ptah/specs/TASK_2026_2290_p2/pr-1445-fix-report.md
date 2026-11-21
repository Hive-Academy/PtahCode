# PR #1445 fix report (CI + CodeRabbit)

Worktree: `D:/projects/PtahCode/.claude-worktrees/provider-session-p2` (branch
`feat/provider-session-p2`, base HEAD `d6cdf3b`). Nothing committed, pushed or
replied; the coordinator owns that.

## Items

| # | Comment id | File:line | Verdict | Proving spec | Reply text (deferred / disputed) |
| --- | --- | --- | --- | --- | --- |
| CI | degradation-audit | `acp-runtime/src/lib/acp-session-runtime.ts:1290` | fixed | `npx nx run degradation-audit:lint` (see Verification) | — |
| 1 | 4648874140 | `acp-runtime/src/lib/__fixtures__/acp-fixture-reader.ts:83` | fixed | `acp-fixture-reader.spec.ts` (all 4 cases) | — |
| 2 | 4648874149 | `acp-runtime/src/lib/acp-approval-adapter.ts:38` | fixed | `acp-approval-adapter.spec.ts` "never maps acceptForSession to allow_always…"; `acp-session-runtime-hardening.spec.ts` "maps acceptForSession to allow_once, never to the offered allow_always option" | — |
| 3 | 4648874157 | `acp-runtime/src/lib/acp-approval-adapter.ts:107` | fixed | `acp-approval-adapter.spec.ts` "answers cancel when the sink aborts synchronously and returns a settled accept" | — |
| 4 | 4648874164 | `acp-runtime/src/lib/acp-process-transport.ts:347` | fixed | `acp-process-transport.spec.ts` "kill() after the leader exited on POSIX signals only its process group" + "…never signals its (reusable) bare pid" | — |
| 5 | 4648874172 | `acp-runtime/src/lib/acp-process-transport.ts:495` | fixed | `acp-process-transport.spec.ts` "kill() while the command is being prepared settles at once and never spawns" | — |
| 6 | 4648874179 | `acp-runtime/src/lib/acp-replay-collector.ts:74` | fixed | `acp-replay-collector.spec.ts` "bounds merged user chunks by the text budget…" + "drops older events to make room before cutting the newest text" | — |
| 7 | 4648874185 | `acp-runtime/src/lib/acp-session-runtime.ts:445` | fixed | `acp-session-runtime-hardening.spec.ts` "4648874185: refreshes the advertised options from a live config_option_update, never from replay" | — |
| 8 | 4648874189 | `acp-runtime/src/lib/acp-session-runtime.ts:451` | fixed | hardening "4648874189: cancels a permission request for another session without asking the sink" | — |
| 9 | 4648874194 | `acp-runtime/src/lib/acp-session-runtime.ts:560` | fixed | hardening "4648874194: abort stops the agent when session/cancel cannot be written" + "4648874194: interrupt resolves false and stops the agent when the cancel write stalls" | — |
| 10 | 4648874202 | `acp-runtime/src/lib/acp-session-runtime.ts:751` | fixed | hardening "4648874202: an explicitly empty option list in a config reply replaces the cache; a missing one keeps it" | — |
| 11 | 4648874208 | `acp-runtime/src/lib/acp-session-runtime.ts:889` | fixed | hardening "4648874208: a retried session/new that fails for another reason keeps its own error" | — |
| 12 | 4648874214 | `acp-runtime/src/lib/acp-session-runtime.ts:988` | fixed | hardening "4648874214: a respawn reapplies the acknowledged model and mode, not the opening ones" | — |
| 13 | 4648874218 | `acp-runtime/src/lib/acp-session-runtime.ts:1157` | fixed | hardening "4648874218: … takes no further prompt (lane)" + "… is replaced before the next prompt (chat)" | — |
| 14 | 4648874225 | `acp-runtime/src/lib/acp-session-runtime.ts:1349` | fixed | hardening "4648874225: concurrent start() calls share one setup" | — |
| 15 | 4648874232 | `acp-runtime/src/lib/acp-session-update-mapper.ts:206` | deferred | — | Agreed that an image-only user turn should survive replay. No caller renders replayed images yet; the chat history replay that consumes them lands in P7, so we will emit the user turn with an attachment (and merge text+image chunks of one message id) there, with a spec, instead of guessing the shape now. |
| 16 | 4648874237 | `acp-runtime/src/lib/acp-session-update-mapper.ts:241` | fixed | `acp-session-update-mapper.spec.ts` "tool metadata lifetime (PR #1445 review)" (2 cases) | — |
| 17 | 4648874243 | `cli-agent-runtime/.../provider-session/provider-session-lane-handle.ts:136` | fixed | `provider-session-lane-handle.spec.ts` "account binding (PR #1445 review)" (4 cases) | — |
| 18 | 4648874248 | `provider-session-contracts/src/lib/flat-stream-projector.ts:222` | fixed | `flat-stream-projector.spec.ts` "shows an error as a text block and completes a failed turn that had no output" (extended) | — |
| 19 | 4648874251 | `provider-session-contracts/src/lib/provider-session.types.ts:97` | deferred | — | Correct, and latent: nothing reads `ProviderTurnInput.images` yet and no runtime reports `images: true`. P7 is the first caller (chat image input); it will add a live image input type carrying the bytes or a resolvable reference and keep `ProviderReplayAttachment` for history only, so the contract is shaped by its consumer. |

## What changed per item

- **CI**: the flagged `catch` in `interrupt()` is gone. All three cancel paths
  (abort, watchdog, interrupt) now go through `cancelPrompt()`, whose `catch`
  logs and falls through to `stopProcess()` (no literal return, no
  suppression marker needed).
- **4648874140**: `recordedUpdatesDuring` throws when the request is not
  recorded, has no reply, or the next request of the same method starts first.
- **4648874149**: `acceptForSession` ladder is `['allow_once']` only; doc updated.
- **4648874157**: after the race, `signal.aborted` forces `cancel`.
- **4648874164**: after the leader exited, POSIX calls
  `killProcessTree(pid, 'SIGTERM', undefined, { groupOnly: true })` (the
  existing platform-core option that never falls back to the bare pid);
  Windows still never signals an exited pid.
- **4648874172**: `kill()` before the spawner is called settles `exited`
  (`signal: 'error'`) at once and drops queued writes; `spawnChild` checks
  `killRequested` before and after `prepareCommand`; `attachChild` ends stdin
  and kills before flushing when a kill raced the spawn call.
- **4648874179**: `ACP_MAX_REPLAY_TEXT_CHARS` (2,000,000) budget over user
  text, agent text, reasoning and tool output, enforced on push and on the
  merge path; oldest events go first, then the newest text is cut; the leading
  `info` reports dropped events and cut characters. Collector limits are now an
  options object (`{ maxEvents, maxTextChars }`).
- **4648874185**: live (non-replay) `config_option_update` replaces
  `advertisedConfig`.
- **4648874189**: `requestPermission` for a session id other than the current
  (or attaching) one is answered `cancelled` and logged, before any policy or
  sink.
- **4648874194**: `cancelPrompt()` races the cancel write against
  `ACP_CANCEL_WRITE_TIMEOUT_MS` (1.5 s) and the process exit; a failed or
  stalled write stops the agent at once, a written one keeps the existing
  reply grace.
- **4648874202**: `readAuthoritativeConfigOptions()` (helpers): an explicit
  list, even empty, replaces the cache; a missing or malformed one keeps it.
- **4648874208**: `authenticate` failure and the retried `session/new` failure
  are handled separately; only a second auth-required becomes `auth-required`.
- **4648874214**: `acknowledgedModel` / `acknowledgedMode` are recorded on a
  successful `setModel` / `setMode` and used by every later setup (respawn).
- **4648874218**: a generation gets `retired` when the watchdog fires or a stop
  starts; a retired generation takes no prompt (lane: one `process-exited`
  error, chat: respawn first), and `isClosed()` reports it, so the lane's
  `continue` refuses it.
- **4648874225**: `start()` caches the initial setup promise.
- **4648874237**: the mapper deletes a tool's entry on its final update and
  exposes `releaseTools()`, called at each turn start, before a respawn, and
  after each re-attach (replay mapper).
- **4648874243**: the Grok lane awaits `onAccountBinding({ accountBinding,
  accountBindingId }, sessionId)` after `session.start()` and before the MCP wait
  and the task prompt (Codex lane order); an incomplete binding or a rejected
  checkpoint emits one error segment, stops the agent and resolves `done` 1.
- **4648874248**: a `failed` terminal that opens the message emits
  `Error: <terminal.error.message>` (fallback `the turn failed`) before
  `message_complete`; the error-event path is unchanged.

## Verification

- Inner loop `npm run verify -- --related -p acp-runtime,provider-session-contracts,cli-agent-runtime`:
  `NX 3 tasks: 3 succeeded`, exit 0.
- `npm run verify -- -t lint,typecheck -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine`:
  `NX 8 tasks: 8 succeeded`, exit 0.
- Degradation audit (`node scripts/verify.mjs --exec ... degradation-audit:lint`): exit 0.
- Full gate `PTAH_VERIFY_SLOTS=1 npm run verify -- -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine`:
  lint/typecheck `8 succeeded`, test `NX 4 tasks: 4 succeeded`, exit 0 (the first run was cut off when
  the drive disconnected; the rerun passed, cli-engine included).
- Live `PTAH_LIVE_AGY=1` `agy-acp.live.spec.ts` against agy 1.5.13: 1 passed; no `agy.exe` left.
