# Batch report — TASK_2026_2290_p2 (phase P2 of TASK_2026_2288_acp1)

Worktree: `D:/projects/PtahCode/.claude-worktrees/provider-session-p2` (branch
`feat/provider-session-p2`, stacked on P1 `aa0838099`). Nothing was staged or committed. A
`node_modules` junction to the main checkout was created for jest (git ignores it).

## What P2 delivers

| Plan item (Component 2 "Responsibilities (P2)") | Where | Proven by |
| --- | --- | --- |
| Protocol 1/2 tolerance (D8): request 1, accept 1 or 2 when the reply is v1-shaped, else `protocol-unsupported`; no v2 codec | `acp-protocol-negotiation.ts` | `acp-protocol-negotiation.spec.ts` (agy + grok recorded replies), runtime specs |
| `authenticate` once, only when the profile names a method, it is advertised, and `session/new` answers -32000 | runtime `createSession` | hardening spec (agy fixture authMethods) |
| `session/set_mode` when advertised, else a `mode` config option; `setMode` / `setModel` on the session | runtime `applyMode`, `setModel` | hardening spec (agy fixture modes) |
| Interrupt keeps the process (`session/cancel`, profile `cancelBehavior: 'await-reply'`), terminal `interrupted/reusable` | runtime `interrupt` | hardening spec + lane spec on `grok-p2-cancel-mid-shell` |
| Extension hooks (`extensions.notification`, `extensions.request`, `cancelMeta`, `initializeMeta`); no vendor string in generic code | `acp-vendor-profile.ts`, runtime handlers; the `_x.ai/mcp/servers_updated` log moved into `grokAcpProfile` | hardening spec, grok profile spec |
| Spawn spec `{ args, env: { mode, set, remove? }, needsConsole? }` applied to `baseEnv`; spawn through `IProcessSpawner` (M-2 switch) | `acp-spawn-env.ts`, `acp-process-transport.ts` | `acp-spawn-env.spec.ts`, transport spec, hardening spec |
| Generation guard + respawn on next prompt (`respawnOnPrompt`, re-attach with `attachFailure: 'error'`) | runtime `Generation`, `dropStale`, `respawn` | hardening spec (late update and stderr from a dead process dropped; respawn resume; resume-failed) |
| Require-resume (`attachFailure: 'error'` -> `resume-failed`); lanes keep the new-session fallback | runtime `setUpSession`; lane passes `'new-session'` | hardening spec, existing lane resume specs |
| `session/load` replay capture incl. user turns, bounded 5,000 with a truncation `info` | `acp-replay-collector.ts`, runtime `getReplay()` | collector spec, hardening spec on `grok-p2-session-load-replay`, live agy spec |
| Approval-sink adapter (A17: `acceptForSession` -> `allow_always` else `allow_once`; abort / sink failure -> `cancelled`) | `acp-approval-adapter.ts`, runtime `answerPermission` | adapter spec, hardening spec on `grok-p2-permission-allow-once` |
| Lane prompt watchdog (`promptTimeoutMs`, lanes 3,600,000 ms) -> `prompt-timeout` + cancel + kill | runtime `runPromptTurn`; `LANE_ACP_PROMPT_TIMEOUT_MS` | hardening spec |
| Antigravity fixture from PF-4 | `__fixtures__/antigravity-p2-handshake.ndjson` (evidence converted to the fixture envelope, `tier` already redacted) | negotiation + hardening specs |
| Grok lane interrupt | lane handle `interrupt` / `supportsInterrupt`; Grok manifest `interrupt: supported` | lane spec (process survives, continue on same pid) |
| Gated live spec | `src/lib/live/agy-acp.live.spec.ts` (`describe.skip` unless `PTAH_LIVE_AGY=1`) | run live, see checks |

## P1 review carry-overs

