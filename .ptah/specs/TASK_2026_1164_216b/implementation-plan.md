# Implementation plan — TASK_2026_1164_216b

## Verified findings

- `libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts:29-44,116-163` enforces live delta capture and excludes transcript backfill. The actual sink port is `libs/backend/platform-core/src/interfaces/session-usage-sink.interface.ts:1-46`; research omitted this necessary edit.
- `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts:643-750,1215-1228` writes accepted cumulative SDK result deltas. An abort before result loses measured per-message usage. Task-tool child spend can be in the parent cumulative result (`:1173-1184`), so child attribution must never sum twice.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1494-1503,3647-3666` gates outcome usage on `outcomeUsageIsTurnTotal`; only Codex declares it (`cli-adapters/codex/codex-app-server-lane.adapter.ts:845`). `lane-completion-outcome.ts:121-134` turns unknown into zero and discards all-zero events. `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts:122-124` allows NULL.
- Adapter evidence corrects the research's broad claim that non-Codex streams do not supply usage: Antigravity result (`antigravity-cli.adapter.ts:830-849`), OpenCode steps (`opencode-cli.adapter.ts:961-983`), Copilot assistant.usage (`copilot-sdk.adapter.ts:485-510,751-781`), Cursor usage event (`cursor-cli.adapter.ts:111,495-496`), Pi message/end records (`pi-cli.adapter.ts:529-547`), ACP prompt/usage_update (`acp/acp-session-handle.ts:386-389,798-825`), and ptah-cli SDK result (`ptah-cli/helpers/ptah-cli-stream-loop.service.ts:639-673,820-882`) carry counters. Individual runs can still report none; record NULL with reason. Claude SDK lane runner must feed the same manager boundary.
- `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts:44-97,120-123` has NOT NULL token columns and a `(session_id,producer,event_key,model_id)` primary key. Versions stop at 4. `sqlite-session-usage-sink.ts:71-85` has a bounded queue. Analytics filters one workspace (`session-stats-repository.ts:421-435`); lane workspace is working directory (`lane-completion-outcome.ts:170`). Repository grouping fixes visibility, not missing writes.
- `libs/backend/auth-providers/src/lib/accounts/provider-account.store.ts:188-190,328-346` lists active named Claude profiles and saves their canonical route; `provider-account.service.ts:157-165` supplies that directory. `libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts:141-189` already derives git common-dir identity using bounded argv and realpath.
- The 448 Codex NULL outcomes have no verified single cause. Add reason counters at segment acceptance and terminal release for absent usage, invalid usage, abort/failure, and sink refusal. Do not retroactively claim any distribution.
- `session-stats-owner.service.ts:1301-1305` uses the SDK session ID and a **turn** key `${runToken}#${turn}`. `lane-completion-outcome.ts:142-149` uses `info.cliSessionId ?? runId` and `${runId}:${completedAt}`. Claude transcript paths are `<config>/projects/<encoded-workspace>/<sessionId>.jsonl` (`rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:1997-2045`); the filename UUID maps to the SDK session ID only after validation against the JSONL sessionId field. Codex rollout filename ends in thread UUID (`codex-rollout-usage.reader.ts:4-6`), matching native `cliSessionId` when present. No timestamp/key coincidence proves ownership.
- `cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts:57-70,153-182` already reads rollout tails, but returns only the last request input count. Extend this reader with a bounded streaming token_count iterator for reconciliation, reusing its path/record parser; do not add an agent-sdk Codex parser. `codex-app-server-lane-auth.ts:22-25` selects `CODEX_HOME` or a supplied home.
- `auth-providers/src/lib/accounts/claude-account-command.ts:4` and `claude-account-status.ts:1` import agent-sdk, so agent-sdk cannot import auth-providers. The profile listing boundary belongs in `auth-providers-tokens` and its implementation uses `provider-account.store.ts:188-190`, not the service admission path at `:157-165`.
- `session-stats-repository.ts:23,139-162,190-236` accepts `live|estimated`, deletes by producer/key, sums every row and stamps coverage with `Date.now()`. All must change for replay billing. `persistence-sqlite` is `type:util` and cannot register an agent-sdk service (`eslint.config.mjs:390-391`).

## Contracts

Add the `platform-core` port, its public index and `Symbol.for` tokens in B0, before consumers; B1 updates the agent-sdk Zod schema. Incoming telemetry declares scope; persisted contributions are deltas. Exact contracts:

