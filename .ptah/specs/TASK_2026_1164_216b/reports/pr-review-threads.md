## THREAD PRRT_kwDOPngTds63Z5Ol — libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts:213 (PtahCode)

### 🟠 Major · Budget\-limited history replay waits for the idle timer between batches

**Impact:** Historical transcript usage remains absent from ledger and dashboard for a prolonged period, and may never be imported in shorter application sessions\.

The discovery scan returns when it reaches its file or byte budget, but its caller treats that return like a completed scan and schedules the next pass after 15 minutes or an hour\.

**Evidence**

- [libs/backend/usage\-analytics/src/lib/usage\-reconciliation\.service\.ts:48](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts#L48) — const PASS\_FILE\_BUDGET = 16;

- [libs/backend/usage\-analytics/src/lib/usage\-reconciliation\.service\.ts:213](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts#L213) — if \(visited &gt;= PASS\_FILE\_BUDGET \|\| spentBytes &gt;= PASS\_BYTE\_BUDGET \|\| enumerated &gt;= PASS\_DISCOVERY\_BUDGET\) \{

- [libs/backend/usage\-analytics/src/lib/usage\-reconciliation\.service\.ts:215](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts#L215) — return changed;

- [libs/backend/usage\-analytics/src/lib/usage\-reconciliation\.service\.ts:159](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts#L159) — const delay = changed ? ACTIVE\_IDLE\_MS : this\.idleDelayMs;

- [apps/ptah\-electron/src/di/container\.ts:57](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/apps/ptah-electron/src/di/container.ts#L57) — usageReconciliationService\.start\(\);





## THREAD PRRT_kwDOPngTds63Z5Om — libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts:220 (PtahCode)

### 🟠 Major · Codex discovery follows rollout symlinks outside the selected profile

**Impact:** Reconciliation can read and persist usage from a Codex transcript outside the selected sessions tree\.

Discovery resolves each candidate before passing it to the no\-follow reader, so the reader checks the resolved target rather than the discovered symlink\.

**Evidence**

- [libs/backend/cli\-agent\-runtime/src/lib/cli\-agents/cli\-adapters/codex/codex\-rollout\-usage\.reader\.ts:93](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts#L93) — for \(const name of \(await listDir\(day\)\)\.sort\(\)\.reverse\(\)\) \{

- [libs/backend/cli\-agent\-runtime/src/lib/cli\-agents/cli\-adapters/codex/codex\-rollout\-usage\.reader\.ts:96](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts#L96) — if \(ROLLOUT\_RE\.test\(name\)\) yield file;

- [libs/backend/usage\-analytics/src/lib/usage\-reconciliation\.service\.ts:220](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts#L220) — canonical = await this\.sources\.realpath\(file\);

- [libs/backend/usage\-analytics/src/lib/usage\-reconciliation\.service\.ts:232](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts#L232) — const result = await this\.scanFile\(this\.collectors\[index\], canonical, PASS\_BYTE\_BUDGET \- spentBytes\);

- [libs/backend/cli\-agent\-runtime/src/lib/cli\-agents/cli\-adapters/codex/codex\-rollout\-usage\.reader\.ts:164](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts#L164) — events\.push\(\{

- [libs/backend/usage\-analytics/src/lib/usage\-reconciliation\.service\.ts:261](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts#L261) — await this\.cursors\.commit\(chunk\.next, chunk\.events\);





## THREAD PRRT_kwDOPngTds63Z5Oo — libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:133 (PtahCode)

### 🟠 Major · Migration silently discards producer\-colliding usage rows

**Impact:** Upgraded databases lose historical usage events and their repository and usage totals can be understated\.

The S0005 migration removes producer from the primary key and uses INSERT OR IGNORE, silently dropping an existing row when two producers share a session, event key and model\.

**Evidence**

- [libs/backend/persistence\-sqlite/src/lib/session\-store/session\-store\-migrations\.ts:65](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts#L65) — PRIMARY KEY \(session\_id, producer, event\_key, model\_id\)

- [libs/backend/persistence\-sqlite/src/lib/session\-store/session\-store\-migrations\.ts:131](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts#L131) — PRIMARY KEY \(session\_id,event\_key,model\_id\)

- [libs/backend/persistence\-sqlite/src/lib/session\-store/session\-store\-migrations\.ts:133](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts#L133) — INSERT OR IGNORE INTO session\_usage\_turns\_new

- [libs/backend/persistence\-sqlite/src/lib/session\-store/session\-store\-migrations\.ts:143](https://github.com/Hive-Academy/PtahCode/blob/337ea4cb883ee8f4613f5b7d7d00dd700959afaf/libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts#L143) — DROP TABLE session\_usage\_turns;





## THREAD PRRT_kwDOPngTds63azHL — libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts:203 (PtahCode)

### 🟠 Major · Backward totals lookup bypasses the reconciliation read budget

**Impact:** Replay can perform quadratic I/O and delay processing other usage sources when large rollouts contain long stretches without token counts\.

Each resumed Codex chunk scans backwards to the start of the file until it finds a token count, without a byte or time limit\.

**Evidence**

- [libs/backend/cli\-agent\-runtime/src/lib/cli\-agents/cli\-adapters/codex/codex\-rollout\-usage\.reader\.ts:125](https://github.com/Hive-Academy/PtahCode/blob/4ad730b7710e8715edac7adbcbeff76f5baac4a1/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts#L125) — const previous = offset &gt; 0 ? await this\.previousTotals\(file, offset\) : null;

- [libs/backend/cli\-agent\-runtime/src/lib/cli\-agents/cli\-adapters/codex/codex\-rollout\-usage\.reader\.ts:203](https://github.com/Hive-Academy/PtahCode/blob/4ad730b7710e8715edac7adbcbeff76f5baac4a1/libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts#L203) — while \(end &gt; 0\) \{

- [libs/backend/usage\-analytics/src/lib/usage\-reconciliation\.service\.ts:263](https://github.com/Hive-Academy/PtahCode/blob/4ad730b7710e8715edac7adbcbeff76f5baac4a1/libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts#L263) — bytes \+= Math\.max\(0, chunk\.next\.byteOffset \- \(cursor?\.byteOffset ?? 0\)\);





## THREAD PRRT_kwDOPngTds63a4ZP — apps/ptah-electron/src/di/container.ts:53 (coderabbitai)



** Major** · **Stability & Availability** · **Quick win**

**Guard backfill wiring on the SQLite connection.**

When phase 2 skips task-end composition, no `GIT_READ_RUNNER` is registered. `setup` still resolves `RepositoryIdentityBackfillService` unconditionally. That service needs the resolver token, and its factory resolves `GIT_READ_RUNNER` outside its error handler. The lookup throws, so `setup` fails on a path that phase 2 treats as non-fatal. This can stop the degraded startup that the code otherwise tolerates.

Resolve and wire the backfill only when `SQLITE_CONNECTION` is registered. That is the same condition that registers the runner. Add the `PERSISTENCE_TOKENS` import if `container.ts` does not already have it.

















## THREAD PRRT_kwDOPngTds63a4ZW — apps/ptah-electron/src/di/phase-2-libraries.ts:85 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Use the same path order for traversal and cursor filtering.**

If sibling directories are `-repo-extra` and `-repo`, name sorting visits `-repo-extra` first. However, paths under `-repo/` compare greater than paths under `-repo-extra/`.

If the 16-file pass ends inside `-repo-extra`, the next pass rejects every `-repo` transcript through the `startAfter` filter. Repeated discovery cycles can omit those transcripts indefinitely.

Sort sibling traversal prefixes with the directory separator included. Use the same comparison as the cursor filter.















## THREAD PRRT_kwDOPngTds63a4ZZ — libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:875 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Mark interrupted-run checkpoints as estimated and non-billable.**

`writeCheckpoint` sends provisional model counters without `source` or `billable`. The sink then stores those rows as live and billable, and the `billable = 1` totals in `session_stats` count them. If the run is interrupted, no accepted turn replaces the checkpoint, so the estimate remains in authoritative usage. Set both fields on this payload. The accepted turn uses the same event key and replaces the checkpoint when it arrives.























## THREAD PRRT_kwDOPngTds63a4Zh — libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.ts:12 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Resolve the ambient Claude config directory before falling back to `~/.claude`.**

`listRoots()` always returns `~/.claude/projects`. It adds only stored named profiles. When an ambient launch sets `CLAUDE_CONFIG_DIR`, the transcripts for that launch are under a different `projects` root. That root is not scanned, so its usage turns are not recorded.

Use the same resolution as the ambient child: the first non-blank `CLAUDE_CONFIG_DIR`, otherwise `/.claude`. `resolveClaudeConfigDir` in `synced-claude-skills.reader.ts` already implements this rule. Keep the named-profile roots unchanged.















## THREAD PRRT_kwDOPngTds63a4Zl — libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts:164 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Heavy lift**

**Carry workspace provenance into historical replay events.**

For a standalone Codex transcript without a matching `sessions` row, these events contain neither `workspaceKey` nor `worktreePath`. Persistence stores NULL for both fields. Workspace summaries then exclude the usage, and repository backfill has no path to resolve.

The Claude collector has the same omission. `scanFile` commits collector output without adding attribution. Read the transcript workspace metadata and carry its normalized workspace identity and worktree path through replay.















## THREAD PRRT_kwDOPngTds63a4Zo — libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts:169 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Subtract cached input before storing uncached input.**

Codex 0.165.0 defines non-cached input as `input_tokens - cached_input_tokens`. Cached input is already included in `input_tokens`. ([raw.githubusercontent.com](https://raw.githubusercontent.com/openai/codex/rust-v0.165.0/codex-rs/protocol/src/protocol.rs))

This collector stores the full input delta and the cache delta separately. The summary treats the first value as uncached input and adds both fields. With input=100, cached=80 and output=10, it reports 190 tokens instead of 110. Store the uncached input delta in `inputTokens`.

Based on learnings, provider input counters must be checked for included cached tokens before normalization.














_Source: Learnings_



## THREAD PRRT_kwDOPngTds63a4Zr — libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts:203 (coderabbitai)



** Major** · **Performance & Scalability** · **Heavy lift**

**Bound cumulative-baseline recovery by the pass budget.**

`previousTotals` can scan from the cursor to the file start without a byte or time limit. `collect` calls it before the bounded forward loop, including when the cursor is already at EOF.

If the last token record precedes 100 MiB of other transcript records, each idle collection can reread that entire region. `scanFile` accounts only cursor advancement, so these reads bypass the reported 4 MiB pass limit.

Persist the cumulative baseline with the cursor, or make baseline recovery bounded and resumable. Also avoid recovery when no forward bytes need processing.















## THREAD PRRT_kwDOPngTds63a4Zt — libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts:537 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Do not expose message usage as terminal turn totals.**

If a valid `assistant.usage` event precedes an incomplete usage event, `incompleteUsage` prevents the final aggregate from carrying `usage`. However, the manager has already accepted the valid message segment as a turn total. The final segment does not clear that value, so completion records the message subset as the whole turn.

A failed process also leaves the last message's usage in place. Separate intermediate usage from completion usage. Only expose a complete turn aggregate through the turn-total capture path.















## THREAD PRRT_kwDOPngTds63a4Zw — libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts:811 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Keep per-step usage out of the turn-total capture path.**

`handleStepFinish` now emits usage for intermediate steps. With `usageScope: 'turn'`, each step replaces `tracked.outcomeUsage`.

If two steps report usage and the process then fails, the final aggregate is not emitted. Completion records only the last step as the turn total. A successful turn with incomplete step counters has the same problem because its final segment omits `usage`.

Separate per-step display segments from terminal usage capture. Do not rely on a later aggregate to correct every intermediate value.















## THREAD PRRT_kwDOPngTds63a4Z0 — libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.ts:651 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Do not label a validated message subset as a complete turn total.**

If one assistant completion has valid usage and another lacks an input counter, `readCompletionUsage` drops the incomplete completion. At `agent_settled`, the adapter sums only the valid completion. These flags cause the manager to persist that subset as the turn total.

Track incomplete assistant usage separately. Preserve the missing-counter state, or omit the terminal total when the adapter cannot establish a complete sum. Continue to exclude non-assistant messages.















## THREAD PRRT_kwDOPngTds63a4Z2 — libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:169 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Preserve the reported model breakdown when recording aggregate usage.**

OpenCode terminal aggregates provide `usage.models` without a top-level `usage.model`. Copilot does the same for multi-model turns. This code stores one `modelId: null` row and discards every reported per-model counter.

Build contribution rows from `usage.models` when present. Retain the single-model fallback for producers that report only `usage.model`. Keep the authoritative total cost separate from the model breakdown.















## THREAD PRRT_kwDOPngTds63a4Z6 — libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:186 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Heavy lift**

**Use each turn's own start time for lane coverage.**

`continueConversation` keeps `info.startedAt` from the first spawn. Every later turn therefore records a coverage interval that begins at spawn (`lane-completion-outcome.ts:186`). When a later turn reports usage counters on the same native thread, the thread correction sets every replay row on that thread inside the interval to `billable = 0` (`session-stats-repository.ts:399-408`). It does this even when no earlier live row counted those events.

If the first turn reports no counters, its live row is non-billable and cannot suppress its own replay rows. The later turn can then remove the usage of that first turn from `session_stats`. The turn-1 usage is then missing from the ledger without any warning.

Record coverage from the start of the turn being recorded, not the lane spawn time. A later turn then suppresses only replay rows from its own window. Replay rows from earlier turns remain billable unless an earlier live row with counters covers them.















## THREAD PRRT_kwDOPngTds63a4Z9 — libs/backend/cli-engine/src/lib/container.ts:326 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Use the same ordering for discovery and continuation.**

The traversal sorts entry names, but this guard compares full paths. These orders differ when a file and directory share a basename.

For example, 16 sibling files from `p.jsonl` through `a.jsonl` are yielded before `a/child.jsonl`. When the pass reaches its file limit, it saves `a.jsonl`. On continuation, `a/child.jsonl` compares greater than that cursor and is skipped. Each fresh traversal can repeat the same limit boundary, so the child never reaches replay.

Make traversal order and `startAfter` filtering consistent. Include this prefix-related file/directory case in continuation coverage.















## THREAD PRRT_kwDOPngTds63a4aD — libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:215 (coderabbitai)



** Major** · **Functional Correctness** · **Quick win**

**Use the effective workspace identity for repository discovery.**

Replay collectors omit `workspaceKey`. If a matching `sessions` row supplies the workspace, workspace usage queries include the replay row through `COALESCE(s.workspace_key, t.workspace_key)`.

This query excludes the same row because it checks only `t.workspace_key`. Even after backfill assigns `repository_id`, the repository section can remain empty. Join `sessions` and use the same effective workspace identity as the other workspace queries.















## THREAD PRRT_kwDOPngTds63a4aE — libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts:400 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Quick win**

**Apply live coverage bounds to the replay timestamp.**

Both collectors emit NULL replay coverage bounds. For those rows, `coverage_start_ms IS NULL` and `coverage_end_ms IS NULL` make both predicates true, regardless of `occurred_at_ms`.

A live event covering [100,200] therefore suppresses matching replay usage at 50 or 300. For Codex, this UPDATE also reverses the earlier thread recalculation. Remove the replay-bound NULL shortcuts from both the affected-session query and the UPDATE. Only an absent live bound should disable its timestamp comparison.















## THREAD PRRT_kwDOPngTds63a4aI — libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:133 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Heavy lift**

**Choose one producer for the whole migrated event.**

The new writer requires one producer owner per `(session_id,event_key)`, but this copy resolves conflicts per model.

For example, legacy `sdk-owner` model A and `cli-lane` model B rows with the same event key both survive. The writer then selects one owner with `LIMIT 1`, reads revisions across both producers, and deletes stale models only for the incoming producer. Later revisions can fail or retain another producer's usage.

Select the event owner before copying its model rows.















## THREAD PRRT_kwDOPngTds63a4aL — libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:144 (coderabbitai)



** Major** · **Data Integrity & Integration** · **Heavy lift**

**Rebuild session aggregates after discarding legacy rows.**

If two legacy producers have the same session/event/model key, `INSERT OR IGNORE` keeps one row. This migration leaves `session_stats` unchanged, so its tokens and cost can still include both rows.

Completed historical sessions may never receive another event to repair the aggregate. Rebuild affected `session_stats` totals from the retained ledger rows in this migration.















## THREAD PRRT_kwDOPngTds63a4aO — libs/backend/usage-analytics/src/lib/usage-summary.service.ts:139 (coderabbitai)



** Major** · **Stability & Availability** · **Quick win**

**Bound repository paths before attaching optional totals.**

If a repository has 1,001 distinct billable worktree paths in the selected range, `getRepositoryUsageTotals` returns all 1,001 paths. `UsageRepositoryTotalsSchema` permits only 1,000. The final `UsageSummarySchema.parse` then throws outside this catch, so `summarize` fails instead of returning the existing usage summary.

Cap the displayed paths without changing the aggregate totals. Validate optional repository data inside this failure boundary.















