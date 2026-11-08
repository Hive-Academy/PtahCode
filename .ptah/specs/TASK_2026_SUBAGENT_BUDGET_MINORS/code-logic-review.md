# Code Logic Review - TASK_2026_SUBAGENT_BUDGET_MINORS

Verdict: APPROVE (no blocking or serious findings; 5 moderate/minor notes). Static review only; no tests were run.

Files read: subagent-budget-monitor.ts (diff plus surrounding stop path, lines 770-800, 1205-1300, 1430-1445, 1083), its spec, subagent-handoff-index.spec.ts and .ts (loading), subagent-hook-handler.ts and spec.

## Item verification
- N2 (stale stopped state via registry teammateName): FIXED. getAgentBudgetState now matches registry or task teammate names only when stopState is 'none' (monitor.ts:781). Stopped states match only by their recorded stoppedAgentId or stoppedTeammateName. The new spec (spec:470) fails on the old code: the old stopped state matched through record.teammateName, and the same-name spawn clears stoppedTeammateName (monitor.ts:1083) but not the registry name.
- N3 (steer before pending): FIXED. stopInFlight is set before preparation (monitor.ts:1219) and now surfaces as stopState 'pending', stopped true, running false (monitor.ts:786-788). The spec (spec:507) holds the record write open and asserts the state, so it fails before. No new race: stopInFlight is reset on every exit path (finally, withdraw branch, post-dispatch finally).
- N4 (hook transcript from any project dir): FIXED for the fallback. Containment is kept: realpath of the directory must be under the real projects root, basename must equal agent-<id>.jsonl, realpath of the file must live in that same directory, it must be a regular file, and any '..' segment is rejected. A symlinked project dir that points outside the root resolves outside and is rejected. The spec covers the other-project file, a '..' path and the outside path. Candidate order puts the current slug first.
- isBackground: unknown now logs null. The only consumer is the `=== true` branch (hook-handler:485) plus a debug log (hook-handler:564), so null and undefined are handled. Spec covers true and null.
- Redaction: github-token, db-password, npm-auth-token and aws-secret-key (with = and space separators) and encryptionKey, signingKey, authKey and masterKey are covered. Existing sortKey, primaryKey and token-budget guards are untouched. The explicit access-/auth-/refresh-/client-secret/api-token flags are all subsumed by the suffix alternation, so there is no regression vs 5b39d1032. Regex time: the compound prefix is a single `[a-z0-9_-]*` run anchored by `--` after whitespace, and the run cannot contain whitespace, so the cost is linear in the token length.
- Flaky rescan test: sleeps replaced by awaiting index.loading. The load promise is the `.finally` result (index.ts:222), so loading is cleared before the awaiter resumes. Deterministic.

## Findings
1. Moderate - monitor.ts:312-340: the fallback scan is synchronous (readdirSync plus 2 realpathSync per project dir) and runs inside the stop-preparation path (monitor.ts:1441). It reruns on every prepare while the transcript is not found, because state.transcriptPath stays unset. With hundreds of ~/.claude/projects entries this blocks the event loop for a while. Suggest a cheap existsSync on the candidate before realpath, or an async version.
2. Moderate - monitor.ts:321-327: readdirSync failure (EACCES/EMFILE) sits inside the outer try, so the exact-slug candidate, which is already in the list, is never tried and the result is undefined. This is a small regression vs the old single-path lookup. Wrap the readdir in its own try.
3. Minor - monitor.ts:325: when two projects hold the same sessionId and agentId, the winner is readdir order. Practically unreachable (UUID session ids), but it is not deterministic; sorting the names would make it so.
4. Minor - monitor.ts:271: the long-flag list is still a closed set of suffixes. `--access-key`, `--encryption-key`, `--signing-key`, `--auth-key`, `--master-key` and `--db-pass` are not redacted, while their camelCase forms now are. Add key variants to the compound suffix for parity.
5. Minor - monitor.ts:786-788: if preparation returns no handoff (prepared undefined), the state flips pending -> none after having refused a steer as 'stopped'. A transient refusal; acceptable but worth knowing. Separately, hook-handler:483 logs null for a registry record that exists with isBackground undefined (a foreground record), which is conflated with unknown. Log-only.

## Verdict
APPROVE. Each item is fixed with a spec that fails against the previous code. Findings 1 and 2 are worth a follow-up but do not block.

## Round 1 re-review

Verdict: APPROVE. Static read of the full diff and report; no tests run.

- Lookup order and async: the current-project path is validated and returned before the readdir (monitor.ts:340-342), so a root readdir failure can no longer skip it (finding 2 closed). Every fs call is `fs/promises`, so the event loop is no longer blocked (finding 1 closed). Fallback pick is deterministic: newest mtime, then lexicographic path (finding 3 closed).
- Path safety is kept: `..` segment rejection, basename equals agent-<id>.jsonl, realpath of the directory under the real projects root, file realpath in the same directory, regular file only. A supplied path is validated alone, with no fallback. Project dirs are filtered with `isDirectory()`, which does not follow symlinks, and a symlinked dir that does get through resolves outside the root and is rejected.
- Cache (monitor.ts:815-828, 1467-1473): the key is session + agent id, which is correct because the workspace is constant per session. Misses expire after 5 s and a hook-supplied path overwrites the entry via recordTranscriptPath. The map is FIFO-bounded at 256, so there is no unbounded growth. Only the 256-entry bound and session turnover remove positive entries.
- Redaction: access-, encryption-, signing-, auth- and master-key flag suffixes are added to both the compound and simple alternations. Cost stays linear because the prefix run cannot contain whitespace. sortKey, primaryKey and token-budget are unaffected, since none of them end in a listed suffix.
- Pending -> none on preparation failure is documented in the report with a spec (spec:548-564). Reasonable: keeping 'pending' would block steering of an agent that was never stopped.

New or remaining notes (none blocking):
- R1. Minor - monitor.ts:818-820: a positive cache entry never expires. If the transcript is deleted, or a fallback result is cached and the current-project file appears later, the cached path stays until FIFO eviction. The consumer must tolerate an unreadable path, which it already does for unavailable transcripts. A short revalidation or a TTL for fallback hits would remove the case.
- R2. Minor - monitor.ts:1467-1473: the lookup is awaited while stopInFlight is true. That is safe, because the post-prepare liveSession check follows, but a slow filesystem delays the stop. A miss is cached for 5 s, which bounds repeats.
- R3. Minor - the fallback scans projects sequentially (3 awaited fs calls each). It only runs on a current-project miss and is then miss-cached, so it is acceptable.
