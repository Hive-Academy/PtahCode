# Plan review round 2 — TASK_2026_1164_216b

Reviewer: Claude software-architect subagent (scoped re-review of round 1 fixes). Inputs read:
plan-review.md, plan-revision-notes.md, and implementation-plan.md (236 lines, all of it). I made
6 narrow code reads: the S0002 schema, project tags and depConstraints, the codex-checkpoint builder,
and the import lists.

## Verdict

REVISE. 2 Blocking and 3 Serious findings are open. The migration SQL, the lib placement, the
billable column and the totals filter are correct. Ownership still fails for Codex main-chat
sessions and for Claude subagent transcripts, and two batches depend on files written later.

## Previous findings

| ID | Status | Note |
|---|---|---|
| B1 | OPEN (narrowed) | Main-session Claude ownership is now precise. An SDK turn interval makes replay nonbillable, and a late live row demotes replay in one transaction. Subagent/sidechain transcripts can still double count. See N1. |
| B2 | OPEN | The lane path works when `cliSessionId` is present. The codex-checkpoint session key does not match the replay key, the lane fallback session (`runId`) does not either, and NULL lane rows have undefined ownership. See N2. |
| B3 | RESOLVED | `billable` column, explicit "no live rows means billable, including pre-ledger history", totals filter `WHERE billable = 1`, coverage from MIN/MAX. |
| B4 | RESOLVED | Port in auth-providers-tokens (`type:core`), implemented in auth-providers, scheduler in usage-analytics (`type:feature`). Feature-to-feature/core/util imports are allowed (eslint.config.mjs:372-378). No checked lib imports usage-analytics, so there is no cycle. One placement gap remains: see N4. |
| S5 | RESOLVED | persistence-sqlite registers only the cursor repository. B9 composes the reconciler. |
| S6 | OPEN | The tokens file is now in a write set, but in B8. B1 and B2 inject the trigger port earlier. See N3. |
| S7 | RESOLVED | Optional `readFileRangeNoFollow`, plus the mock and the contract suite. The consumer verify list is in B6a. |
| S8 | RESOLVED | Registration after phase 2, and the first scan waits until the window is ready. |
| S9 | RESOLVED | B1 owner and B2 manager are the emitters. The replay writes through `UsageCursorRepository.commit`, not the live queue (it is token-ordered: N3). |
| M10-M12, M14 | RESOLVED | Source enum, sentinels, ON CONFLICT upsert, historical coverage, unprefixed legacy keys, ptah-cli end-to-end assertion. |
| M13 | OPEN (folded into N5) | Historical backfill is specified. Repository ID for new live rows has no writer. |

## Checks that pass

- **Migration S0005** is valid SQLite and safe on a nonempty version-4 DB. The column list matches
  S0002 exactly (session-store-migrations.ts:45-65). Nullable counters accept the old NOT NULL
  data. `billable DEFAULT 1` applies to copied rows. The DROP removes the old indexes, and all
  three are recreated with the same names. The rename happens inside the existing transaction
  runner.
- **Narrowed PK** `(session_id,event_key,model_id)`: the existing producer key formats differ
  (`${runToken}#${turn}`, `${runId}:${completedAt}`, `String(revision)` /
  `${revision}#price#...` at session-metadata-store.ts:310-312). The copy cannot collide.
- **Totals SQL** filters `billable = 1`. Coverage uses billable MIN/MAX.
- **Race with turn-settled**: a replay can run before the queued live row lands. The plan demotes
  replay rows "atomically ... whenever a late live row arrives", and B6 tests this. That handles
  the race. For the implementer, state that the demotion and the `session_stats` recompute run in
  the same transaction as the live upsert in `session-stats-repository.ts`.
- **Batches**: every batch has 8 or fewer written files (B1 8, B7 8, the others 3-7).
  B3/B4/B5, B6/B6a/B7 and B7a/B7b are file-disjoint. The verify commands use the
  `npm run verify -- -p ...` form. The B1, B6 and B10 edits to `session-stats-repository.ts` are
  chained (B6 depends on B1, B10 on B6), and so are the edits to the usage-analytics index (B10
  depends on B8).

## Open and new findings

### N1 BLOCKING — Claude subagent transcripts escape ownership (rest of B1)

The plan says: "If the mapping is absent or invalid, keep the replay row in its own transcript
session and do not attach it to a Ptah live session". Task-subagent spend is already inside the
parent SDK cumulative result (owner:1173-1184). If subagent or sidechain transcript files carry the
parent's `sessionId` under a different filename UUID, the filename check fails. Those rows then form
a session with no live rows, are billable, and the subagent spend is counted twice.
Assumption: the layout is `<project>/<sessionId>/subagents/agent-*.jsonl` or `isSidechain`
entries with the parent `sessionId`. The implementer must check this on a real tree.

