# Code Logic Review — `TASK_2026_2291_p3`

Reviewer: same-family subagent (code-logic-reviewer); no other-family lane available.
Scope: `git diff HEAD` plus untracked P3 files (adapter ACP path, `antigravity-acp-lane.ts`, `antigravity-acp-profile.ts`, lane handle `onStreamEvent`, fixtures). Builds and tests were not run, per the brief. Evidence is from reading the code and the recorded fixtures.

## Summary

| Metric              | Value         |
| ------------------- | ------------- |
| Overall score       | 6/10          |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0             |
| Serious issues      | 3             |
| Moderate issues     | 5             |
| Failure modes found | 8             |

## Five logic questions

### 1. How does this fail silently?

- Permission widening on `plan` and `auto-edit`. The profile drops `--dangerously-skip-permissions` for those modes (`antigravity-acp-profile.ts` `skipsPermissions`), the same as the stream-json lane (`lane-spawn-policy.ts:256-261` removes the flag). But the ACP runtime answers every `session/request_permission` through `decideAcpPermission(request, { autoApprove: options.autoApprove })` (`acp-session-runtime.ts:378-381`). `resolveAutoApprove` returns `undefined` for antigravity (`agent-spawn-environment.service.ts:174-181`), and the sink treats `!== false` as approve (`acp-permission-policy.ts:90`). So an `auto-edit` lane auto-grants shell and MCP requests that the stream-json `--mode accept-edits` lane never granted. This is a silent loss of the permission guarantee.
- A transient probe failure pins the lane to stream-json for the life of the process. `probeStreamJsonInput` resolves false on its 8 s timeout or on a spawn `error`, and in the timeout case it never stores the help text (`antigravity-cli.adapter.ts:~552-575`). `probeAcp` then sees `help === undefined`, `agyHelpListsAcp` returns false, and the `false` is cached per binary (`:~610-618`). There is no retry, and the log line is only `info`.
- Injected `streamJsonProbe` (a seam kept for specs) never fills `helpTextByBinary`, so ACP can never be chosen with it. Minor, specs only.

### 2. What user action produces unexpected behaviour?

- Hitting an `agy acp` defect on 1.5.1+ leaves the user no way out. The first-turn ACP failure becomes one error segment and the lane fails. There is no setting to force stream-json, although the plan's failure behaviour says the error names a fallback setting (the batch report records this as open). Deciding it in P8/P9 leaves a shipped window with no escape hatch.
- Resuming an id across transports. `options.resumeSessionId` was captured from a stream-json `init` conversation id, and the ACP path uses `session/resume` or `session/load` with it. A failed attach falls back to a new session through `attachFailure: 'new-session'`, which the lane handle supports and which sends the full preamble again, so it is not silent. The reverse direction (an ACP id fed to `--conversation` after an agy downgrade) is not examined by any spec.

### 3. What input data produces a wrong answer?

- `agyModelId` plus `thought_level`. The stream-json lane appends the effort only to ids in `AGY_EFFORT_MODEL_BASES` (`agyModelWithEffort`). The ACP lane sends the base id and sets `thought_level` for any model without a suffix (`antigravity-acp-profile.ts` `sessionConfig`). The report shows live acceptance for one model. A model that does not advertise `thought_level` gets a non-binding entry, so the requested effort is dropped without a visible signal.
- ACP usage carries no model (`prompt` response usage in the fixtures has token counts only). The stream-json lane filled `modelLog.actualModel` from turn telemetry (`agent-process-manager.service.ts:1836-1840`). ACP lanes fall back to the provider name, so "actual model" is wrong or absent.

### 4. What happens when a dependency fails?

- `agy --version` or `--help` timing out falls back silently (see Q1).
- ACP quota or rate-limit failures arrive as JSON-RPC errors on the prompt, not as stderr lines. The stream-json lane classified stderr through `classifyCliStderr` and formatted result diagnostics through `antigravity-result-diagnostics.ts`. The ACP lane applies `classifyCliStderr` only to `diagnostic` events. No spec or fixture exercises a quota or rate-limit error on the ACP path, so the "rate-limit classification" parity row is unproven.
- Process death mid-turn: handled by the P2 runtime (exit watch, error event), and the live spec checks that the tree is gone after stop. This is not re-examined here.

### 5. What is missing that the requirements never mentioned?

- A name clash for the MCP entry. The ACP session sends an http server named `ptah`. `CodeExecutionMCP` keeps a persistent `ptah` entry (`PTAH_SPAWN_MCP_KEY = 'ptah'`, `mcp-facet.port.ts:81`) in the shared `mcp_config.json`, and D10 means agy reads that same file. Two servers named `ptah` (the file entry without a lane bearer, the session entry with one) can produce duplicate or shadowed `mcp_ptah_*` tools. The live test used a clean config, so this was not exercised.
- Harness-sync user MCP servers: not forwarded, and not dropped either. They stay in `mcp_config.json`, which agy loads from the shared profile (D10), so parity with stream-json holds. This should be recorded explicitly in the batch report; it is not.
- A concurrent-probe guard. Several lanes spawned before the first probe resolves each run `agy --version` and `--help` (no in-flight de-duplication).