```ts
export type UsageScope = 'message' | 'turn' | 'cumulative';
export type UsageMissingReason = 'no-usage-event' | 'partial-usage' | 'invalid-usage' |
  'aborted-before-result' | 'failed-before-result' | 'sink-unavailable' |
  'unmatched-provider-event' | 'source-unavailable';
export interface SessionUsageModelDelta {
  modelId: string | null; inputTokens: number | null; outputTokens: number | null;
  cacheReadTokens: number | null; cacheCreationTokens: number | null;
  knownCostMicroUsd: number | null;
  costAuthority: 'provider-reported' | 'model-priced' | 'unpriced';
}
export interface SessionUsageContribution {
  sessionId: string; producer: 'sdk-owner' | 'codex-checkpoint' | 'cli-lane' | 'transcript-replay';
  runId: string; nativeThreadId: string | null; turnId: string | null; eventKey: string;
  parentSessionId: string | null; subagentId: string | null; providerId: string | null;
  occurredAtMs: number; revision: number; models: SessionUsageModelDelta[];
  totalCostMicroUsd: number | null;
  totalCostAuthority: 'provider-reported' | 'model-priced' | 'unpriced';
  pricingVersion: string | null; runCostSnapshot?: boolean;
  workspaceKey?: string | null; repositoryId?: string | null;
  worktreePath?: string | null; host?: string | null;
  source: 'live' | 'replay' | 'estimated'; missingReason: UsageMissingReason | null;
  billable: boolean; coverageStartMs: number | null; coverageEndMs: number | null;
}
export interface SessionUsageSink {
  recordUsage(event: SessionUsageContribution): Promise<void> | void;
  requestFinalization?(sessionId: string): Promise<void> | void;
  resumeSession?(sessionId: string): Promise<void> | void;
  setLiveSessionIdsProvider?(provider: () => readonly string[]): void;
  flush?(): Promise<void>;
}
// Same platform-core port file; injected optionally into live producers.
export interface UsageReconciliationTrigger {
  enqueue(event: { kind: 'turn-settled' | 'session-closed' | 'lane-completed';
    sessionId: string; providerId: string; occurredAtMs: number }): void;
}
export interface RepositoryIdentityResolver {
  resolve(worktreePath: string): Promise<{ repositoryId: string; worktreePath: string } | null>;
}
export interface CliUsageObservation {
  scope: UsageScope; eventId: string; modelId: string | null;
  counters: SessionUsageModelDelta; occurredAtMs: number;
}
export interface CliAdapterUsageContract { readonly usageScope: UsageScope; }
export interface UsageSourceCursor {
  sourceId: string; sourcePath: string; fingerprint: string;
  mtimeMs: number; byteOffset: number; lastEventKey: string | null;
}
export interface UsageCursorRepository {
  load(sourceId: string, sourcePath: string): Promise<UsageSourceCursor | null>;
  commit(cursor: UsageSourceCursor, events: readonly SessionUsageContribution[]): Promise<void>;
}
export interface UsageCollector {
  readonly sourceId: 'claude-jsonl' | 'codex-rollout';
  collect(path: string, cursor: UsageSourceCursor | null, budgetBytes: number): Promise<{
    events: readonly SessionUsageContribution[]; next: UsageSourceCursor; more: boolean;
  }>;
}
// In auth-providers-tokens/src/lib/usage-profile-roots.port.ts:
export interface ClaudeUsageProfileRoots {
  listActiveRoots(): Promise<readonly { profileId: string; canonicalConfigDir: string }[]>;
}
```

Place `CliUsageObservation`/`CliAdapterUsageContract` in `cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts`; place `UsageSourceCursor`/`UsageCursorRepository` in `persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts` and export their public contract through `persistence-sqlite/src/index.ts`; place `UsageCollector` in `agent-sdk/src/lib/session-stats/usage-collector.interface.ts` and export through `agent-sdk/src/index.ts`. The scheduler lives in `usage-analytics` because `cli-agent-runtime` imports `agent-sdk`; putting it in agent-sdk and importing the Codex reader would form a cycle. `ClaudeUsageProfileRoots` lives in `auth-providers-tokens` and is implemented by `auth-providers` against `ProviderAccountStore.list()`; it returns only active canonical roots, never account secrets. No agent-sdk → auth-providers import.

Every adapter handle declares a scope. Message samples have distinct IDs; a turn total replaces earlier partials; cumulative samples delta against the prior accepted per-model counter snapshot. A regression is invalid unless a new run epoch is proven. Unknown fields remain NULL individually; a measured all-zero event is stored. Lane outcome columns use the normalized event and missing reason, with no separate billable row.

Event keys remain producer-native: Claude live `${runToken}#${turn}`; Claude replay `claude:<sessionId>:<message.id>:<requestId>`; Codex lane `${runId}:${completedAt}`; Codex checkpoint uses its accepted checkpoint key; Codex replay `codex:<threadId>:<turnId>:<tokenCountSequence>` after cumulative delta. They do **not** collide, so billable ownership is determined by the predicate below, never by key equality alone. IDs only, never prompt text. The agent-sdk registry covers only Claude roots: `~/.claude/projects` and `<canonicalConfigDir>/projects` for every active named Claude profile. B7b exports selected Codex roots (`~/.codex/sessions` or non-default `CODEX_HOME/sessions`) next to the existing reader in cli-agent-runtime. B8's usage-analytics scheduler merges both lists and deduplicates by realpath; do not scan arbitrary environment homes that Ptah has not selected.

