# Navigation benchmark rerun (round 7) — TASK_2026_2320_15a6

Live rerun of the navigation benchmark of TASK_2026_2299_d6f5. Round 6 is "before". Round 7 is
"after".

- **Build head: `cd25c1cac`** (main with PR #1487 nav-tools follow-ups and PR #1491 code-index
  scope and reuse). **PR #1489 is not in this head**, so this run does not measure it.
- Models: `haiku` for the Claude arms, `gpt-6-luna` for the Codex arms. No other model ran.
- 5 arms x 8 tasks, one pass. One harness-caused failure was retried one time (see Code Mode).
- Isolated instance only (own HOME, XDG, settings and DB under `.ptah/tmp/live-test-home`, MCP
  port 51821, control port 51991). The user's app (PID 1387772, port 51820), `/opt/Ptah`, the
  real `~/.ptah` and `~/.claude` state were not touched: `hashes.sh` output before launch, after
  each launch and after the final stop is identical for every user file, and the user app stayed
  alive. Only recorded PIDs were stopped (by `POST /stop`).
- The harness copy is in `harness/` (secret-free). Raw rows and transcripts stay in
  `.ptah/tmp/bench/` and are not committed: transcripts hold the account e-mail.
- After the PR review, the committed harness differs from the copy that ran: the control API
  of `drive.mjs` needs a random per-run token (`x-bench-token`) and forwards only 4 RPC
  methods, `stage2.mjs` aborts a timed-out Ptah chat before the next task, and a missing
  native CLI fails only its task. The rows in this report come from the earlier copy. One
  task hit the chat timeout path: the first code-mode pass of `files-session-handoff` (see
  Code Mode arm). The earlier copy did not abort that chat, and it overlapped the next task.

## Method

| arm | agent | how |
|---|---|---|
| native-haiku | `claude -p --model haiku` | no MCP, tools Bash/Read/Grep/Glob, `--max-turns 30` |
| ptah-haiku | Ptah main chat, model haiku | `chat:start` RPC on the isolated instance |
| code-mode | Ptah main chat, model haiku | as ptah-haiku, plus a deny list in `<ws>/.claude/settings.local.json` (Read, Grep, Glob, Bash, Task, Agent, WebFetch, WebSearch and every `mcp__ptah__*` tool except `execute_code`) and a one-line prompt prefix. The file exists only while the arm runs. New arm: no "before". |
| native-codex | `codex exec -m gpt-6-luna -s read-only` | own CODEX_HOME |
| ptah-codex | haiku chat spawns one codex lane (gpt-6-luna) | the lane is measured |

- Workspace: `git archive HEAD` of `cd25c1cac`, made into its own git repository (see harness
  note 2).
- "Before" sources: round 6 (`stage2-r6.jsonl`) for ptah-haiku and ptah-codex. Round 6 did not
  run the native arms, so their "before" is round 4 (`stage2-results.jsonl`), the same baseline
  that the round 6 report used. `summarize.mjs` reproduces the published round 4 and round 6
  totals exactly.
- **Weighted tokens** = input + 1.25 x cacheWrite + 0.1 x cacheRead + output (Claude).
  Codex: (input − cached) + 0.1 x cached + output (Codex `input_tokens` includes cached input and
  has no cache write). Same weighting as rounds 5 and 6.
- Call classes: `native` = Read/Grep/Glob, `shell` = Bash or Codex `exec_command`, `ptah` =
  `mcp__ptah__ptah_*`, `code` = `execute_code`, `discover` = ToolSearch or the Codex tool
  discovery `exec`.
- Wall time is the sum of the per-task wall time measured by the harness.
- ptah-codex tasks 1–3 ran on the first instance. Tasks 4–8 ran on a restarted instance (the
  previous coordinator stopped). Both instances used the same build, workspace and index store.

### Adapted tasks (code moved on main)

Two tasks reference code that moved on main. The harness adapts them. The other six tasks are
unchanged.

| task | before (round 6) | after (round 7) |
|---|---|---|
| `read-range-permission-handler-levels` | question: lines 276–300; keys `setPermissionLevel`, `getPendingCliAgentPermissions` | question: lines 348–372; keys unchanged |
| `usages-symbol-pending-permission-count` | keys `session-query-executor.service.ts`, `permission.types.ts` | keys `sdk-permission-handler.ts`, `permission.types.ts` (no production caller remains) |

The six unchanged tasks: `read-symbol-tab-manager-find-by-session`,
`usages-text-abort-reason-superseded`, `concept-clamp-read-tail`, `outline-indexing-control`,
`files-session-handoff`, `concept-release-attach-claim`.

## Results — all 8 tasks

