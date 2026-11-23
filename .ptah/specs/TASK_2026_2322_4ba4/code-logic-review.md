# Code Logic Review — `TASK_2026_2322_4ba4`

Review family: same-family review (implementers were Claude subagents, reviewer is Claude); no other execution side available in this session; weaker evidence. No builds or tests were run (the orchestrator owns the gate).

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 7/10     |
| Assessment          | REVISE   |
| Blocking issues     | 0        |
| Serious issues      | 1        |
| Moderate issues     | 2        |
| Failure modes found | 3        |

## Five logic questions

### 1. How does this fail silently?
- The below-floor verdict is cached forever per binary key (`antigravity-cli.adapter.ts:313-325`, `acpFloorByBinary.set(binary, meetsFloor)` for `false` too). The lane then keeps failing after the user upgrades agy (see S1). It is not silent, but it is a false failure.
- A resume id from the old stream-json era makes the ACP attach fail and a new session starts with one info line (`parity-inventory.md:47`, covered by spec `acp.spec.ts:426`). The conversation context is silently lost. That is accepted and informed by the info line.
- No new swallowed-error paths were found. The `diagnostic` branch (`provider-session-lane-handle.ts:138-142`) redacts then classifies, the same order as the old adapter (main `antigravity-cli.adapter.ts:1690-1695`).

### 2. What user action produces unexpected behaviour?
- Upgrading agy while Ptah runs, then retrying a lane. The cached `false` blocks it with "Update agy and try again", although the user has just done that (S1).
- Running an `agy` below 1.5.1 gets the upgrade error. This is accepted removal P1.

### 3. What input data produces a wrong answer?
- `redactLaneStderr` reuses the old regexes unchanged (`lane-stderr-redaction.ts:19-27`). A line such as `authorization: 401 Unauthorized` becomes `authorization: [REDACTED]`, which drops `401` and downgrades the classification. This was the same in the old adapter, so it is not a regression. The spec cases cover only lines with no secret field, so that interaction is untested.
- `INLINE_SECRET` matches `session:` and `cookie:`, so a harmless `session: resumed` line is masked on Grok lanes too. This is documented as intended.

### 4. What happens when a dependency fails?
- ACP open failure: the lane fails with the session's single error and `done` is 1 (`provider-session-lane-handle.ts:340-345`). The held-output machinery is gone, and setup output reaches the lane directly. Spec `acp.spec.ts:411` covers it.
- `agy --version` unreadable: `probeAcp` returns `undefined`, nothing is cached, the lane tries ACP, and each lane re-probes (`:329-343`). This is fine. Every `detect()` logs a warn while the version stays unreadable (M2).
- Concurrent probes share one in-flight promise and `.finally` clears it (`:317-323`). A rejected probe also clears. OK.

### 5. What is missing that the requirements never mentioned?
- A cache invalidation or TTL for the floor verdict (S1).
- Windows conpty noise suppression (`conpty_console_list_agent`, `AttachConsole failed`) that the old agy stderr handler had (main adapter ~1672-1688) is not carried over. The inventory lists no such row, and the ACP profile sets `NODE_PTY_USE_CONPTY=0`, so this is probably moot (M3).

## Failure modes

### Stale below-floor verdict after an agy upgrade
- Trigger: the first probe sees agy < 1.5.1, the user upgrades agy in place (same path), and Ptah is not restarted.
- Symptom: every lane still rejects with "need agy 1.5.1 or later (installed: <old>)". `detect()` also reports the old version, because `probeAcp` returns the cached verdict before reading anything, so `knownVersion` is ignored.
- Evidence: `antigravity-cli.adapter.ts:313-325`, `:589-602`. Before this task a `false` only chose stream-json, so a stale value was harmless. It now blocks the lane.
- Current handling: the Map is never cleared.
- Recommendation: do not cache `false` (re-read `--version`, which is cheap), or give it a short TTL, or key the cache by version string.

### Retired-slot sweep removes lane-shaped entries
- Trigger: the sweep runs on every full reconcile and removes `ptah` entries of the `/agent/{id}` shape.
- Evidence: `retired-ptah-mcp-slots.ts:79-91, 128-165`. The shared guard (`:147-156`) requires a remote entry with no `command` and no `headers`, so a user's `ptah` server with headers or a command is safe. The current build's ACP lane attaches `ptah_lane` over `session/new` and writes no file. I grepped for other current writers of an `/agent/` URL into `~/.gemini/config/mcp_config.json` or `{ws}/.agents/mcp_config.json`. None was found. The other `ptahMcpServerUrl` users write their own CLIs' configs. The remaining risk is a user-authored `ptah` entry with a bare `http://localhost:PORT/agent/x` URL, which is negligible, and an older Ptah build running a lane at the same time, which is documented as accepted. The log names the shape. Acceptable as designed.