Append static SQL strings to `session-store-migrations.ts` and its version list. S0005 rebuilds the ledger for nullable counters and source-independent identity; S0006 adds cursors. Run through the existing transaction migration mechanism, with bound parameters for data writes.

```sql
-- S0005_usage_event_identity
CREATE TABLE session_usage_turns_new (
  session_id TEXT NOT NULL, producer TEXT NOT NULL, run_id TEXT NOT NULL,
  native_thread_id TEXT,
  turn_id TEXT NOT NULL, model_id TEXT NOT NULL, event_key TEXT NOT NULL,
  occurred_at_ms INTEGER NOT NULL, provider_id TEXT NOT NULL,
  input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
  cache_write_tokens INTEGER, known_cost_micro_usd INTEGER,
  cost_authority TEXT NOT NULL, source TEXT NOT NULL, pricing_version TEXT,
  revision INTEGER NOT NULL, workspace_key TEXT, host TEXT,
  repository_id TEXT, worktree_path TEXT, missing_reason TEXT,
  billable INTEGER NOT NULL DEFAULT 1 CHECK (billable IN (0,1)),
  coverage_start_ms INTEGER, coverage_end_ms INTEGER,
  PRIMARY KEY (session_id,event_key,model_id)
);
INSERT INTO session_usage_turns_new
 (session_id,producer,run_id,turn_id,model_id,event_key,occurred_at_ms,provider_id,
  input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,known_cost_micro_usd,
  cost_authority,source,pricing_version,revision,workspace_key,host)
SELECT session_id,producer,run_id,turn_id,model_id,
  event_key,occurred_at_ms,provider_id,
  input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,known_cost_micro_usd,
  cost_authority,source,pricing_version,revision,workspace_key,host
FROM session_usage_turns;
DROP TABLE session_usage_turns;
ALTER TABLE session_usage_turns_new RENAME TO session_usage_turns;
CREATE INDEX idx_session_usage_turns_time ON session_usage_turns (occurred_at_ms,provider_id,model_id);
CREATE INDEX idx_session_usage_turns_session_time ON session_usage_turns (session_id,occurred_at_ms);
CREATE INDEX idx_session_usage_workspace_time ON session_usage_turns (workspace_key,occurred_at_ms);
CREATE INDEX idx_session_usage_repository_time ON session_usage_turns (repository_id,occurred_at_ms);
CREATE INDEX idx_session_usage_billable_session ON session_usage_turns (session_id,billable,occurred_at_ms);
CREATE INDEX idx_session_usage_native_thread ON session_usage_turns (native_thread_id,occurred_at_ms);
ALTER TABLE session_stats ADD COLUMN repository_id TEXT;
ALTER TABLE session_stats ADD COLUMN worktree_path TEXT;
ALTER TABLE session_stats ADD COLUMN missing_reason TEXT;
CREATE INDEX idx_session_stats_repository_time ON session_stats (repository_id,last_usage_at_ms);
```

```sql
-- S0006_usage_source_cursor
CREATE TABLE usage_source_cursor (
  source_id TEXT NOT NULL, source_path TEXT NOT NULL,
  fingerprint TEXT NOT NULL, mtime_ms INTEGER NOT NULL,
  byte_offset INTEGER NOT NULL CHECK (byte_offset >= 0),
  last_event_key TEXT, updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (source_id,source_path)
);
CREATE INDEX idx_usage_source_cursor_updated ON usage_source_cursor (updated_at_ms);
```

Keep existing `session_stats` NOT NULL numeric columns as sums of known tokens; add a completeness/missing-reason read so unknown is never displayed as measured zero.
Map `turnId: null` to the repository's existing empty-string sentinel and `modelId: null` to `__unattributed__` before SQL; never coerce NULL token counts. Extend repository Zod `source` to `live|replay|estimated`, preserve old `estimated` rows, and make the sink stamp only live events. Replace producer-scoped delete/insert (`session-stats-repository.ts:139-162`) with `INSERT ... ON CONFLICT(session_id,event_key,model_id) DO UPDATE` for the incoming key; do not delete another producer's row. Legacy live keys remain **unprefixed** during S0005, so a retry during upgrade matches the old row. New replay keys are namespaced. Migration runs before any producer registration. Set native_thread_id for Codex checkpoint roots and lane threads; migration leaves historical unknown thread IDs NULL pending verified mapping. A key collision between different producers is a validation error unless an explicit ownership merge is being performed.

Repository aggregate and analytics summary must use the following billable filter (same condition for all token and cost sums):