| arm | run | correct | calls | calls by class | input | cacheWrite | cacheRead | output | weighted | wall |
|---|---|---|---|---|---|---|---|---|---|---|
| native-haiku | before (r4) | 8/8 | 31 | native 31 | 0k | 254k | 1,059k | 13k | 436k | 441 s |
| native-haiku | after | 8/8 | 29 | native 24, shell 5 | 0k | 291k | 1,238k | 14k | 502k | 310 s |
| ptah-haiku | before (r6) | 8/8 | 11 | ptah 10, native 1 | 0k | 225k | 514k | 8k | 341k | 166 s |
| ptah-haiku | after | 8/8 | 14 | ptah 14 | 0k | 306k | 714k | 10k | 464k | 167 s |
| code-mode | after | 7/8 | 57 | code 50, discover 7 | 0k | 137k | 1,441k | 19k | 334k | 306 s |
| native-codex | before (r4) | 5/8 | 26 | shell 25, ptah 1 | 77k | 0k | 560k | 4k | 137k | 204 s |
| native-codex | after | 6/8 | 24 | shell 24 | 106k | 0k | 506k | 4k | 161k | 142 s |
| ptah-codex | before (r6) | 7/8 | 33 | ptah 24, discover 9 | 79k | 0k | 587k | 4k | 142k | 713 s |
| ptah-codex | after | 7/8 | 36 | ptah 27, discover 9 | 123k | 0k | 570k | 4k | 183k | 429 s |

Code Mode "after" uses the retry row for `files-session-handoff` (see Code Mode).

## Results — the 6 unchanged tasks

| arm | run | correct | calls | calls by class | input | cacheWrite | cacheRead | output | weighted | wall |
|---|---|---|---|---|---|---|---|---|---|---|
| native-haiku | before (r4) | 6/6 | 28 | native 28 | 0k | 211k | 916k | 11k | 367k | 275 s |
| native-haiku | after | 6/6 | 25 | native 20, shell 5 | 0k | 237k | 1,038k | 12k | 412k | 88 s |
| ptah-haiku | before (r6) | 6/6 | 9 | ptah 9 | 0k | 170k | 387k | 7k | 258k | 132 s |
| ptah-haiku | after | 6/6 | 12 | ptah 12 | 0k | 232k | 565k | 8k | 354k | 123 s |
| code-mode | after | 5/6 | 42 | code 37, discover 5 | 0k | 98k | 1,074k | 14k | 244k | 201 s |
| native-codex | before (r4) | 5/6 | 23 | shell 22, ptah 1 | 68k | 0k | 492k | 3k | 120k | 167 s |
| native-codex | after | 5/6 | 18 | shell 18 | 83k | 0k | 387k | 3k | 125k | 108 s |
| ptah-codex | before (r6) | 6/6 | 24 | ptah 17, discover 7 | 63k | 0k | 422k | 3k | 108k | 598 s |
| ptah-codex | after | 5/6 | 29 | ptah 22, discover 7 | 89k | 0k | 471k | 3k | 139k | 336 s |

## Deltas (all 8 tasks, after vs before)

- **ptah-haiku**: correctness equal (8/8). Calls 11 → 14. Weighted +36% (341k → 464k). Wall time
  equal. The per-task cost rose on every task. The prompt of each turn grew by about 10k
  tokens. A one-call task has 2 turns: its cacheWrite + cacheRead is about 91k in round 6
  (90,875–92,843) and about 111k now (111,166–112,658). So turn 1 is about 45k tokens in
  round 6 and about 56k now (example: `usages-text-abort-reason-superseded`, cacheWrite
  36,333 + cacheRead 19,518 on turn 1). The larger fixed prompt explains the increase, not
  more tool calls. Suspected cause, not proven: PR #1475 ("one source for ptah tool
  substitution guidance", merge 467a1ddb6, included in build head cd25c1cac). This run did
  not isolate the source. Other possible sources are the tool schemas and the claude.ai connectors that the
  isolated Claude login attaches (see harness note 4).
- **ptah-codex**: correctness equal (7/8), but a different task failed (see wrong answers).
  Calls 33 → 36. Weighted +29% (142k → 183k), mostly non-cached input (79k → 123k). Wall time
  −40% (713 s → 429 s).
- **native-haiku**: 8/8 both. Weighted +15%, wall time −30%. Native arms do not use Ptah code,
  so these deltas show model and service variance between runs, not a product change.
- **native-codex**: 5/8 → 6/8. Weighted +18%, wall time −30%. Same note as native-haiku.
- On the 6 unchanged tasks the picture is the same: ptah-haiku 6/6 → 6/6 at +37% weighted,
  ptah-codex 6/6 → 5/6 at +28% weighted.

## Code Mode arm