- **M-1** per-turn replay ids: the mapper numbers id-less user chunks on each role change
  (`user-message-<n>`); the collector merges chunks of one user turn and opens a replay turn per
  user turn (`<sessionId>:replay:<n>`); the projector message id uses the turn id. Specs: mapper
  two-turn case, collector spec, projector two-turn case.
- **M-3** stream rows for failures: `error` -> `Error: <message>` text block of the turn's
  assistant message; `terminal failed` with no message opens and completes one. Projector spec.
- **m-1** lane-level SDK-unavailable: `provider-session-lane-handle.sdk-unavailable.spec.ts`
  (done 1, one error segment, `[Agent] ...` output line, agent killed).
- **m-3** runtime sets `replayed`: every replay event carries `replayed: true` (collector).
- **m-4** (Grok `onStreamEvent`) left for P3 as instructed.

## PR #1444 review fixes

1. Already-aborted signal: `createAcpSession` calls the abort handler once when the signal is
   already aborted (child stopped), and `start()` returns `{ ok: false }` without any request.
   Spec: hardening "stops the child at once when the signal was already aborted".
2. Overlapping prompts: a `prompt()` while an earlier one has not settled rejects at once
   (`<name> is still running a turn; wait for it before prompting again`) and sends nothing;
   documented on `AcpSession.prompt` and `ProviderSession.prompt`. Spec: hardening "rejects an
   overlapping prompt".
3. Task prompt first: the lane refuses continuations until the task prompt is sent
   (`supportsContinuation()` false; `continue()` rejects with `<name> has not sent its task prompt
   yet; send the message after it`), covering the up-to-15 s MCP attachment wait. Spec: lane
   "refuses continuations until the task prompt was sent".

## Files

Created (acp-runtime `src/lib/`): `acp-protocol-negotiation.ts`, `acp-spawn-env.ts`,
`acp-approval-adapter.ts`, `acp-replay-collector.ts` (+ a spec each),
`acp-session-runtime-hardening.spec.ts`, `__fixtures__/acp-fixture-reader.ts`,
`__fixtures__/antigravity-p2-handshake.ndjson`, `live/agy-acp.live.spec.ts`.
Created (cli-agent-runtime `cli-adapters/provider-session/`): `lane-acp-spawn.ts` (+ spec),
`provider-session-lane-handle.sdk-unavailable.spec.ts`.
Deleted: `provider-session/cli-acp-spawn-transport.ts` (+ spec) — replaced by the spawner path.

Modified: acp-runtime `index.ts`, `README.md`, `testing/index.ts`, `acp-session-runtime.ts`
(rewrite), `acp-vendor-profile.ts`, `acp-process-transport.ts`, `acp-sdk-loader.ts`
(`authenticate`, `setSessionMode`, `acpMethodNotFound`), `acp-session-helpers.ts` (`readModeIds`),
`acp-permission-policy.ts` (helpers exported), `acp-session-update-mapper.ts`,
`profiles/grok-acp-profile.ts` and the matching specs; provider-session-contracts
`flat-stream-projector.ts` (+ spec), `provider-session.types.ts` (prompt doc); cli-agent-runtime
`provider-session-lane-handle.ts` (+ spec), `grok-cli.adapter.ts` (+ spec).

## Decisions / deviations

- **No `session/set_model`**: `@agentclientprotocol/sdk` 1.7.0 has no such request
  (`acp.d.ts` lists `setSessionMode` and `setSessionConfigOption` only), so `setModel` writes the
  `model` config option. Reversible when the SDK adds it.
- **Attach method** (plan: `resumeStrategy` removed): `options.attachMethod` is the preference
  (lane: `resume`); the other method is used only when the preferred one is not advertised. There
  is no second attempt after a failure, so the old `resume-then-load` lane spec became "prefers
  resume when both are advertised". Grok advertises both, so its lane behaviour is unchanged.
- **Headless lane approvals stay on `decideAcpPermission`** (no headless sink wrapper): fixture
  identical for the Grok lane; the sink path is used only when `approvals` is given (chat, P7).
