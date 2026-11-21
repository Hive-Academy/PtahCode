# Code Logic Review, Round 2 — `TASK_2026_2291_p3`

Scope: `git diff 61cec87d9` plus the uncommitted fix round. Read in full: `antigravity-cli.adapter.ts` (probe, transport, `runAcp`, `runSdk`, `detect`), `antigravity-acp-lane.ts`, `provider-session-lane-handle.ts`, the runtime usage change (`acp-session-runtime.ts`, `acp-session-helpers.ts`), `antigravity-acp-profile.ts`, the manager hooks that consume the handle (`agent-process-manager.service.ts:1771-1862, 4150-4200`), and the fixtures' usage lines.
Run: `provider-session-lane-handle.spec.ts` and `antigravity-cli.adapter.acp.spec.ts`: 107 passed, 2 suites (`.ptah/tmp/r2-cli.log`). Nothing else executed.

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 8/10 |
| Assessment | APPROVED (with three Moderate follow-ups worth doing before the PR) |
| Blocking | 0 |
| Serious | 0 |
| Moderate | 3 |
| Minor | 8 |

## 1. Round-1 findings

| Finding | Resolved | Proof |
| --- | --- | --- |
| S1 plan/auto-edit auto-approve | Yes | `runAcp` passes `autoApprove: antigravitySkipsPermissions(options)` (`antigravity-cli.adapter.ts` runAcp); the same predicate picks the spawn flag (`antigravity-acp-profile.ts` buildSpawn), so sink and flag cannot drift. Spec `acp.spec.ts:490-540` (auto-edit/plan get reject, yolo and unattended default allow). |
| S2 negative probe cached | Yes | `runAcpProbe` returns `undefined` for unreadable version, timeout, spawn error and empty help; only definite answers reach `acpSupportByBinary` (`probeAcp`). `readAgyHelp` stores help only from a child that closed with output. Specs `acp.spec.ts:180-245` (timeout twice then ACP; definite "not listed" spawns once; concurrent share one promise). |
| S3 no escape | Yes, with caveats M2, M3 below | Fallback in the lane handle plus `PTAH_AGY_TRANSPORT`. Specs `lane-handle.spec.ts:1630+` (7 cases) and `acp.spec.ts:581-646`. |
| MCP name clash | Yes | `ptah_lane` in the profile; live D9 evidence in `fix-round-1.md`. |
| `capabilities()` last-probed | Partly | Each run now validates against its own manifest (`runAcp` uses the ACP manifest, `runStreamJson` the stream-json one). `capabilities()` still reads the last-probed field; documented. Acceptable. |
| Missing model on usage | Yes | `readAcpStandardUsage` plus `sessionModel()`; model option is `binding: true` for agy and Grok (`grok-acp-profile.ts:142`), so `options.model` is what ran. |
| ACP quota proof | Partly | Synthetic wording only; no recorded agy ACP quota error. Honestly stated in `fix-round-1.md`. |
| Projector state after interrupt | Yes | Fresh projector in `runTurn` (`lane-handle.ts:296-298`), spec in the interrupt case. |
| Probe de-dup, `streamJsonProbe` seam, cache key | Yes | `acpProbesInFlight`; the ACP probe reads help itself. |

## 2. Regression checks requested

**Stream-json fallback after ACP setup failure**
- Single `done`: `runFirstTurn` returns `runFallback` -> `next.done` (`lane-handle.ts:411-415, 408`); the ACP session never produces a second turn. OK.
- No leaked agy: a failed setup stops the child on every path (`acp-session-runtime.ts:1196` timeout, `:1204` throw, `:1182` abort). OK. No spec asserts the ACP child is gone before the fallback spawns (Minor).
- No duplicated segments: setup output is held (`deliver`), dropped on fallback (`held.length = 0`, `:366`), and `onEvent` ignores everything once `delegating` (`:204`), including late exit/stderr from the killed child. When the fallback is not taken, `releaseHeld` flushes in order. A setup noisier than 200 items releases and forfeits the fallback, with its errors visible. OK.
- Fallback gate: `sessionId` is assigned only after `session/new` or resume succeeds (`runtime.ts:1085`), so "no session id" really means "never opened". `auth-required`, abort and a refused model correctly do not fall back. Abort during `fallback.run()` is handled by the check at `:391`. The fallback gets the original `options` (model, autoApprove unmutated).
- Manager reads `getPid` live at kill time (`manager:4167`), so it hits the delegate's pid. OK. `outcomeUsageIsTurnTotal`/`usageScope` match the stream-json handle (`adapter.ts:1550`).

**Probe cache / concurrency.** In-flight map is keyed per binary and cleared in `finally`; a rejection reaches every awaiter and does not poison the map. `undefined` is never cached, so a flaky probe retries. Definite answers live for the process lifetime (an agy upgrade mid-session is not seen until restart; Minor, same as the stream-json cache).

**`PTAH_AGY_TRANSPORT`.** `acp` skips probe and fallback (`probeAcp` early return, `runSdk` passes `fallBack=false`); `stream-json` never probes or spawns `agy acp`; `capabilities()` follows it. Read per call from `process.env`, trimmed and lower-cased. An unrecognised value silently means `auto` (Minor).