Code Mode is new in this round. The agent can use only `execute_code` and the `ptah` global.

| measure | code-mode | ptah-haiku (same model, all tools) |
|---|---|---|
| correct (8) | 7/8 (first pass 6/8) | 8/8 |
| correct (6 unchanged) | 5/6 | 6/6 |
| calls | 57 (7.1 per task) | 14 (1.8 per task) |
| weighted | 334k | 464k |
| wall | 306 s | 167 s |

- Code Mode used 4x more calls but 28% fewer weighted tokens than ptah-haiku. Each
  `execute_code` result is small, and the cache write is lower (137k vs 306k, about 17k vs 38k
  per task). The deny list probably removes the denied tool schemas from the prompt. This run
  did not isolate that cause. The cache read is higher (1,441k vs 714k) because of the many
  turns.
- Retry: the first pass of `files-session-handoff` timed out after 302 s. The row shows 0
  calls because the harness found no finished transcript. The transcript
  (`125b0a41…`) shows 2 calls (19:35:27–19:35:30Z), then API connection errors
  (StreamNoResponse at 19:38:02Z, ECONNREFUSED at 19:40:17Z). So it is a harness/service
  failure, not an answer. The one allowed retry ran on the restarted instance: correct, 4
  calls, 25k weighted, 22 s. The timeout row stays in the raw file. The table uses the retry
  row.
- Overlap after that timeout: the earlier harness did not abort the chat. The session
  recovered and made 3 more `execute_code` calls (19:40:19–19:40:31Z) and an answer at
  19:40:35Z. Task 8 (`concept-release-attach-claim`) ran 19:40:22–19:40:42Z, so the two
  sessions shared the instance for about 13 s. Task 8 was scored from its own transcript
  (`5b1015b2…`, its own question): the older file was already in the harness's "before"
  set. Task 8 was correct. Its wall time (20 s) may include some contention. The committed
  harness now aborts a timed-out chat before the next task.
- Wrong answer `concept-clamp-read-tail` (missing `clampTail`): 10 calls. The agent read
  `ptah.help()`, scanned files by hand, and never found a symbol search. It answered
  `retainSubagentEventsTail`. The API has `ptah.code.searchSymbols`, but the help does not show
  it (see finding (d)).

## Wrong answers (round 7)

| arm | task | missing keys | what the agent answered |
|---|---|---|---|
| native-codex | `usages-symbol-pending-permission-count` (adapted) | `permission.types.ts` | Correct definition in `sdk-permission-handler.ts` and "no production caller", but it did not name the interface in `permission.types.ts`. 1 call. |
| native-codex | `files-session-handoff` | `session-handoff-chain.store.ts` | Named `session-handoff.service.ts` and `session-spawner.service.ts`, not the chain store. 4 calls. |
| code-mode | `concept-clamp-read-tail` | `clampTail` | `retainSubagentEventsTail` (a different trim function). 10 calls. |
| ptah-codex | `concept-clamp-read-tail` | `clampTail` | Correct file (`session-spawner.service.ts`) but an invented name `clampSessionReadTail`. The real function is `clampTail` (`session-spawner.service.ts:3354`). 4 calls. |

Round 6 and round 4 wrong answers, for comparison:

- r6 ptah-codex `usages-symbol-pending-permission-count` (old keys): missing `permission.types.ts`.
- r4 native-codex `read-range-permission-handler-levels`: both keys missing, 0 calls.
- r4 native-codex `usages-symbol-pending-permission-count` (old keys): missing `permission.types.ts`.
- r4 native-codex `concept-release-attach-claim`: missing `releaseAttachClaim`, 0 calls.

## Code index timings

| run | duration | files | skipped unchanged | symbols |
|---|---|---|---|---|
| Part B G7 census cold run (TASK_2026_2312_c3ef `g7-results.md:23`) | 1,295 s | 4,771 | 0 | 50,314 |
| round 7 cold run | 3,857 s (64.3 min) | 4,775 | 0 | 50,365 |
| round 7 second run (after `git init` of the workspace) | 18.8 s | 4,775 | 4,745 | 50,365 |
| round 7 warm restart (new app process, same store) | 17.5 s; ready 22.8 s after launch | 4,775 | 4,745 | 50,365 |

The warm restart is a real-world check of PR #1491 reuse: the new process started the index
run 5.3 s after launch and finished 17.5 s later. It parsed only 30 of 4,775 files and reported
23 errors, the same count as the earlier runs. Round 6 had 49,646 symbols.

## Findings (record only, no fix)

### (a) Cold index: 64.3 min here vs 1,295 s in the G7 census

The cold run took 3,857 s. The G7 census cold run took 1,295 s for about the same file count.
Progress polls show three causes:

