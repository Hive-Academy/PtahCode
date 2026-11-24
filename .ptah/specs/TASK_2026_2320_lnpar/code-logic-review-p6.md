# Code Logic Review: P6 adapters (batches 23-29), TASK_2026_2320_lnpar

Scope: commits `f03a2457c^..4937bde81`. Read the full diffs of the Claude lane runner, stream loop, prompt mailbox,
ptah-cli registry, Claude adapter, Codex adapter and events, ACP lane handle, Grok/agy manifests, Copilot, OpenCode,
Pi and Cursor, plus `lane-usage-normalizer.ts` and the router's `interruptAndResume`. Read-only: no tests, builds or
tsc were run (the user asked for CI to verify). `opencode run --help` was run locally (free).

## Summary

| Metric | Value |
| --- | --- |
| Score | 6.5 / 10 |
| Verdict | REVISE (small fix round; no blocker for CI) |
| Blocking | 0 |
| Serious | 2 |
| Moderate | 7 |
| Minor | 4 |

Evidence for the score: the manifests match the executor's table row by row, refusals are visible and typed, the
interrupt keeps the session, the steer fold-in is dormant, and no timer, listener or child leak was found. The score
stops short of 7+ because of two paths that report success where the provider may not honour the input
(Ptah CLI images on non-vision providers; unverified repeated `--file`), and because the new turn counters drift when
an unsolicited result frame arrives.

## Manifest verification (executor table vs code)

| Adapter | Claim | Result |
| --- | --- | --- |
| Claude / ptah-cli | steer unsupported, interrupt supported | OK `claude-cli.adapter.ts:105`, `ptah-cli-registry.ts:393` |
| | model/effort next-turn, images not on steer, files path-text, commands, skills | OK `claude-sdk-lane-runner.ts:99-106`; handle has `applyTurnSettings`, `continue(content)`, `listTurnOptions` |
| | live `message` usage | OK `ptah-cli-stream-loop.service.ts:~822` (once per `message.id`) |
| Codex | steer, interrupt, images on steer, files reference, `cumulative` usage | OK `codex-app-server-lane.adapter.ts:192-226`, `codex-lane-events.ts:218-229`; commands/skills correctly unsupported |
| Grok / agy | steer unsupported, interrupt, images gated live, commands/skills, `always-approve` blocked | OK `provider-session-lane-handle.ts:94-117, 556-563`; Grok passes `hiddenLaneCommands`; agy blocked `[]` |
| Copilot / OpenCode | next-spawn, live `message` usage, OpenCode `--file` | OK in code; OpenCode `--file` multiplicity unverified (S2) |
| Pi | steer supported, images unsupported | OK `pi-cli.adapter.ts:~295` |
| Cursor | interrupt, images not on steer, usage turn-end | OK `cursor-cli.adapter.ts:~317` |

## Five logic questions

1. Silent failure. A Ptah CLI lane on a text-only provider reports images `supported` and `turnInputSupport` always
   confirms it (`claude-sdk-lane-runner.ts:568-570`), so an attached image reaches a model that cannot read it (S1).
   A Copilot/Pi/OpenCode model typo is accepted when the CLI lists no models, `applyTurnSettings` returns success, and
   every later turn then fails at spawn (M3).
2. Unexpected user action. Interrupt right after a turn ended on its own is a safe no-op (`interrupt()` returns when
   `!turnRunning()`). A user switching model and effort together on Claude or ACP can get an effort refusal after the
   model already changed (M2).
3. Wrong answer from data. Claude live usage reads the first frame of each assistant message, whose `output_tokens`
   can be a streaming placeholder; the turn segment corrects it, so only the live figure is low (m1). Codex
   `cumulative` regression restarts the series (`lane-usage-normalizer.ts` `current < before`), which can over-count
   by one snapshot (m2).
4. Dependency failure. `setModel` and `applyFlagSettings` are bounded at 10 s, catalogs at 5 s, interrupt at 3 s, all
   with the timer cleared in `finally` (`claude-sdk-lane-runner.ts:121-130`). Codex `listModels()`, Pi/Copilot/OpenCode
   `listModels()` and Cursor `listModels()` have no bound in the new paths (m3).
5. Missing from the requirements. Claude-cli yolo reports approvals as supported (M1). A `max` effort is silently
   mapped to `xhigh` for Claude while the result reports `reasoningEffort: 'max'` (m4).

## Serious issues

