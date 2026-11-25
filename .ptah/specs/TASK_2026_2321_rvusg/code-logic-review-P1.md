# Code Logic Review P1 — `TASK_2026_2321_rvusg` (B1, B2a, B2b)

Evidence strength: weaker evidence: same-family review.

Scope: commits 423a40591 and 15e949b4f only. Read the full touched source files around each hunk; no tests were run (specs were read by name only).

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 8/10 |
| Verdict | APPROVED WITH FIXES |
| Blocking issues | 0 |
| Serious issues | 0 |
| Moderate issues | 3 |
| Minor issues | 3 |

## Answers to the seven checks

1. Unknown usage never becomes 0: PASS.
   - `findAgentUsage` returns `undefined` when no `outcomeUsage` exists (`agent-process-manager.service.ts:2723-2730`). `outcomeUsage` is set only when the adapter declares `outcomeUsageIsTurnTotal` and the segment carries usage (`:2054-2059`), so adapters without usage stay unknown.
   - The schema models unknown as `null` (`review-usage.schema.ts:6,15-19`) with explicit `*Partial` flags. No default of 0 anywhere in the diff.
   - The ledger path was only re-keyed. Its `?? null` handling is unchanged (`lane-completion-outcome.ts:~140-160`).
2. Backward compatibility: PASS for reads. `usage` on `StageRecordSchema` and `ReviewRunSchema` is `.nullable().optional()` (`review-run.schema.ts:72,103`), and `defaultModelBlocked` is `.optional()` (`review-lanes.schema.ts:104`). Older payloads parse. Downgrade is a problem, see M3.
3. `spawnFromSdkHandle` not forwarding `usageWorkspaceRoot`: not a gap for the plan, but a silent undercount if the premise ever changes. See M1.
4. Strip completeness: PASS in effect. See M2 for a defense-in-depth hole.
5. `trackSdkHandle` call sites: PASS. There are exactly two (`agent-process-manager.service.ts:1610`, `:1777`). The first passes all 9 arguments, with `undefined` for `externalOwner`, which previously came from `ticket`. The second omits the new optional trailing argument, which is correct because it is untrusted and Ptah CLI. Typecheck is not affected.
6. Race and stop paths: PASS.
   - `signalLaneCompletion` runs `recordLaneUsageOutcome` on every terminal path (`:4343-4353`), including `failSpawn` after reply (`:822-826`), stop of a `starting` lane after reply (`:3385`), and timeout and exit. It reads the same `tracked.outcomeUsage` plus `tracked.usageWorkspaceRoot`.
   - `outcomeUsage` is cleared only at the next continued turn (`:3251`). It is not cleared on stop, fail or timeout.
   - The record stays until `COMPLETED_AGENT_TTL`, so `findAgentUsage` after `stop()` works.
   - A lane that fails before reply, or is stopped while `starting` and before reply, is deleted from the map (`:819`, `:3391`). It has no usage anyway, so `undefined` is correct.
   - Late segments after release are dropped by the `this.agents.get(agentId) !== tracked` guard (`:2049`). This is the known limitation already recorded in plan A11.
7. Single-count: PASS for this layer. The change only swaps `workspaceKey`. The `eventKey` (`agentId:completedAt`) and the one `recordLaneUsageOutcome` call per terminal event are unchanged. See M3b for the reconciler residual.

## Findings

### Moderate

**M1. `spawnFromSdkHandle` drops the ledger key, so Ptah CLI review lanes would silently be keyed to the attempt root.**
- File: `agent-process-manager.service.ts:1777-1786`, and the namespace call `agent-namespace.builder.ts:614`.
- Scenario: a Ptah CLI lane (`ptah-cli:pc-...`) is run for review through the namespace path. Its ledger row is keyed to `info.workingDirectory`, the attempt worktree. That row counts in no open workspace, so repository spend is understated with no signal.
- The plan A3 and `review-lane-gateway.ts:185-186` use `manager.spawn`, not `spawnFromSdkHandle`. For the plan's path this is not a gap. Dropping the key on the namespace path is correct (untrusted caller).
- I found no `ptah-cli` adapter reachable from `manager.spawn`. Whether `manager.spawn({cli:'ptah-cli', ptahCliId})` works at all is outside this diff, and I did not verify it. Ptah CLI lanes appear in the review lane list (`review-lanes.schema.ts:9`), so a user can select one.
- Fix: before B4/B9 acceptance, confirm that a Ptah CLI lane picked for review is either spawned through the keyed path or documented as "usage not attributed". Add an acceptance test or a decision entry. No code change is needed in P1.