```sql
SELECT session_id,
  COALESCE(SUM(input_tokens),0) AS input_tokens,
  COALESCE(SUM(output_tokens),0) AS output_tokens,
  COALESCE(SUM(cache_read_tokens),0) AS cache_read_tokens,
  COALESCE(SUM(cache_write_tokens),0) AS cache_write_tokens,
  SUM(known_cost_micro_usd) AS known_cost_micro_usd,
  MAX(input_tokens IS NULL OR output_tokens IS NULL OR
      cache_read_tokens IS NULL OR cache_write_tokens IS NULL) AS has_unknown_tokens,
  MIN(occurred_at_ms) AS first_usage_at_ms, MAX(occurred_at_ms) AS last_usage_at_ms
FROM session_usage_turns WHERE billable = 1 GROUP BY session_id;
```

The existing `session_stats` recomputation at `:190-221` must use this filtered subquery and update repository/worktree fields. `session_usage_coverage` must use `MIN/MAX(occurred_at_ms)` of billable rows, not `Date.now()` (`:231-236`); analytics at `usage-summary.service.ts:117-120` must treat historical replay as coverage. Coverage for NULL-only rows is explicitly incomplete.

## Dedupe and idempotency

**Billable predicate, enforced transactionally on every live or replay insert:** a row is billable iff it has measured counters and is the highest-priority owner of its provider-session interval. Priority is accepted Claude `sdk-owner` over Claude replay; Codex `codex-checkpoint` over `cli-lane` over Codex replay; within one producer, the later accepted revision supersedes an overlapping provisional row. Rows with all counters NULL create **no ownership interval**; replay fills them. An interval is `[coverage_start_ms,coverage_end_ms]` for a measured live accepted turn/checkpoint/lane completion; replay event time must be strictly outside all such intervals to be billable. If a measured live row lacks reliable boundaries, mark its entire provider session/thread as live-owned (sentinel interval `NULL,NULL`). A provider session/thread with no measured live ownership has billable deduplicated historical replay, including pre-ledger history. For Claude, ownership is the JSONL `sessionId` field; the SDK turn row owns its entire measured turn including Task-subagent spend. For Codex, ownership is **native thread ID, never `session_id`**: checkpoint `run_id` (also copied to `native_thread_id`) is the root thread and includes its verified descendant threads for that revision; lane `native_thread_id` is the observed native thread, even if `cliSessionId` is missing; a lane with no observed native thread owns nothing. B2 must persist that ID separately from the Ptah session fallback. The aggregate query includes only `billable=1`. In `session-stats-repository.ts`, replay demotion and the `session_stats` recompute run in the **same transaction as the live upsert**.

For newly captured turns, record start at first accepted request and end at result/settlement. Claude ownership keys on the JSONL `sessionId` field; filename UUID is only a validation hint. Attribute recognized sidechain and nested or flat subagent files to their parent session so the parent's live intervals cover them. Their `agent-*.jsonl` filenames are expected to differ from the parent UUID; validate their parent relation by the reader's membership rules and JSONL field. If an ordinary session filename UUID and its JSONL `sessionId` disagree, or a subagent's claimed parent fails membership validation, write replay rows with `billable=0`, `missing_reason='unmatched-provider-event'`; never create a separately billable session. The existing `session-stats-reader.service.ts:409-469` and `session-usage-ledger.ts:52,82-86` recognize nested/flat subagents, first-record sessionId and isSidechain; B7a checks exact field behavior with a source fixture, without opening user transcripts. Codex rollout filename UUID identifies a native thread, not Ptah `session_id`. **Assumption:** descendant thread IDs can be determined from rollout `session_meta` parent metadata or a verified equivalent; the existing rollout reader has no child relation parser. B7b must inspect schema/source fixtures and prove this relation before claiming descendant ownership; absent proof, do not infer a child from paths/timestamps and leave its replay billable. Within a session, replay's `message.id+requestId` dedupes Claude requests; Codex reader deltas monotonic `token_count` with a reset epoch. A final cumulative SDK result replaces provisional checkpoints for its turn; provisional and final rows share an ownership group and only one group is billable. No timestamp or equal-token heuristic merges identities.

Legacy live keys stay unprefixed, preserving in-flight retries. Existing legacy rows with no reliable interval own the full session; replay of a different session remains billable. Cost precedence within one ownership group is provider-reported > model-priced > unpriced, with NULL never overwriting a known value. Cursor offset advances in the same transaction as replay upserts, billable reevaluation and aggregate update, through `UsageCursorRepository` directly; the live sink's 256-item queue is reserved for live writes. Repeating a chunk leaves row count and totals unchanged.

## Performance