### S1. Ptah CLI images are declared and confirmed for every provider
- File: `claude-sdk-lane-runner.ts:568-570` (`turnInputSupport` returns `images: supported` unconditionally),
  `:99-106`, `ptah-cli-registry.ts:407-409`.
- Scenario: a Ptah CLI lane routed to a text-only provider (proxy-translated models). The composer enables attach,
  the planner accepts, and `claudeLaneTurnContent` builds base64 image blocks (`:150-166`).
- Impact: the image is dropped or errors inside the provider translation, after the UI said it was supported. This
  breaks the rule that a manifest never declares what the handle cannot honour. The native Claude lane is fine.
- Fix: for Ptah CLI make the live gate depend on the provider/model vision capability (the same source main chat
  uses), or return `unsupported` with a reason when it is unknown.

### S2. OpenCode repeated `--file` is unverified; a lost file is silent
- File: `opencode-cli.adapter.ts` `startTurn` (`for (const file of files) args.push('--file', file)`), spec
  `opencode-cli.adapter.spec.ts:1885` asserts argv only.
- Evidence: local `opencode run --help` shows `--file, -f string` (not an array) and a variadic `message...`. Whether a
  repeated string flag accumulates or last-wins, and whether the prompt after the flags is read as the message, was
  not confirmed against the real CLI.
- Impact: with two files only one may attach, or the prompt may be swallowed; the user sees "sent" either way.
- Fix: run one free dry call with two files, or send one `--file` only and refuse more in `turnInputSupport`; add `--`
  before the prompt if the parser allows it.

## Moderate issues

- M1. Claude-cli approvals are declared supported in yolo (`claude-cli.adapter.ts:124`, `claudeSdkLanePrompts()` with no
  mode; `agent-process-manager.service.ts:1426` calls `capabilities()` without a mode). In yolo `canUseTool` never
  fires, so the declared prompt route is never used. The executor's decision (unsupported only in yolo) is right, but
  for claude-cli it is not applied. Fix: pass the spawn permission from the manager, or override
  `potentialCapabilities.prompts` per spawn as the ptah-cli registry does.
- M2. Partial application then refusal. Claude (`claude-sdk-lane-runner.ts` `applyTurnSettings`: `setModel` succeeds,
  `applyFlagSettings` fails, `currentModel` already changed) and ACP (`provider-session-lane-handle.ts` `applyTurnSettings`:
  model set, then `setEffort` false). The contract says a refusal means nothing was sent. Fix: apply effort first when
  it is the likelier refusal, or roll back the model, or return a result naming what applied.
- M3. Copilot/Pi/OpenCode accept any model string when `listModels()` is empty (`copilot-sdk.adapter.ts` `applyTurnSettings`,
  Pi and OpenCode likewise) and persist it in `nextTurn`. A typo fails every later spawn until changed, with success
  reported at apply time. Fix: label the result as unverified, or clear `nextTurn.model` after a spawn failure.
- M4. Turn counters drift on an unsolicited result frame. `turnRunning = queuedTurns > completedTurns`
  (`claude-sdk-lane-runner.ts:~343`) and `completedTurns++` runs on every result frame (`onTurnResult`). A CLI-initiated
  result (background task notification) makes `completedTurns` exceed `queuedTurns`, so `supportsInterrupt` is false
  and `interrupt()` is a silent no-op during a real turn; `pendingTurns.shift()` has the same flaw already. Fix: ignore
  result frames when no turn is queued, and settle by turn identity.
- M5. `continue()` leaks a turn on a named-lane refusal. `queuedTurns++` and `enqueueTurn()` run before
  `context.named.enqueue` and the second `closed` check (`:524-531`), and are not undone when either throws. The
  leaked resolver sits at the queue tail, so a later turn's `done` is settled by the wrong result frame, and
  `supportsInterrupt` stays true. Fix: undo both on throw, or enqueue after the gate accepts.
- M6. Dormant steer: missing `user_message_uuids` counts every steer as missed (`reconcileSteers`, `:352-367`). An older
  CLI that omits the field gets a phantom resolver after every steer, so the next real turn's `done` never settles
  (deadlock), plus a false "A message may start the next turn." Also `pendingSteers.add` runs before the named
  `enqueue`, so a throw leaves a stale uuid; and a `continue` pushed before a steer makes `splice(1,0)` put the
  placeholder ahead of the wrong turn. Dormant now (`manifestSteer` is never passed: grep confirms only the
  declaration at `:208` and the check at `:568`), so this must be fixed before Batch 30 flips it. Fix: treat an absent
  field as "unknown, assume folded", clean `pendingSteers` on enqueue failure, and insert the placeholder by position.