## Failure modes

### Headless sink approves everything in plan and auto-edit

- Trigger: a lane with `permission: 'auto-edit'` or `'plan'`, antigravity, default settings.
- Symptom: agy requests permission for shell or MCP, and the sink answers `allow_once`. The stream-json lane would not have granted it.
- Evidence: `antigravity-acp-profile.ts` (`skipsPermissions`), `acp-session-runtime.ts:378-381`, `acp-permission-policy.ts:90`, `agent-spawn-environment.service.ts:174-181`, `lane-spawn-policy.ts:256-261`.
- Current handling: none.
- Recommendation: in `runAcp`, pass `autoApprove: skipsPermissions-equivalent` (true only for `yolo`, or for no permission with `autoApprove !== false`), so the sink rejects under `plan` and `auto-edit`.

### Probe failure cached as "no ACP"

- Trigger: slow first `agy --help` (over 8 s, cold unpack or AV scan on Windows), or a spawn error.
- Symptom: the whole session runs the stream-json lane, with no ACP, interrupt or continuation. `capabilities()` stays at stream-json.
- Evidence: `antigravity-cli.adapter.ts` `probeStreamJsonInput` (timeout path) and `probeAcp` (caches whatever it saw).
- Current handling: `info` log.
- Recommendation: do not cache a negative that came from a timeout, spawn error or empty help. Cache only after a successful, non-empty help read. Log at `warn` when a version at or above the floor yields "not listed".

### ACP failure with no escape

- Trigger: `agy acp` fails at handshake or on the first prompt on a version at or above the floor.
- Symptom: a failed lane on every run. Stream-json would have worked.
- Evidence: `antigravity-cli.adapter.ts` `runAcp` (no catch or fallback), batch report "Decisions".
- Recommendation: either add the user setting now, or fall back before any prompt is sent when the handshake fails (`setup.ok === false` and no prompt sent), keeping "no silent mid-run switch".

### Duplicate `ptah` MCP name

- See Q5. Evidence: `lane-mcp-attachments.ts` (name `ptah`) against `mcp-facet.port.ts:81`.
- Recommendation: use a lane-unique name (for example `ptah-lane`), or verify live with the persistent entry present. Record the result.

### Shared mutable `acpSupported` drives `capabilities()`

- Trigger: two binaries probed (a custom `binaryPath` and `agy`), or `capabilities()` called before any probe.
- Symptom: policy validation and `runAcp`'s own `validateLaneSpawnPolicy` (`:~640`) can disagree with the manager's earlier check. The manifest depends on whichever binary was probed last.
- Evidence: `antigravity-cli.adapter.ts:472-474`, `:~616`.
- Recommendation: low risk in practice (one binary). Cache by binary and have `capabilities()` take the active binary, or document the single-binary assumption.

### Lost model in turn telemetry

- See Q3. Evidence: ACP `usage` in `antigravity-p3-*.ndjson`; `agent-process-manager.service.ts:1836`.
- Recommendation: pass the configured model id as the fallback model in the usage projection, and record the gap.

### Un-exercised rate-limit path

- See Q4. Recommendation: add one recorded or synthetic quota error through the ACP path and assert the segment classification matches the stream-json one.

### Probe call with no known version in `runSdk`

- `runSdk` calls `probeAcp(options.binaryPath ?? 'agy')` with no `knownVersion` (`antigravity-cli.adapter.ts:~888`). If `detect()` cached under a different key (resolved path) than `options.binaryPath ?? 'agy'`, the first run re-probes (`--version` and `--help`, up to 8 s) and may land on a different cache key.
- Recommendation: key the cache on the same string both places.

## Blocking issues

None found.

## Serious issues