**Usage via `result.usage`.** Precedence is exclusive: `_meta.usage`, else protocol usage, else `usage_update` (`runtime.ts:1345-1347`), so no double count. Grok's fixtures carry `_meta.usage` and no top-level `usage` on the prompt reply, so Grok's path is unchanged except that it now also gets its model. The agy fixture satisfies `12618 + 8415 + 37 = 21070 = totalTokens`, so `inputTokens` excludes cache reads and adding `cacheReadTokens` does not double count.

**Lane handle skipping the projector "Error:" row.** `error` events are not projected (`:186-189`); a failed `terminal` is skipped only when the same turn showed an error and has no rows (`:190-197`). Turns with rows still get `message_complete`. The error reaches the card as its segment. Turn keys match because the runtime stamps `turnId` on both. OK.

**Degradation audit.** No new catch returns a literal. The two catches in `testing/tee-transport.ts` are marked `optional-capability` and are test recorders. `child.on('error', () => finish(undefined))` is an error handler, not a catch, and its caller logs a `warn` and returns the "could not tell" `undefined`, which is distinguishable from a real answer. The new fallback catch logs through `logger.error` and emits an error segment.

## 3. Findings

### Moderate

**M1. After a fallback, a failed `mcp_config.json` write is never reported.**
- `lane-handle.ts:515-517` forwards `delegate?.mcpConfigWriteFailed`, but the manager reads it once, synchronously, at spawn (`agent-process-manager.service.ts:1771`), before the ACP setup has failed. The getter is effectively dead. The stream-json handle's own timeout warning is guarded by `mcpConfigured` (`adapter.ts` startup `.then`, `mcpConfigured &&`), so a failed write also never produces the handshake-timeout warning.
- Impact: ACP setup fails and the config write fails (rare double fault): the lane runs on stream-json with no Ptah MCP and no warning.
- Fix: when a fallback starts, emit the warning from the lane handle if `next.mcpConfigWriteFailed` is true (it is a plain boolean available right after `fallback.run()`), or route it through `onMcpAttachmentTimeout`. Add a spec.

**M2. A persistent ACP failure costs every lane the full handshake wait.**
- `ACP_HANDSHAKE_TIMEOUTS_MS` is 45 s (initialize) and 90 s (session) (`acp-session-runtime.ts:118`). The fallback keeps no memory of the failure, so every lane re-spawns `agy acp` (a roughly 1 GB unpack per the research notes) and waits before falling back.
- Fix: remember a setup failure per binary for a cooldown (for example 10 minutes) in the adapter and route straight to stream-json, with a `warn` once.

**M3. Resume id crosses transports on fallback.**
- `run: () => this.runStreamJson(options)` (`adapter.ts` runAcp) hands the original `options.resumeSessionId` to `--conversation`. If that id was minted by ACP it may be unknown to the stream-json lane; the spec only asserts "same options" (`acp.spec.ts:601-606`), not that an ACP id is accepted. Unverified either way.
- Fix: verify live once; otherwise drop `resumeSessionId` for the fallback when it came from ACP, or log the mismatch.

### Minor

- `detect()` wraps the new `probeAcp` in the existing catch (`adapter.ts` detect), which returns `installed: false` and discards the error unlogged; `runSdk`'s `probeAcp` rejection throws instead of using stream-json. Both only on a thrown spawn error.
- `readAgyHelp` drops the spawn-error or timeout reason; the `warn` lines say "could not read" with no cause.
- Detection can now wait up to three serial 8 s reads (stream-json help, ACP help, plus a `runSdk` re-probe) on a slow first start.
- `PTAH_AGY_TRANSPORT` is env-only and a typo silently means `auto` (`antigravity-acp-lane.ts:29-33`). A packaged-app user cannot easily set it. A setting remains open per the decision table.
- The fallback adapter specs stub `runStreamJson` (`acp.spec.ts:582-596`); the real stream-json run under fallback options is not exercised, and no spec asserts the failed ACP child is killed first.
- Narrow race: a `session/new` reply landing just after the handshake timeout still sets `sessionId` and emits `onSessionResolved` (`runtime.ts:1085-1088`), which could persist an ACP id for a lane that then runs on stream-json.
- `readAcpStandardUsage` drops `thoughtTokens` (reasoning output could be undercounted when non-zero) and, when the agent sends both protocol usage and a richer `usage_update._meta.usage`, the richer one (cost) is ignored. Neither applies to current fixtures.
- Quota classification on ACP is proven only with synthetic wording; effort for a model without `thought_level` is still dropped silently; the reverse resume direction is still unspecced (all carried from round 1).

## 4. Five logic questions (delta)

1. Silent failure: only M1.
2. User action: setting `PTAH_AGY_TRANSPORT` with a typo; resuming an ACP lane after a fallback (M3).
3. Wrong answer from data: none new; usage totals checked against the fixture.
4. Dependency failure: ACP setup failure now degrades to stream-json (M2 cost); probe failures retry.
5. Missing: failure memory (M2), fallback MCP warning (M1).

## 5. Verdict

- Recommendation: APPROVE
- Confidence: MEDIUM-HIGH (read all new code and ran the two main specs; live agy not re-run)
- Top risk: M1, a lane that fell back and lost its Ptah MCP with no warning (rare double fault).
- Worth adding before the PR: the M1 warning plus spec, a per-binary ACP failure cooldown (M2), and one live check of an ACP session id passed to `--conversation` (M3).