### Resume of a stream-json-era id
- Trigger: a persisted agy conversation id from the old transport.
- Evidence: the attach falls back to a new session with an info line (`parity-inventory.md:47`, spec `acp.spec.ts:426`).
- Impact: context is lost, but the user is told. Acceptable.

## Blocking issues

None.

## Serious issues

### S1. The version-floor `false` is cached for the life of the process
- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts:313-325` (cache), `:597-602` (throw).
- Scenario: see the failure mode above.
- Impact: after a user follows the error message and updates agy, lanes and the detection row stay wrong until the app restarts. The message tells the user to fix something already fixed, with no other signal.
- Fix: cache only `true`. A `false` re-probes `--version` on the next lane or detect, and the in-flight map already de-duplicates concurrent probes. Add a spec: first `1.5.0`, then `1.5.2` at the same binary, and the lane runs.
- Test gap: `acp.spec.ts:348` and `:388` do not cover an upgrade after a `false`.

## Moderate and minor issues

- M1 (Moderate): `redactLaneStderr` spec has no case where a secret field and a status code share a line (for example `authorization: 401`). The stated "classifyCliStderr still classifies 401/429/RESOURCE_EXHAUSTED" is asserted only on lines with no secret field (`lane-stderr-redaction.spec.ts:46-55`), so it is a weak assertion for that claim. The behaviour is identical to the old code. Document or test it.
- M2 (Moderate): with an unreadable version, `runAcpProbe` logs a warn on every `detect()` call and every lane (`antigravity-cli.adapter.ts:336-343`). This can be noisy because detection polls.
- M3 (Minor): the conpty and AttachConsole stderr suppression for agy was dropped without an inventory row. Confirm that the ACP spawn (`NODE_PTY_USE_CONPTY=0`, hidden console) produces no such lines.
- M4 (Minor): `INLINE_SECRET` masking of `session`/`cookie` fields now applies to Grok lane stderr. This is documented (`lane-stderr-redaction.ts:4-7`), but it is a behaviour change for Grok.

## Data flow

1. `detect()` calls `resolveCliPath('agy')`, then `probeCliVersion`, then `probeAcp(path, version)`. A cached verdict is returned without using the new version (S1). Otherwise OK.
2. `runSdk` calls `probeAcp(binary)`. A cached or in-flight verdict is shared. `false` throws the upgrade error, and `undefined` proceeds to ACP. OK apart from S1.
3. `runAcp` validates the policy, trusts the folder, maps the model id and calls `createProviderSessionLaneHandle`. The constructor signature is now `(spawner?, logger?, acp?, readSignIn?)`. Callers: `cli-detection.service.ts:189` (updated), the specs, and the live spec. No other callers in `libs/` or `apps/`. OK.
4. The lane handle calls `session.start()` and then `releaseCredentialOnExit()`. A setup failure returns 1, with no fallback. OK.
5. Stderr `diagnostic` events go through `redactLaneStderr`, then `output` and `segment`, with severity computed on the redacted text. OK.
6. The sweep calls `removeRetiredPtahEntry`, which now returns `'lane' | 'persistent' | false`. The only caller is `sweepRetiredPtahMcpEntries` (`:248`), which checks `!== false`. OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| Remove the stream-json transport, ACP only | COMPLETE | None. No leftover references to `PTAH_AGY_TRANSPORT`, `ProviderSessionLaneFallback`, `redactAgyText` or `agyHelpListsAcp` in `libs/` or `apps/` source. |
| Keep the version floor | COMPLETE | The cached `false` is stale (S1). |
| Move stderr redaction to the lane handle (agy and Grok) | COMPLETE | The token scrub runs after the regex pass and guards an empty token. |
| Lane-shaped sweep | COMPLETE | Accepted older-build risk. |
| Keep model-id cache, trust write, MCP timeout, credential revoke | COMPLETE | None found lost. |
| `detect()` reports `interrupt` messaging | COMPLETE | Uses the ACP manifest, and spec `adapter.spec.ts:389` asserts it. |

Implicit requirements not addressed: a re-probe after an upgrade (S1), and the conpty noise filter (M3).

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Concurrent first lanes | YES | the in-flight map | none |
| Unreadable version | YES | `undefined`, not cached, the lane tries ACP | warn noise (M2) |
| Version below the floor, then upgraded | NO | `false` cached | S1 |
| Empty `mcpToken` | YES | the guard avoids a replace between every character | none |
| User's own `ptah` server with headers or a command | YES | the shared guard | none |
| Live lane entry from an older build | PARTIAL | removed, documented | accepted |
| ACP open failure | YES | one error, `done` 1 | none |

## Verdict

- Recommendation: REVISE (one small fix, S1)
- Confidence: MEDIUM (same-family review, no execution)
- Top risk: a stale cached below-floor verdict blocks lanes after the user upgrades agy.
- What a robust implementation would add: do not cache `false` (or add a TTL) and test it; one spec for a secret field next to a status code in the stderr redaction; downgrade the unreadable-version warn on `detect()` to debug after the first occurrence.