- M7. Codex and ACP refusal text can carry provider text. `codex-app-server-lane.adapter.ts` `applyTurnSettings` appends
  `error.message.slice(0,200)`; Claude does the same for unnamed lanes. The comment says "fixed text", but nothing
  enforces it, and Codex lanes can name paths. Fix: use fixed text, log the detail.

## Minor

- m1. Claude live usage reads the first frame per `message.id` (`ptah-cli-stream-loop.service.ts` `emitMessageUsage`):
  early frames can hold placeholder `output_tokens`. Corrected by the turn segment, so only the live number is low.
  Subagent messages (with `parent_tool_use_id`) are also counted live; the turn total corrects them.
- m2. Codex `cumulative` regression handling restarts at the current value (`lane-usage-normalizer.ts`), over-counting on
  a partial regression; the turn segment corrects it.
- m3. Unbounded `listModels()` in `applyTurnSettings` / `listTurnOptions` for Codex, Copilot, Pi, OpenCode, Cursor.
  Add a timeout like Grok's 8 s.
- m4. Claude maps `max` to `xhigh` but returns `reasoningEffort: 'max'` as applied (`:~397-420`); the catalog also
  lists `max`. Return the applied value.
- m5. `setModel` mid-turn may change the model for the remaining requests of the running turn, yet the result says
  `appliesAt: 'next-turn'`.
- m6. Restored ACP records declare images and skills `supported` statically with no live gate; a restored lane has no
  handle until resumed, so it can offer images the agent never advertised. The refusal on send is visible, so this is
  only a UI over-offer.

## Focus areas

1. Declared vs handled: every declared item has its handle op for live lanes (Claude `continue/applyTurnSettings/listTurnOptions/turnInputSupport`; Codex; ACP; Cursor images). Exceptions: S1, S2, M1. Refusals are typed (`LaneTurnSettingRefusal`) or reject `continue` (ACP image without advertisement; Claude unresolved image).
2. Interrupt: Claude keeps the session, `interruptPending` is per turn index, cleared on result and `finish`, and only an
   `error_during_execution` of the flagged turn becomes exit 0 (`:332-344`). The router awaits `currentTurnDone` after
   `interrupt()` (`agent-message-router.service.ts:352-370`), so Codex returning on acceptance is safe. Timeout
   keeps the flag and emits the late-interrupt segment. A timeout rejection leaves the `Promise.race` loser handled (no
   unhandled rejection). Concern: M4, M5. Codex clears `interruptedTurnId` on every exit path.
3. Usage: `message`/`turn` pairs for Claude, Copilot, OpenCode and Pi sum correctly through the normalizer (turn
   increment = total minus running sum). Codex `cumulative` then `turn`. Cursor and ACP turn only. No double count found.
   Counters present in a message but absent from the turn total are not corrected (e.g. `totalTokens`); not seen in the
   current producers.
4. Images: Claude resolves the media type and throws before queuing (`:153-160`); size is bounded by the RPC schema
   (`agent-message-rpc.handlers.ts:~40`, 8 images, size cap, `image/*` regex). Codex, ACP and Cursor pass the declared
   `mediaType` through unresolved; they are bounded only by the RPC regex, so a mislabelled image is sent as declared
   (m-level; recommend resolving in the shared planner for all adapters).
5. Dormant steer: not activatable by accident (M6 detail above).
6. `applyTurnSettings`: Claude/Codex/ACP/Cursor next-turn; Copilot/Pi/OpenCode next-spawn with the right `appliesAt`.
   Refusals are reported on all adapters; see M2/M3.
7. Leaks: none found. Timers cleared in `finally`; the abort listener is removed in `finish`; no new listeners or
   child processes.

## Executor decisions

- Prompts unsupported only in yolo: correct, but not applied for claude-cli (M1).
- Claude `builtin` = command, other = skill: acceptable and reversible; the SDK has no better field.
- ACP efforts from the profile mapping: acceptable; an unsupported value refuses visibly. Note the partial-apply case (M2).

## Verdict

REVISE. Fix S1 and S2, then M1, M4, M5 and M2 in one round; M6 must be fixed with Batch 30 before steer activates.
Confidence: MEDIUM (no live runs; CLI behaviours for S2 and the SDK interrupt result subtype are assumptions A3).