1. **Governor `foreground-busy` deferral.** The run started at 18:22:16Z. From about 18:23 to
   18:37:50 test sessions waited on permission prompts (harness note 1). The indexer finished
   only about 360 files in that time. At the G7 rate of 3.7 files/s that costs about 790 s.
   The indexer yields before each batch
   (`libs/backend/workspace-intelligence/src/services/code-symbol-indexer.service.ts:1274-1283`)
   and the governor defers each batch up to `DEFAULT_MAX_DEFER_MS` = 10 min
   (`libs/backend/vscode-core/src/diagnostics/background-work-governor.ts:185`). The app log
   has the line `deferral ceiling reached — proceeding` with
   `{"lane":"code-symbol-indexer","maxDeferMs":600000,"state":"foreground-busy"}`
   (`background-work-governor.ts:410`): at least one batch waited the full 10 minutes.
2. **CPU contention.** After the blocked sessions were aborted: 18:38–18:46 at 2.6 files/s,
   18:46–19:01 at 0.8 files/s (load average 10.6 on 4 cores, the embedder utility process at
   about 100% CPU, the concurrent native arms and other sessions on the machine; native-codex
   ran until about 18:50), then 19:01–19:26 at 1.6 files/s. This accounts for the remaining
   about 1,770 s.
3. **Parse vs embed time: not measurable.** The logs give only one total
   (`Workspace indexing complete` with `durationMs`). There is no parse vs embed split, so this
   report cannot assign the contention time to parse or to embed.

### (b) A session blocked on a permission prompt keeps the code indexer deferred

A session that waits on a permission prompt stays `generating`. `TurnStateForegroundSource`
(`libs/backend/agent-sdk/src/lib/helpers/turn-state-foreground-source.ts:1-38`, registered at
`libs/backend/agent-sdk/src/lib/di/register.ts:884`) reports busy while any session is
`generating`. Only a record older than `STALE_GENERATING_CEILING_MS` = 60 min
(`turn-state-foreground-source.ts:38`) is ignored. So the indexer defers each batch up to the
10-minute ceiling for as long as the prompt is open, up to 60 min.

**Is it intended?** Not explicitly. The header docs speak of generating turns and of leaked
records. No code exempts an approval wait, and no comment says that an approval wait must
hold background work. The behavior is "not addressed by design". A session that waits for a
human uses no CPU, so this deferral gives no benefit to the foreground.

### (c) Harness notes

1. **Autopilot `ask` on a fresh instance.** A fresh settings store has
   `autopilot.permissionLevel: 'ask'`
   (`libs/backend/platform-core/src/file-settings-keys.ts:351`). Every MCP call of a test
   session waits for a UI answer that an unattended harness never gives. Fix used: RPC
   `config:autopilot-toggle {enabled: true, permissionLevel: 'yolo'}` on the isolated
   instance only, again after each restart.
2. **Workspace under ignored `.ptah/tmp` finds 0 files.** The first workspace sat under the
   worktree's git-ignored `.ptah/tmp/`. `git grep` (the `ptah_grep` engine when `rg` is absent)
   returned 0 matches with no error. Cause:
   `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts:529-546` —
   `isGitWorkTree` is true for a root inside a parent repository that ignores it, `git grep`
   then searches no files, and the Node walk fallback runs only when `git grep` reports an
   error. Fix used: make the workspace its own git repository. The 4 rows from the broken
   layout are kept apart in `stage2-r7-invalid-layout.jsonl` and are not in the tables.
3. **`rg` is not on the app PATH.** In the user's shells `rg` is a shell function, not a
   binary, so the Electron app does not find it and `ptah_grep` uses `git grep`.
4. **claude.ai login attaches connectors.** The isolated Claude CLI uses the user's claude.ai
   login, so claude.ai connectors and session context attach to the test sessions. Raw
   transcripts contain the account e-mail and are not committed.

### (d) Other observations

- **Code Mode discoverability.** `ptah.code.searchSymbols` exists
  (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/code-namespace.builder.ts:150-160`,
  wired in `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts:709`),
  but the `ptah.help()` overview does not list `code`
  (`libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/system-namespace.builders.ts:50-67`),
  and `HELP_DOCS` has no `code` topic. The
  `ptah` API has no grep or read-symbol call. This explains the Code Mode miss on
  `concept-clamp-read-tail`.
- **Index status after background runs.** `indexing:getStatus` reports `never-indexed` and
  `lastIndexedAt: null` with 50,365 symbols after succeeded background runs. The background
  run path never writes `last_indexed_at`
  (`libs/backend/memory-curator/src/lib/control/indexing-control.service.ts:683-689`), and the
  state derives from it. This matches the code comment, but the UI-facing state is misleading.
