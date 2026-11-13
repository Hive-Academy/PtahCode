# Plan review — TASK_2026_1164_216b

Reviewer: Claude software-architect subagent (cross-side; writer was Codex). The subagent reached its context budget; the orchestrator assembled this file from its finished notes.

## Verdict

REVISE — 4 Blocking, 5 Serious, 5 Moderate, 1 Minor.

## Proposed Removals

None. Only the port comment at session-usage-sink.ts:40 ("transcript backfill excluded") is reversed, by user instruction.

## Spot-checks done (all paths under the worktree) — all ACCURATE except noted
1. platform-core session-usage-sink.interface.ts:1-46 — correct (non-null token fields, producers 3, source absent).
2. agent-sdk session-usage-sink.ts:29-44 — correct; ":40" says backfill excluded. Cost enum at ~63-67 ok.
3. owner :643-750 accepted-result path, :1173-1184 Task-subagent comment — correct. Live eventKey is
   `${runToken}#${turn}` (owner:1305) — per TURN, no message.id/requestId.
4. agent-process-manager :1494-1499 outcomeUsageIsTurnTotal gate; :3647-3666 recordLaneUsageOutcome — correct.
5. codex-app-server-lane.adapter.ts:845 `outcomeUsageIsTurnTotal: true` — correct.
6. lane-completion-outcome.ts:121-134 coalesce ?? 0 and all-zero skip — correct; :170 workspaceKey — correct.
   Lane ledger sessionId = `info.cliSessionId ?? runId` (≈:145), eventKey `${runId}:${completedAt}`.
7. lane-outcome-recorder.service.ts:122-124 NULL defaults — correct.
8. migrations :44-97 schema, PK (session_id,producer,event_key,model_id) at :65, versions 1-4 at :119-124 — correct.
9. sqlite-session-usage-sink.ts:71-85 queue, MAX_PENDING_WRITES=256 (:53) — correct.
10. session-stats-repository.ts:421-435 single workspace filter — correct (approx lines).
11. Adapters antigravity 830-849, opencode 961-983, copilot 485-510/751-781, cursor 111/495, pi 529-547,
    acp 386-389/798-825, ptah-cli stream 639-673/820-882 — all contain usage parsing, correct.
12. provider-account.store.ts:188-190 list() active claude profiles — correct; :328-346 is add/insert (ok).
    provider-account.service.ts:157-165 is the ADMISSION/lease path (namedRoute during certification), not a
    listing API — misleading as the backfill source.
13. repository-identity.ts:141-189 git commonDir via bounded run — correct; NOT exported from task-end-hook index.
14. phase-1-infra.ts:167 registerSessionStoreServices — correct; cli container :508 and :835 — correct.
No outright wrong line cites found.

## Findings to write
B1 BLOCKING dedupe live vs replay (Claude): live sdk-owner rows are per-turn cumulative-delta keyed
  `${runToken}#${turn}` (owner:1305) and include Task-subagent spend (owner:1173-1184); replay is per-message
  `claude:<sid>:<msg.id>:<requestId>`. Keys never collide → turn-settled replay of a Ptah-owned session double
  counts. "Final result replaces provisional message sum" contradicts keeping message keys. Also ledger
  sessionId vs transcript filename UUID mapping not verified (assumption). Fix: session/turn ownership rule —
  replay skips (or marks non-billable) any session already having sdk-owner/cli-lane/codex-checkpoint rows,
  and only fills sessions/time ranges with no live rows; state it as precise billable predicate.