- **Interrupt for the lane**: superseded by fix round 1 (S-1): the interrupted turn's `done`
  resolves 0, as Cursor's does, so the lane is not recorded as failed; aborting the whole lane
  still resolves 1. The router then continues on the same session.
- **Missing spawner**: the lane fails at once with one error segment instead of spawning through
  `spawnCli`; production always passes the spawner (`cli-detection.service.ts:193`).
- **Sign-in message**: `auth-required` keeps the profile's `describeError` wording when it gave
  one (Grok: `run \`grok login\``), else `<name> is not signed in: <signInHint>`.
- **`signInHint` and `cancelBehavior`** added to the profile contract (`signInHint` required,
  `cancelBehavior` optional, default `kill` = no interrupt offered).
- **Grok `detect().messagingMode`** is now `interrupt` (follows the manifest via
  `bestMessagingCapability`); spec updated.
- **Images** (`promptCapabilities.image`) not wired: no P2 caller sends images. Deferred to P7.

## Check results (exact)

- Focused jest `acp-runtime` (all suites, before the review fixes): 10 passed, 1 skipped (live),
  121 tests passed; hardening spec re-run after fixes: 20/20 passed.
- Inner loop `PTAH_VERIFY_SLOTS=1 npm run verify -- --related -p acp-runtime,provider-session-contracts,cli-agent-runtime`:
  `NX 3 tasks: 3 succeeded` (0/3 cache hit), exit 0. Run before the three PR #1444 fixes and the
  last lint fixes; those were then covered by the gate below.
- `PTAH_VERIFY_SLOTS=1 npm run verify -- -t lint,typecheck -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine`:
  first run `7 succeeded, 1 failed` (acp-runtime lint: `no-useless-escape` in a transport spec,
  `prefer-const`); fixed; second run `NX 8 tasks: 8 succeeded`, exit 0. One remaining lint
  **warning**: `acp-session-runtime.ts` max-lines (1085 > 700).
- Full gate `PTAH_VERIFY_SLOTS=1 npm run verify -- -p acp-runtime,provider-session-contracts,cli-agent-runtime,cli-engine`:
  lint/typecheck `NX 8 tasks: 8 succeeded`; test `NX 4 tasks: 3 succeeded, 1 failed` —
  `@ptah-extension/cli-engine:test` failed; lock released exit 1. (My wrapper shell was then
  reaped for low memory; the gate itself had finished.)
  - Diagnosis, focused `npx jest --config libs/backend/cli-engine/jest.config.cjs --runInBand`
    under the verify lock: 30 suites passed, 1 failed, 291/291 tests passed. The failing suite is
    `bootstrap/session-store-migration.spec.ts`, "Test suite failed to run: ENOENT ...
    `%TEMP%\ptah-cli-lock-*\Ptah CLI.log`". It imports only `node:fs/os/path` and
    `./session-store-migration`; P2 changes no cli-engine file. Not verified against `main`
    (memory: 4.5 GB free); treat as an environment/temp-dir failure to confirm on main or CI.
- Live: `PTAH_LIVE_AGY=1 npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/live/agy-acp.live.spec.ts`
  against agy 1.5.13: **1 passed** (12.4 s, on the final code; also passed earlier at 11.6 s):
  handshake, `session/new`, one prompt with the token reply, second process `session/load` with
  the user turn and the reply in `getReplay()`. No `agy.exe` left afterwards (`tasklist`).
- Grok: fixtures only (not installed).

## Deferred

- `acp-session-runtime.ts` is over the 700-line lint limit (warning): split config/mode,
  approvals and turn handling into modules (P3 start or a follow-up).
- Images as ACP `image` content (P7, first caller).
- m-4 Grok lane `onStreamEvent` (P3, Electron visual check).
- Antigravity profile and lane (P3); `src/testing/tee-transport.ts` for turn recordings (P3).
- cli-engine `session-store-migration.spec.ts` failure: confirm on `main` / CI.