Use yielding async chunks via optional bounded range-read/stat capability in platform-core, implemented by Electron and CLI adapters and mock. This I/O-bound job does not justify a `worker_threads` database/DI lifecycle. Cap a read at 256 KiB; spend at most 20 ms or 1 MiB parsed per tick; yield with `setImmediate`. Carry at most 1 MiB of partial JSONL in memory; mark oversize/malformed lines with a reason and advance to a newline. One active scan per host. Startup registers triggers and queues only a bounded first directory page, never recursive full-tree stat or recursive `readDirectory` of a multi-GB archive. Codex's date-partitioned tree is enumerated newest-first, with discovery cursor persisted. Events (turn settled, session closed, lane completed) debounce 2 seconds per source. Idle timer runs every 15 minutes; unchanged trees and transient errors back off to 60 minutes, reset by events. Rotation/truncation/fingerprint change rewinds the file and relies on idempotent keys. Failed writes leave cursors unchanged. Release timer/listeners on shutdown; never keep per-file timers.

## Batches

**Rule R (applies to every batch below):** Electron first; keep `platform-cli` and `cli-engine` working. New code must compile under `strict`; no `any`, `@ts-ignore`, or `as unknown as X`; Zod at boundaries; injected Logger, no `console.*`; no silent swallow; public index aliases only; small files and new helpers behind facades. Verify only with the shown `npm run verify -- -p A,B` command (optional `-t test`), never workspace-wide checks, `nx run-many`, build, serve, dev, e2e or package targets. Every B entry explicitly invokes Rule R. Project names were read from `project.json`. All paths are workspace-relative; `+` means new.

**B0 - usage port and tokens before consumers.** Write: `libs/backend/platform-core/src/interfaces/session-usage-sink.interface.ts`, `libs/backend/platform-core/src/index.ts`, `libs/backend/platform-core/src/di/tokens.ts`. Read: port `:1-46`, tokens via AST. Depends: none. Verify: `npm run verify -- -p @ptah-extension/platform-core`. Add contribution, trigger and resolver contracts and `Symbol.for` tokens before consumer injection; optional sink methods preserve existing implementers. Tests: public alias exposes contracts and tokens. **Rule R applies.**

**B1 — live capture and schema.** Write: `libs/backend/agent-sdk/src/lib/session-stats/session-usage-sink.ts`, `libs/backend/agent-sdk/src/lib/session-stats/session-stats-owner.service.ts`, `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts`, `libs/backend/persistence-sqlite/src/lib/session-store/sqlite-session-usage-sink.ts`, `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`, `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.spec.ts`. Read: port `:1-46`, schema `:79-163`, owner `:643-750,1173-1228,1301-1305`, migration `:44-123`, repository `:139-162,190-236`, sink `:71-92`. Depends: B0. Verify: `npm run verify -- -p @ptah-extension/agent-sdk,@ptah-extension/persistence-sqlite`. Tests: abort retains measured checkpoint; S0005 nonempty upgrade preserves unprefixed live keys and retry idempotence; source enum accepts replay/estimated; billable filtered sums and historical coverage are correct; NULL differs from zero. Owner emits turn-settled after result and session-closed via `requestFinalization` (`:460-466`) to a bounded notifier port for later reconciler wiring. **Rule R applies.**

**B2 — lane normalization and Codex reason counters.** Write: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-app-server-lane.adapter.ts`, `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts`, `+libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-usage-normalizer.ts`, `+libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-usage-normalizer.spec.ts`. Read: manager `:1494-1503,2638,3647-3666`, completion `:111-170`, Codex `:845`, recorder `:122-206`. Depends: B1. Verify: `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/lane-outcomes`. Persist observed native thread ID on Codex lane row even when cliSessionId is absent; no observed ID means no thread ownership. Tests: message, turn and cumulative scopes produce one turn delta; reset/regression, missing field and measured zero are distinct; Codex NULL reason counters classify absence, invalidity, abort/failure and sink refusal. Manager terminal release (`:3647-3666`) emits lane-completed trigger after settled usage; no per-segment timer. **Rule R applies.**

**B3 — Antigravity, OpenCode, Copilot.** Write: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/antigravity-cli.adapter.ts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts`, `+libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/usage-scope-adapters.spec.ts`. Read: Antigravity `:830-849,1451-1454`; OpenCode `:961-983,1222-1223`; Copilot `:485-510,751-781`. Depends: B2. Parallel with B4 and B5, file-disjoint. Verify: `npm run verify -- -p @ptah-extension/cli-agent-runtime`. Tests: Antigravity result turn, OpenCode step messages aggregated once, Copilot assistant.usage messages aggregated once; absent CLI usage yields NULL `no-usage-event`. **Rule R applies.**