Change required in "Dedupe and idempotency":
- Key ownership on the JSONL `sessionId` field. Use the filename only as a validation hint.
- Attribute sidechain and subagent files to the parent session, so the parent's live intervals
  cover them.
- When the filename and the field disagree in a file that has a `sessionId` field, write the rows
  with `billable=0` and `missing_reason='unmatched-provider-event'`. Never give them their own
  billable session.
- Add a B7a test: a subagent transcript inside a live parent turn interval adds 0 billable tokens.

### N2 BLOCKING — Codex checkpoint and lane fallback do not match the rollout thread (rest of B2)

Verified: codex-checkpoint rows use `sessionId` = the Ptah session, `runId: accepted.rootThreadId`,
and "A revision may span several threads' turns" (session-metadata-store.ts:305-309). Replay rows
use session = rollout thread UUID. So the predicate "its provider session has no overlapping live
ownership interval" finds no owner, and every main-chat Codex session counts twice. Also:
- A lane without `cliSessionId` stores `session_id = runId` (lane-completion-outcome.ts:145) and
  cannot match either.
- The plan does not say whether a lane or checkpoint row with only unknown counters creates an
  ownership interval. Because of this, the 448 NULL Codex lanes are either double counted or never
  filled.

Change required:
- Define Codex ownership by **native thread ID**, not by `session_id`:
  - codex-checkpoint rows own `run_id` (root thread) and every descendant thread in that revision.
    State how child threads are known, for example a parent ID in the rollout `session_meta`, as
    an Assumption with a check.
  - cli-lane rows own the native thread ID. B2 must persist the thread ID on the lane row (in
    `run_id` or a new column) even when `cliSessionId` is missing. If no thread ID was ever seen,
    the lane owns nothing.
- Rows whose counters are all NULL do **not** create ownership intervals, so replay fills them.
- Add B6/B7b tests for: a checkpointed main-chat thread (0 extra billable), a child thread of a
  checkpointed root (0 extra), and a NULL-usage lane (replay billable).

### N3 SERIOUS — DI tokens are written after their consumers (S6 still open)

B1 (owner) and B2 (manager) inject `UsageReconciliationTrigger`, and the DI section says they also
get `RepositoryIdentityResolver`. The `Symbol.for` tokens are added to
`platform-core/src/di/tokens.ts` only in B8, which depends on B6, B7a and B7b. B1 and B2 cannot
compile their optional injection.

Change: move the tokens.ts edit into the batch that adds the port. B1 already has 8 files, so split
out a **B0**:
- B0 writes the platform-core `session-usage-sink.interface.ts`, `index.ts` and `di/tokens.ts`.
  Verify: `npm run verify -- -p @ptah-extension/platform-core`.
- B1 drops the two platform-core files and depends on B0.
- B8 no longer writes tokens.ts.

### N4 SERIOUS — Codex roots in the agent-sdk source registry would need a reverse import

B7a puts `usage-source-registry.ts` in agent-sdk. The Contracts registry includes "non-default
`CODEX_HOME/sessions` from the active Codex lane auth route". That route is in
`codex-app-server-lane-auth.ts` (the Codex lane adapters, in cli-agent-runtime per the plan's
B7b reads). cli-agent-runtime imports agent-sdk, so agent-sdk cannot read it.

Change: the agent-sdk registry covers only the Claude roots (`~/.claude/projects` plus the
profile port). The Codex roots come from cli-agent-runtime (B7b exports them next to the reader).
The usage-analytics scheduler (B8) merges both lists and dedupes them by realpath. Say this in
Contracts and in the B7a and B7b descriptions.

### N5 SERIOUS — New live rows never get a repository ID (rest of M13)

The DI section says the host injects the resolver "into B1 owner and B2 manager". But no batch
writes resolver use in the owner or the manager: B1 and B2 do not mention it, and B10 does not
write those files. The B10 backfill only pages existing rows. Rows written after the upgrade would
keep `repository_id` NULL, so the repository totals from the acceptance criteria are incomplete.

Change, pick one:
- (a) Recommended, with no owner or manager change: B10's backfill service runs after each
  reconciliation pass (B8 calls it) and fills NULL `repository_id` from
  `workspace_key`/`worktree_path` for new rows too. Delete the "injects it into B1 owner and B2
  manager" sentence.
- (b) Add the resolver call to the B1 and B2 write descriptions, with the token in B0 (N3).

Either way, add a B10 test: a live row written after the migration gains its repository ID.