### S1. Permission widening under `plan` / `auto-edit`
- File: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts` (`runAcp`, `createProviderSessionLaneHandle` options) with `antigravity-acp-profile.ts` (`skipsPermissions`).
- Scenario: see the first failure mode.
- Impact: a lane meant to be restricted can run shell or MCP tools without the guard.
- Fix: pass `autoApprove` computed with the profile's predicate (`yolo`, or unspecified permission with `autoApprove !== false`). Add a spec: `auto-edit` and a `request_permission` shell request must get `reject_once`.

### S2. Negative probe cached from a timeout or empty help
- File: `antigravity-cli.adapter.ts` `probeAcp` and `probeStreamJsonInput`.
- Fix: see the failure mode. Add a spec where `--help` times out first and succeeds second.

### S3. No escape hatch from a broken ACP transport
- File: `antigravity-cli.adapter.ts` `runAcp`.
- Fix: a pre-prompt handshake fallback to stream-json, or the `agentOrchestration` transport setting. The plan's stated failure behaviour is not met by the error text alone.

## Moderate and minor issues

- Moderate: MCP name `ptah` can clash with the persistent file entry (`lane-mcp-attachments.ts`; see Q5).
- Moderate: ACP usage carries no model; `actualModel` lost (see Q3).
- Moderate: no ACP rate-limit or quota test; parity row unproven.
- Moderate: `capabilities()` depends on the last probed binary (`antigravity-cli.adapter.ts:472`).
- Moderate: batch report should state that user MCP servers from `mcp_config.json` still reach agy (shared profile) and that nothing is forwarded by Ptah on the ACP path.
- Minor: no in-flight de-duplication of probes. `streamJsonProbe` seam disables ACP.
- Minor: `onMcpConfigRestored` is not called on the ACP path. The manager revokes the credential on kill and release (`agent-process-manager.service.ts:3216`), so this is acceptable. The token travels only in the `Authorization` header; the gate accepts a bearer (`mcp-http-gate.ts:18,60-94`), and the 'lane-report' capability for antigravity is unchanged. The real Ptah MCP server was not exercised (the report says so, coordinator's Electron check).

## Specific checks requested

- Account binding. The stream-json Antigravity lane never used `onAccountBinding` (it is absent from `antigravity-cli.adapter.ts`; only claude and codex use it, `agent-process-manager.service.ts:1274`). The ACP lane does not await it either, so there is no parity loss. The Grok finding from the P2 PR review does not carry over, since Antigravity has no account-bound reference.
- `onStreamEvent` wiring. The lane handle emits stream events after the segments, skipping `error` events (`provider-session-lane-handle.ts:~127-131`). The only consumer is `agent-process-manager.service.ts:1847` (`appendStreamEvent`), and the renderer (`cli-agent-output.component.ts:174-199`) shows text segments only when there are no text deltas, and keeps `error` segments. So there are no duplicate rows. One residual risk: the stateful projector is shared across turns and is not reset on interrupt (open tool state from a cancelled turn). It is acceptable, but add a spec for a cancelled tool followed by a new turn.
- Process lifetime. Same tree kill and orphan cleanup as the stream-json lane (`acp-process-transport.ts:348,500-504`); Windows `needsConsole` and `NODE_PTY_USE_CONPTY=0` are set in the profile; interrupt keeps the process (live spec). Acceptable. `detached` is POSIX-only on ACP, whereas stream-json passes `detached: true`; the live Windows run showed the tree gone.
- Fixtures. A grep for emails, user names, home or drive paths, bearer tokens and the repo path found nothing. `tier` is `<redacted>`, and `<cwd>` replaces paths. The remaining items are the `localhost:52934` port, session UUIDs and the agent's model catalogue (no personal data).
- Parity rows. Folder trust kept (`runAcp` calls `ensureFolderTrusted`). Model and effort are mapped (see Q3). Plan and accept-edits are mapped, but see S1. Resume is mapped through ACP resume. Usage works (`usage` on the prompt response). The plan-limit reader is the same manifest entry. Rate-limit classification is unproven.

## Data flow

1. `detect()` runs `--version`, then `probeStreamJsonInput` (captures help), then `probeAcp`. OK, but the cache pins a negative (S2).
2. `runSdk` calls `probeAcp`. A different cache key is possible (see the failure modes).
3. `runAcp` validates policy against the ACP manifest, then trusts the folder. OK.
4. The lane handle builds the MCP attachment (a bearer header, never logged), then `session/new`, config, mode. OK. The permission sink gets `autoApprove` unset (S1).
5. Events fan out to segments and stream events. OK.
6. Exit, kill and revoke happen in the manager. OK.

## Requirements fulfilment

| Requirement | Status | Gap |
| --- | --- | --- |
| ACP path in front of an unchanged stream-json lane | COMPLETE | probe caching (S2) |
| Version floor 1.5.1, help lists `acp` | COMPLETE | |
| HTTP MCP with bearer, no `mcp_config.json` write | COMPLETE | real Ptah MCP not proven; name clash unchecked |
| Permission modes parity | PARTIAL | sink approves under plan and auto-edit (S1) |
| Failure names a fallback setting / fallback | MISSING | S3 |
| Usage, model telemetry | PARTIAL | no model |
| Rate-limit classification | PARTIAL | untested on ACP |
| `onStreamEvent` on Antigravity lane | COMPLETE | |

Implicit requirements not addressed: ACP quota error handling, MCP name uniqueness, recording the user-MCP decision.

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| agy below 1.5.1 | YES | floor check | none |
| `--help` lacks `acp` | YES | stream-json | none |
| Probe timeout | NO | caches negative | S2 |
| `ask` permission | YES | refused by manifest | message identical to stream-json |
| Interrupt then continue | YES | same pid, live-verified | projector state |
| Resume id from another transport | PARTIAL | falls back to new session | not spec'd |
| No spawner | YES | stream-json | none |

## Verdict

- Recommendation: REVISE
- Confidence: MEDIUM (nothing was executed; the Windows live evidence is the author's)
- Top risk: S1, an `auto-edit` or `plan` lane silently auto-approving every tool request.
- What a robust implementation would add: the `autoApprove` fix with a spec; probe results cached only on a successful read, with a `warn` log on a floor-passing version that lacks `acp`; a handshake-failure fallback or a transport setting; a lane-unique MCP name or a live check with the persistent `ptah` entry present; a recorded quota error through the ACP path; the model on ACP usage; an explicit note in the batch report that user MCP servers stay in agy's shared `mcp_config.json`.