**M2. `beginSpawn` in the namespace builder passes `usageWorkspaceRoot` through.**
- File: `agent-namespace.builder.ts:~783-795`. The destructure there removes only `accountSelection` and `externalOwner`.
- Today this is harmless. `AgentProcessManager.beginSpawn` (`:738-770`) never reads the field. The later `executeSpawn(ticket, enrichedRequest)` receives the stripped request, so the field cannot reach `trackSdkHandle` (`:1624` reads `request`, the stripped one).
- It is a latent trap. If someone later makes `beginSpawn` copy the request onto the tracked record (it already copies `externalOwner`), an untrusted caller can re-key ledger rows with no spec failing.
- Fix: add `usageWorkspaceRoot: _rawUsageWorkspaceRoot` to that destructure and a spec asserting that `beginSpawn` drops it.
- Other entry points checked:
  - `resumeRequest` strips it (`agent-lane-resume.service.ts:49`).
  - `system-cli-lane-resumer.ts:33` builds the request field by field, so there is no leak.
  - `protocol-dispatcher.ts:1371/1404` and `agent-tool.dispatcher.ts:512/527` both go through `ptahAPI.agent.*`, which is the stripped builder.
  - I found no other non-spec caller of `manager.spawn` or `executeSpawn` except the review gateway (trusted).

**M3. Two residual risks, not defects in this diff.**
- (a) The contract schemas are `.strict()`. A build older than B1 that reads a stored run containing `usage` rejects the whole record. This is rollback and downgrade only. Acceptable if releases are forward-only; state it in the PR notes.
- (b) Re-keying relies on the gateway passing a path string that byte-matches the key spend queries use. The override is used raw (`lane-completion-outcome.ts:197`). A case, separator or trailing-slash difference silently moves the row out of the workspace total. The plan places folder resolution in B4, so test it there with the exact registered-folder string. I also did not verify that `UsageReconciliationService` (`trigger.enqueue`, sessionId and provider keyed) cannot write a second row for the same turn under the attempt-root key. B9 owns the single-count proof and should include a reconciled-codex case.

### Minor

- m1. `REVIEW_STAGE_USAGE_RUNS_MAX` (`review-usage.schema.ts:4`) is exported but not used by the schema, and the doc comment says "stage usage document". The cap is enforced by a later batch. Ensure B3 uses it, or this is a dead constant.
- m2. The schema accepts inconsistent totals: for example `tokensPartial:false` with every count `null`, or `runs:0` with a non-null cost. The reader must treat all-null as unknown. Consider a `superRefine`, or a documented invariant that B3 and B6 test.
- m3. `findAgentUsage` copies shallowly plus `models`. That is enough as long as `CliOutputSegment['usage']` has no other nested object. The copy semantics are not pinned for any field beyond `models`; fine today.

## Edge cases

| Case | Handled | Note |
| --- | --- | --- |
| Empty-string `usageWorkspaceRoot` | YES | Falsy, so not stored (`:1889`), and `??` is not reached for an empty string on `tracked.usageWorkspaceRoot` |
| Unknown agent id | YES | `undefined` |
| Caller mutates returned `models` | YES | Copied |
| Continued turn on the same lane | YES | Same tracked record, key kept, usage cleared at turn start (`:3251`) |
| Resumed lane (new spawn) | PARTIAL | The key is stripped or absent; the plan says review never resumes |
| Whitespace or relative root | NO | Not validated; the caller is trusted, so fine |

## Verdict

APPROVED WITH FIXES, score 8/10. Confidence: MEDIUM (same family, tests not executed).
- Top risk: Ptah CLI review lanes (M1) and path-string mismatch (M3b) both fail silently as an undercount of repository spend rather than as an error.
- Before P1 is considered closed: M2 is a one-line fix plus a spec. M1 needs a recorded decision or a B4/B9 test. Neither blocks B3 to B8.