B2 BLOCKING dedupe Codex: lane rows use session_id = codex thread id (cliSessionId) with key
  `${runId}:${completedAt}`; replay key `codex:<threadId>:<turnId>:<seq>` → same session, different key →
  double count of the 791 codex lane sessions. Also codex-checkpoint producer (session-metadata-store.ts:1539-1623).
  Also an existing `cli-agent-runtime/.../codex/codex-rollout-usage.reader.ts` already parses rollouts
  (`<CODEX_HOME>/sessions/...rollout-...-<thread id>.jsonl`) — plan creates a new parallel collector in agent-sdk
  without mentioning reuse (Replace-don't-accumulate). Also lanes may use non-default CODEX_HOME
  (codex-app-server-lane-auth.ts:24-25) — source registry must include it or say why not.
B3 BLOCKING "unmatched → nonbillable" rule ambiguous: as written, all pre-Nov-6 history (no live rows) is
  unmatched → withheld → backfill delivers nothing. Need explicit billable predicate + a schema column
  (e.g. `billable INTEGER NOT NULL DEFAULT 1` or status) — S0005 has none; totals SQL (repo :192-198, :421-435)
  sums every row.
B4 BLOCKING dependency cycle: B7 puts usage-source-registry in agent-sdk and edits auth-providers to list
  profiles; auth-providers already imports agent-sdk (claude-account-command.ts:4, claude-account-status.ts:1)
  → agent-sdk importing auth-providers = cycle. agent-sdk only uses @ptah-extension/auth-providers-tokens
  (type:core). Fix: add a read-only profile-roots port to auth-providers-tokens (write set) implemented in
  auth-providers; use store.list() (:188-190) not service admission path; transcripts at `<canonicalDir>/projects`.
S5 SERIOUS boundary: B8 writes persistence-sqlite register-session-store.ts + index to register the reconciler
  that lives in agent-sdk; persistence-sqlite is type:util (eslint.config.mjs:390-391 util→util only) and imports
  only platform-core/vscode-core. Register only cursor repo there; register reconciler in agent-sdk DI or the
  composition roots.
S6 SERIOUS missing write targets: new Symbol.for tokens need libs/backend/platform-core/src/di/tokens.ts (not in
  any write set); new agent-sdk services need libs/backend/agent-sdk/src/index.ts export (no batch writes it) →
  B9 cannot import them. Interface location of UsageCursorRepository/UsageCollector/CliUsageObservation not named.
S7 SERIOUS B6 file-port change: IFileSystemProvider (platform-core file-system-provider.interface.ts) is
  implemented/faked in platform-core testing/mocks/file-system-provider.mock.ts, contracts/run-file-system-contract.ts
  and hand fakes in specs of agent-generation, cli-engine, lane-routing, task-specs, vscode-lm-tools,
  workspace-intelligence. Adding a required method breaks their typecheck outside B6 verify set; mock + contract
  suite missing from write set; B6 already 7 files → >8. Fix: split B6 (cursor repo vs file port), add mock +
  contract, consider reusing existing readFileBoundedNoFollow (:58)/stat or making range read optional; verify
  affected consumers.
S8 SERIOUS composition timing: phase-1-infra:167 runs before phase-2 libraries (agent-sdk, auth-providers) —
  reconciler depends on those; start it after phase-2 / after window ready, deferred, not in phase-1. CLI start
  alongside startCliLaneOutcomes (:835) ok.
S9 SERIOUS event trigger wiring unspecified: who emits turn-settled/session-closed/lane-completed to the
  reconciler? no batch writes owner/manager/sink hook for triggers; B8 tests triggers with no source.
  Live writer queue (MAX_PENDING_WRITES=256, sink:53) shared with replay → backfill can overflow and reject live
  writes; reconciler must write through its own repository transaction, not the live queue.
M10 MODERATE schema/enums: contract `source: 'live'|'replay'` but repo schema source enum is ['live','estimated']
  (repository:23) and session_stats derives live/estimated (:197); sink stamps 'live' always (sink:232,255,283).
  Specify enum migration. Contract makes modelId/turnId nullable but S0005 keeps NOT NULL (state mapping to '').
  New PK drops producer, but repository delete/insert keyed by (session,producer,event_key) (:141,148) → PK
  conflict when two producers share a key; specify upsert.
M11 MODERATE coverage semantics: session_usage_coverage first_captured_at_ms = Date.now() (repo:231-236);
  backfill must set historical times or analytics will keep "historical missing" (usage-summary.service.ts:117-120).
M12 MODERATE legacy re-key: after S0005, an existing live session's retried/replayed sdk-owner event writes key
  without `legacy:` prefix → duplicate of a legacy row for in-flight sessions at upgrade. Specify: migration
  runs before any producer; or keep legacy keys unprefixed and namespace only new keys.
M13 MODERATE B10 repository identity: task-end-hook not exported (index.ts has no repository-identity);
  persistence-sqlite (type:util) cannot import task-end-hook (type:feature). Resolve repository_id at write time in
  a feature lib and pass via contract; state who computes it for lanes (workingDirectory) and replay (cwd in
  transcript). Specify backfill of repository_id for existing rows.
M14 MODERATE B5 ptah-cli path: research says how ptah-cli lanes become outcome rows is UNVERIFIED; plan edits
  stream loop without verifying it reaches manager onSegment. Add a verification step.
m15 MINOR Rule R is good; verify commands use real names (@ptah-extension/*, ptah-electron) — correct.
  B3/B4/B5 file-disjoint — correct. B10 "parallel with B7/B8" ok (repository file only; B1 also writes it but earlier).
  B11 frontend: add `npm run verify -- -t typecheck-templates -p ptah-extension-webview` if templates change.
m16 MINOR performance otherwise sound (setImmediate chunks, 256 KiB reads, no worker_threads); add: directory
  paging must not use recursive readDirectory; Codex date-partitioned tree allows newest-first scan.
DI guards: smoke/expected-resolvable/surface-composition/rpc-surface listed — ok; cli-engine has no
  expected-resolvable (fine). No VS Code host in worktree (apps: ptah-electron, webview, landing, docs) — plan
  claim correct.
Removals: none proposed.