**B4 — Cursor, Pi, ACP.** Write: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/pi-cli.adapter.ts`, `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp/acp-session-handle.ts`, `+libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/acp-usage-scope.spec.ts`. Read: Cursor `:111,495-496`; Pi `:529-547`; ACP `:386-389,798-825`. Depends: B2. Parallel with B3 and B5, file-disjoint. Verify: `npm run verify -- -p @ptah-extension/cli-agent-runtime`. Tests: Cursor turn event, Pi message records with end fallback, ACP prompt/meta plus delayed usage_update yield one turn; no metadata gives NULL. **Rule R applies.**

**B5 — ptah-cli provider and Claude SDK lane.** Write: `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.ts`, `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.ts`, `libs/backend/cli-agent-runtime/src/lib/ptah-cli/helpers/ptah-cli-stream-loop.service.spec.ts`, `libs/backend/cli-agent-runtime/src/lib/claude/claude-sdk-lane-runner.spec.ts`. Read: ptah stream `:639-673,820-882`, manager `:1487-1503,3647-3666`, registry SdkHandle wiring by AST, runner `:812-890`. Depends: B2. Parallel with B3/B4, file-disjoint. Verify: `npm run verify -- -p @ptah-extension/cli-agent-runtime`. Tests: explicitly spawn ptah-cli handle, observe `onSegment` in manager and `recordLaneUsageOutcome` on terminal release, assert persisted lane outcome tokens; same for Claude SDK; absent usage yields NULL reason. **Rule R applies.**

**B6 — cursor persistence and replay transaction.** Write: `libs/backend/persistence-sqlite/src/lib/session-store/session-store-migrations.ts`, `+libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.ts`, `+libs/backend/persistence-sqlite/src/lib/session-store/usage-cursor-repository.spec.ts`, `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`, `libs/backend/persistence-sqlite/src/lib/session-store/register-session-store.ts`, `libs/backend/persistence-sqlite/src/index.ts`. Read: migrations `:99-123`, stats repository `:139-162,190-236`, registration `:36-100`, sink queue `:53,71-85`. Depends: B1/B2. Verify: `npm run verify -- -p @ptah-extension/persistence-sqlite`. Tests: S0006 upgrade, cursor rollback on replay write failure, billable predicate recomputed atomically when late live arrives, replay bypasses live sink queue, historical coverage times; checkpoint main thread and verified child thread add zero replay billable, while NULL-only lane permits replay billing. Register only the cursor repository here; `type:util` must not import agent-sdk. **Rule R applies.**

**B6a — bounded file range port and implementers.** Write: `libs/backend/platform-core/src/interfaces/file-system-provider.interface.ts`, `libs/backend/platform-core/src/testing/mocks/file-system-provider.mock.ts`, `libs/backend/platform-core/src/testing/contracts/run-file-system-contract.ts`, `libs/backend/platform-electron/src/implementations/electron-file-system-provider.ts`, `libs/backend/platform-cli/src/implementations/cli-file-system-provider.ts`. Read: file port `:58-74`, mock `:160-175`, contract `:90-100`, implementations via AST. Depends: B1; parallel with B6 after B1, file-disjoint. Verify: `npm run verify -- -p @ptah-extension/platform-core,@ptah-extension/platform-electron,@ptah-extension/platform-cli,@ptah-extension/cli-engine,@ptah-extension/agent-generation,@ptah-extension/lane-routing,@ptah-extension/task-specs,@ptah-extension/vscode-lm-tools,@ptah-extension/workspace-intelligence` (names verified from project.json). Add **optional** `readFileRangeNoFollow(path,offset,maxBytes)` to avoid breaking hand fakes; reconcile requires capability and marks source unavailable when absent. Contract suite proves offset, 256 KiB cap and no-follow; mock implements optional method. **Rule R applies.**

**B7 — read-only named-profile roots port.** Write: `+libs/backend/auth-providers-tokens/src/lib/usage-profile-roots.port.ts`, `libs/backend/auth-providers-tokens/src/lib/tokens.ts`, `libs/backend/auth-providers-tokens/src/index.ts`, `+libs/backend/auth-providers/src/lib/accounts/usage-profile-roots.adapter.ts`, `libs/backend/auth-providers/src/lib/di/tokens.ts`, `libs/backend/auth-providers/src/lib/di/register.ts`, `libs/backend/auth-providers/src/index.ts`, `+libs/backend/auth-providers/src/lib/accounts/usage-profile-roots.adapter.spec.ts`. Read: profile store `:188-190,328-346`, auth registration by AST, existing token exports. Depends: B1. Parallel with B6/B6a, file-disjoint. Verify: `npm run verify -- -p @ptah-extension/auth-providers-tokens,@ptah-extension/auth-providers`. Tests: active profiles expose only canonical config roots, removed profiles absent, no credential or label returned, no agent-sdk import from port. **Rule R applies.**

**B7a — Claude replay collector.** Write: `+libs/backend/agent-sdk/src/lib/session-stats/usage-collector.interface.ts`, `+libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.ts`, `+libs/backend/agent-sdk/src/lib/session-stats/usage-source-registry.ts`, `+libs/backend/agent-sdk/src/lib/session-stats/claude-jsonl-usage-collector.spec.ts`, `libs/backend/agent-sdk/src/index.ts`. Read: Claude transcript mapping `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:1997-2045`, profile port, agent schema `:112-163`. Depends: B6a/B7. Parallel with B7b, file-disjoint. Verify: `npm run verify -- -p @ptah-extension/agent-sdk`. Registry covers Claude roots only. Tests: JSONL sessionId owns rows, filename is a validation hint; mismatched field/filename yields billable=0 and unmatched-provider-event; a subagent inside a live parent turn adds zero billable tokens; message.id+requestId dedupe; pre-ledger session with no live row produces billable candidates. Check source fixtures for nested/flat subagent and isSidechain layouts. **Rule R applies.**

**B7b — Codex replay using existing rollout reader.** Write: `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.reader.ts`, `+libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-rollout-usage.stream.spec.ts`, `libs/backend/cli-agent-runtime/src/index.ts`. Read: reader `:4-18,57-94,153-182`, auth `codex-app-server-lane-auth.ts:22-25`, manager `:3647-3666`. Depends: B6a/B2. Parallel with B7a, file-disjoint. Verify: `npm run verify -- -p @ptah-extension/cli-agent-runtime`. Extend the existing reader with bounded streaming token_count iterator; reuse path validation and record parser. Export selected Codex roots next to the reader for B8 to merge and realpath-dedupe with B7a Claude roots. Test cumulative deltas, resumed thread append, date-partitioned newest-first scan, non-default selected `CODEX_HOME`, and native thread UUID match. Check rollout session_meta or equivalent fixture for child-parent thread IDs; if absent, keep child replay independently billable. **Rule R applies.**

**B8 — reconciliation scheduler and event binding.** Write: `+libs/backend/usage-analytics/src/lib/usage-reconciliation.service.ts`, `+libs/backend/usage-analytics/src/lib/usage-reconciliation.spec.ts`, `libs/backend/usage-analytics/src/lib/di/registration.ts`, `libs/backend/usage-analytics/src/index.ts`. Read: owner `:460-479,643-750`, manager `:3647-3666`, cursor repository, profile port, sink queue `:53,71-85`. Depends: B6/B6a/B7a/B7b. Verify: `npm run verify -- -p @ptah-extension/usage-analytics`. The B0 platform-core trigger port is optional/nonblocking; B1 owner emits turn-settled/session-closed, B2 manager emits lane-completed; B9 binds it. Scheduler merges B7a Claude and B7b Codex roots by realpath. It exposes an optional post-pass backfill hook that B9 binds to the B10 service; every completed reconciliation pass then invokes B10 backfill. It uses `UsageCursorRepository.commit`, never `SessionUsageSink.recordUsage`. Tests: real producer trigger drives one bounded scan, startup deferred, timer backoff, cursor rollback, shutdown release. **Rule R applies.**

**B9 — Electron and CLI composition, shared-host compatibility.** Write: `apps/ptah-electron/src/di/phase-2-libraries.ts`, `apps/ptah-electron/src/di/container.ts`, `libs/backend/cli-engine/src/lib/container.ts`, `apps/ptah-electron/src/di/container.smoke.spec.ts`, `apps/ptah-electron/src/di/expected-resolvable.ts`, `apps/ptah-electron/src/di/surface-composition.spec.ts`, `libs/backend/cli-engine/src/lib/surface-composition.spec.ts`. Read: Electron phase 2 `:240-245,350-372`, container phase order `:20-50`, CLI `:500-515,790-840`, expected resolvable `:55-65`. Depends: B8/B10. Verify: `npm run verify -- -p ptah-electron,@ptah-extension/cli-engine`. Register reconciler and profile-roots port **after phase 2**; defer first scan until app/window ready via one `setImmediate`, then startup page. CLI starts after lane-outcomes wiring at `:835`. Tests: reconciler resolves/starts once, real B1/B2 trigger reaches it, stops on disposal, and no host-specific import enters a lib. This checkout has no VS Code composition root; shared port is its compatibility contract. **Rule R applies.**

**B10 — repository aggregation and historical identity.** Write: `libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`, `libs/backend/usage-analytics/src/lib/usage-summary.service.ts`, `+libs/backend/usage-analytics/src/lib/repository-usage.spec.ts`, `libs/backend/task-end-hook/src/index.ts`, `+libs/backend/usage-analytics/src/lib/repository-identity-backfill.service.ts`, `+libs/backend/usage-analytics/src/lib/repository-identity-backfill.spec.ts`, `libs/backend/usage-analytics/src/index.ts`. Read: identity helper `libs/backend/task-end-hook/src/lib/trigger/repository-identity.ts:141-189`, stats repo `:421-435`, summary `:100-125`. Depends: B6/B8. Verify: `npm run verify -- -p @ptah-extension/persistence-sqlite,@ptah-extension/usage-analytics,@ptah-extension/task-end-hook`. The **host composition** invokes a read-only repository-ID resolver using the existing git common-dir helper; main chat uses session workspace, lanes use `workingDirectory`, replay uses validated transcript workspace. It passes `repositoryId` and `worktreePath` through `SessionUsageContribution`; persistence-sqlite does not import task-end-hook. Backfill service pages all rows with NULL repository_id after each B8 reconciliation pass, including new live rows, using `workspace_key`/`worktree_path` and existing `sessions.workspace_path`; it resolves IDs and updates rows/stats in bounded transactions; unresolved stays NULL. Tests: two worktrees aggregate, path retained, existing rows gain ID, non-git workspace isolated, unknown coverage visible, and a live row inserted after migration gains repository_id after the next reconciliation pass. **Rule R applies.**

**B11 — existing dashboard read and guards.** Write: `libs/frontend/dashboard/src/lib/services/analytics-usage.store.ts`, `libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-summary.view-model.ts`, `+libs/frontend/dashboard/src/lib/components/usage-dashboard/usage-summary.view-model.spec.ts`, `apps/ptah-electron/src/di/rpc-surface.spec.ts`, `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`. Read: dashboard store/view-model via AST, summary `:100-125`, RPC guard files via AST. Depends: B9/B10. Verify: `npm run verify -- -p @ptah-extension/dashboard,ptah-electron,@ptah-extension/cli-engine`. Tests: existing screen displays repository total and unknown coverage; RPC allowlist unchanged because no new method is planned. **Rule R applies.**

## DI and guard specs

Use existing `PLATFORM_TOKENS` for sink/file ports and add `Symbol.for` trigger/repository-resolver tokens to `platform-core/src/di/tokens.ts` in B0. Register **only** cursor persistence in `persistence-sqlite/src/lib/session-store/register-session-store.ts` (B6); `type:util` never imports agent-sdk. B9 binds profile roots, trigger, resolver and reconciler after `apps/ptah-electron/src/di/phase-2-libraries.ts` registration, then defers first scan until window ready; CLI binds after `startCliLaneOutcomes` in `libs/backend/cli-engine/src/lib/container.ts:835`. B9 has the disposal path. The B10 resolver implementation is a feature-level wrapper around the existing task-end-hook git-common-dir helper, exported publicly; B8 invokes the B10 backfill service after each reconciliation pass to fill NULL repository_id for both migrated and newly written rows. This worktree has no VS Code app/composition root or `platform-vscode` lib; repository-wide search found only Electron and CLI session-store registrations. Preserve shared-host compatibility through ports, no host-specific imports in host-neutral libs.

Electron `container.smoke.spec.ts` and `expected-resolvable.ts` gain a reconciler resolution assertion. `surface-composition.spec.ts` confirms exactly one start/dispose; CLI's same spec checks its composition root. Electron and CLI `rpc-surface.spec.ts` should run and assert the existing surface unchanged: repository summary uses the existing analytics route, so no new RPC method or allowlist change is planned. If implementation discovers the existing method cannot carry repository identity, that is a contract decision to resolve before adding an RPC endpoint.

## Risks

- The SDK live turn has no per-message request ID. Use verified session identity and measured turn interval; when absent, live owns the whole session. Replay of wholly unowned historical sessions remains billable.
- Legacy rows lack request IDs and turn spans. Preserve their unprefixed keys and give them conservative session ownership; other sessions still backfill.
- Multi-GB trees are costly to enumerate even with bounded reads. Persist discovery progress and page directories so startup never recursively stats all transcripts.
- Rotation, truncation and same-path replacement require fingerprint comparison and rewind; idempotent keys prevent double count.
- A CLI may expose a usage segment but omit cache fields or costs. Preserve NULL per field and an explicit reason, and keep provider-reported cost authoritative.
- The SQL rebuild must preserve all old indexes, row count and aggregate semantics. Migration fixture tests must include a nonempty version-4 database.

## Decisions

| Decision | Options | Evidence | Reversible |
|---|---|---|---|
| Git common dir is canonical repository ID; worktree path remains separate. | Remote URL, workspace key. | `repository-identity.ts:141-189`; fixed context rule. | Yes, added column. |
| Yielding bounded async file reads, with platform-core range-read/stat port. | `worker_threads`. | I/O-bound JSONL and existing file port; avoids second DI/DB lifecycle. | Yes. |
| Producer-native event keys plus transactional billable ownership; keep legacy live keys unprefixed. | Assume key collision or heuristic timestamp match. | Owner `:1305`, lane completion `:145-149`, repository `:139-162`. | Yes. |
| Provider-reported cost, then model-priced, then unpriced. | Reprice all; coalesce missing to zero. | Existing authority enum `session-usage-sink.ts:63-69`; fixed NULL rule. | Yes. |
| Named account roots come from active profile registry. | Guess folders. | `provider-account.store.ts:188-190,328-346`; user's all-profile decision. | Yes. |
| Task-tool child is metadata when included in parent cumulative usage. | Sum both parent and child. | `session-stats-owner.service.ts:1173-1184`. | Yes. |

No user-reserved clarification remains: source scope, privacy and repository identity are fixed by context. No source code or verification was run for this design task.




