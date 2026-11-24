# Implementation Plan Review - TASK_2026_2322_4ba4

## Review record

| Field | Value |
| --- | --- |
| Artifacts reviewed | r0: `implementation-plan.md` (455 lines), `parity-inventory.md` (125 lines). r1: `implementation-plan.md` (650 lines), `parity-inventory.md` (157 lines), each with a "Revision 1" changelog |
| Reviewed revision | r1 (Revision 1; the r0 findings are kept below for history) |
| Completed revise rounds | 1 |
| Author | software-architect subagent (Claude) |
| Reviewer | general-purpose subagent (Claude) |
| Execution sides | Author: Claude. Reviewer: Claude. Same side; no CLI lane available. This is weaker evidence than an opposite-side review |
| Code base | worktree `.claude-worktrees/agy-acp-only`, HEAD `32d76f406` (main) |
| Method | Targeted reads and `rg` over `apps/`, `libs/`, `scripts/`, docs, `.claude/`, configs (specs excluded). No builds, tests, nx or verify |
| Verdict | r0: REVISE. r1: **APPROVED** |

## Requirement trace

| Requirement (source) | Plan / inventory section | Status |
| --- | --- | --- |
| Remove agy stream-json completely (context.md "User Request"; decisions.md #1) | Plan §1 "Deleted", Files affected; inventory §1 rows 24-31 | Traced |
| Rely only on ACP for every agy lane (task.md) | Plan §1 `runSdk` steps; Integration data flow | Traced |
| Nothing the user relies on is lost silently (context.md; orchestrator brief) | Inventory §1-§4, Proposed Removals P1/P2 | **Gap**: stderr secret redaction (F1) and model-id cache coverage (F2) are not traced |
| P1/P2 recorded as covered (decisions.md #2) | Inventory "Proposed Removals"; plan D2 | Traced. The PR must report them |
| Other removals go to the user (context.md "Conversation Summary") | Inventory decision values | **Gap**: F1 is a removal that is not listed |
| Keep provider CLI lanes, `cli-engine`, `platform-cli` working (CLAUDE.md) | Plan verification points; inventory §4 rows 88-89 | Traced (spawner injection checked: `cli-detection.service.ts:124-125`) |
| Electron first (CLAUDE.md) | Live-test plan (Electron, Gemini 4 Hydrogen) | Traced |
| Coordinate shared files with TASK_2026_2320 (context.md "Related") | Inventory "Shared files"; plan A1 | Traced, with F7 |

## Independent completeness sweep (check 1)

`rg -i 'stream-json|PTAH_AGY_TRANSPORT|AgyTransport|agyHelpListsAcp|antigravity-result-diagnostics|ProviderSessionLaneFallback|agyModelWithEffort|antigravityArgv|streamJsonProbe'`
over the whole worktree (specs excluded) found only files that the plan already names, plus
these files that are not agy:

- `libs/shared/src/lib/types/execution/node.ts:270,283` (Claude JSONL)
- `copilot-sdk.adapter.ts:30,552,576`
- `opencode-cli.adapter.ts:1093`

`step_update` appears only in the adapter. The docs (`apps/ptah-docs`), `README`, `.claude/`,
scripts, e2e (`apps/ptah-electron-e2e`), `cli-engine`, `platform-cli`, the frontend libs and
settings have no stream-json agy reference.

The sweep found these items that the inventory does not list:

- Stderr secret and lane-token redaction. This is a security behaviour, see F1.
- Model-id cache tests that the plan deletes with the argv block, see F2.
- `AntigravityCliAdapter` is exported from the public barrel, see F3.
- Stale harness-sync comments that name the adapter as a second `mcp_config.json` writer, see F5.
- A stale comment at `http-mcp-server.service.ts:1211`, see F5.

## Contract spot-checks (check 2)

| Claim | Verified at | Result |
| --- | --- | --- |
| A failed resume starts a new session with an info notice | `acp-session-runtime.ts:1207-1229` | Correct |
| Lanes default to `'new-session'` (`acp-session-runtime.ts:1765`) | `:1765` holds the runtime default. The lane handle hard-codes it at `provider-session-lane-handle.ts:233` | Correct. `:233` is the stronger citation |
| lane-spawn-policy agy `--mode` argv | `lane-spawn-policy.ts:54-57, 156-162, 252-266`; only the adapter at `:1335` reads `policy.argv` for agy | Correct. No spec asserts the agy argv (`lane-spawn-policy.spec.ts` has no antigravity case) |
| Effort comment | `lane-spawn-policy.ts:486` "`agy --effort` accepts" | Correct |
| Only agy uses the lane-handle fallback | `grok-cli.adapter.ts:272-278` (no `fallback`). The `sdk-unavailable` and `review-1450` specs and `grok-cli.adapter.spec.ts` do not use `fallback` | Correct |
| Lane handle without a spawner fails at once | `provider-session-lane-handle.ts:125-140` | Correct |
| A missing sign-in never fell back | lane-handle `:370-380` (`auth-required` excluded); spec `:1745` asserts the hint text | Correct |
| The manager revokes and rethrows a `runSdk` rejection | `agent-process-manager.service.ts:1558-1570` | Correct |
| `onMcpConfigRestored` is agy-only in the manager | manager `:1524-1527` | Correct |
| `now` is still used by the model-id cache | adapter `:1030, 1035, 1049, 1053, 1064, 1072` | Correct |
| `fallBack` config at `runAcp` | adapter `:937-944` | Correct |
| The probe returns `false` without a spawner | adapter `runAcpProbe` (`if (!this.spawner && !this.acp.transportFactory) return false`) | Correct. The plan drops it. This is necessary, otherwise D2 would show "update agy" for a missing spawner |
| The sweep keeps lane-shaped URLs | `retired-ptah-mcp-slots.ts:31-35, 65-66, 102-110`; spec `:169`; concurrency spec `:578` | Correct |
| The lane URL grammar and the 43-character token | `lane-mcp-credentials.ts:112-115`; `ptah-mcp-url.ts:48-59`; the token is `randomBytes(32).base64url` (`mcp-caller-token-registry.ts:613`) | Correct |
| The adapter is "not exported from the lib barrel" | `cli-adapters/index.ts:25` → `cli-agents/index.ts:66` → `src/index.ts:1` | **Incorrect**, see F3 |
| harness-sync is still used elsewhere in cli-agent-runtime | e.g. `cli-adapter.utils.ts:28`, `capability-toggle-store.ts:46` | Correct. The project dependency stays |
| Profile and spec comment lines | `antigravity-acp-profile.ts:11,14,136`; spec `:52,:77` | Correct |

## Deleted-symbol callers (check 3)

These symbols have no callers outside the adapter, `antigravity-acp-lane.ts` and their specs,
across `libs/` and `apps/`, including ptah-electron, cli-engine, platform-cli and the renderer:

- `AGY_TRANSPORT_ENV`
- `readAgyTransportOverride`
- `AgyTransportOverride`
- `AGY_ACP_FAILURE_COOLDOWN_MS`
- `agyHelpListsAcp`
- `agyModelWithEffort`
- `redactAgyText`, `safeAgyText`, `formatAgyFailure`, `formatAgyDiagnostics`
- `ProviderSessionLaneFallback`
- `antigravityArgv`

The constructor (D8) has these callers:

- `cli-detection.service.ts:189`
- the acp, sign-in, live, mcp and adapter specs
- `limit-reader-manifest.spec.ts:12` (no arguments)

The mocks at `cli-detection.service.spec.ts:53` and `codex-native-selection.spec.ts:32` replace
the class and are not affected. `createMcpFacet` and `withMcpConfigLock` keep other users
(`retired-ptah-mcp-slots.ts:55`, `ptah-mcp-slots.ts:104`, `json-mcp-facet.ts:218`), so no
harness-sync export becomes dead.

## Batches and testability (check 4)

- The groups are file-disjoint:
  - A: adapter, acp-lane, detection, policy and specs.
  - B: lane handle and spec.
  - C: vscode-lm-tools.
  - D: acp-runtime.
- The A-before-or-with-B ordering is stated.
- Only component 2 names a verify command. The other components name spec files only. See F6.
- The failure behaviours have named tests and can be tested:
  - old resume id: "an unknown resume id starts a new session with one info";
  - agy < 1.5.1: the D2 rejection with no transport spawn;
  - ACP open failure: initialize error → `done` 1 with one error segment.

## Shared files with TASK_2026_2320 (check 5)

The `feat/lane-chat-parity` worktree has no code changes yet (the diff against main contains
spec files only). The list of nine files is complete for the files this task edits.
TASK_2026_2320 also plans to change these files, which this task does not edit:

- `cli-adapter.interface.ts`
- `agent-process-manager.service.ts`
- `grok-cli.adapter.ts`
- `acp-session-runtime.ts`

This task relies on the behaviour of the last two (the resume fallback, and Grok's lane-handle
path), and the list does not name them. In addition, TASK_2026_2320 `task-description.md:68`
and `:87` contain rows for the agy stream-json transport that become obsolete. See F7.

## Parity deltas not covered (r0)

1. Secret and lane-token redaction of agy stderr. stream-json: `antigravity-cli.adapter.ts:1690-1695`
   (`redactAgyText(...)` and `replaceAll(options.mcpToken, '[REDACTED]')`), test
   `antigravity-cli.adapter.spec.ts:1570`. ACP: `provider-session-lane-handle.ts:185-186` emits
   the raw `event.line`.
2. Model-id cache behaviour. It is shared by both transports, but its tests sit only in the
   stream-json argv block (`antigravity-cli.adapter.spec.ts:556-740`).

## Proposed-constraint decisions

| Constraint | Decision |
| --- | --- |
| D1 Ignore `PTAH_AGY_TRANSPORT` silently | Accept. Env only, no settings or UI reference (sweep confirmed) |
| D2 Below-floor spawn error; detection still reports installed | Accept (P1, decisions.md #2) |
| D3 Drop the `--help` probe entirely | Accept. A binary at or above 1.5.1 without `acp` now fails at the handshake (covered by P2) |
| D4 Delete the lane-handle fallback machinery | Accept (Grok passes none) |
| D5 Sweep the lane-shaped `ptah` entries | Accept with F4 |
| D6 Keep `SdkHandle.mcpConfigWriteFailed` generic | Accept |
| D7 Delete `agyModelWithEffort` | Accept. It has no spec of its own (F8) |
| D8 New constructor signature | Accept. It is a public symbol (F3), but no external constructor exists |
| "No public API break outside cli-agent-runtime" (plan evidence row 48) | Reject the evidence, keep the conclusion (F3) |

## Findings (r0)

1. **F1 (major, security, silent removal).** stream-json redacts bearer tokens, api keys and the
   lane's own `mcpToken` from every agy stderr line before it reaches lane output and segments
   (`antigravity-cli.adapter.ts:1690-1695`; test `antigravity-cli.adapter.spec.ts:1570`). The ACP
   lane handle emits raw stderr (`provider-session-lane-handle.ts:185-186`). The ACP lane sends
   the token inside the `session/new` MCP URL, so a debug line from agy can now show it in the
   lane card. Inventory row 48 marks the diagnostics "remove-approved" as format-specific, which
   hides this. Add it as `keep-via-ACP`, for example by moving `redactAgyText` and the token
   scrub into the lane-handle stderr path (or a profile hook), with a ported spec. Do not delete
   it with `antigravity-result-diagnostics.ts`. The other option is to list it as Proposed
   Removal P3 for the user.
2. **F2 (major, test parity).** Plan §2 deletes `antigravity-cli.adapter.spec.ts:473-884` as
   "argument construction". Lines 556-740 test the model-id cache that `runAcp` still uses
   (`currentModelIds`): no re-probe after a failure (`:597`), per-binary scope (`:611`), an empty
   refresh drops the ids (`:637`), the 10-minute freshness window and the shared in-flight probe
   (`:716`, `:726`), no probe without a model (`:740`), and effort through the closest base
   (`:584`, `:660`, `:690`). Only acp spec `:516` and `:533` remain. Port these cases to the ACP
   spec, asserting on the ACP model config instead of the argv.
3. **F3 (minor, wrong evidence).** Plan evidence row 48 says the adapter "is not exported from
   the lib barrel". It is exported: `cli-adapters/index.ts:25` → `cli-agents/index.ts:66` →
   `src/index.ts:1`. No consumer outside the lib constructs it (sweep), so D8 is still safe.
   Correct the row and keep the D8 constructor change scoped to the public symbol.
4. **F4 (minor, D5 risk).** The widened sweep also removes the entry of a stream-json lane that
   an older Ptah build is still running at the same moment. The removed header text
   (`retired-ptah-mcp-slots.ts:31-33`) existed to protect exactly that case. State the accepted
   risk in D5 (one Ptah build per machine, upgrade window) or log the URL shape that was
   removed.
5. **F5 (minor, stale docs that the inventory missed).** harness-sync describes
   `AntigravityCliAdapter` as a live second writer of `mcp_config.json`. Add these to inventory
   row 91 and plan §4/§5 (and add `@ptah-extension/harness-sync` lint to the gate), or record
   that they are left as they are:
   - `mcp-facet.port.ts:69-73`
   - `mcp-config-lock.ts:13-16`
   - `file-lock.ts:4-7, 286-287`
   - `rival-targets.ts:50-56`
   - the "what AntigravityCliAdapter does before a spawn" helper in
     `harness-reconciler.antigravity-mcp.spec.ts:136-150`

   The same applies to `http-mcp-server.service.ts:1211` and `antigravity-cli.adapter.ts:506`
   (`supportsMcp` "configured via mcp_config.json").
6. **F6 (minor, handoff).** Only component 2 names a verify command. For each group, give a scoped
   `npm run verify -- --related -p <project>` and the specs it must run:
   - Group B (cli-agent-runtime): the lane-handle spec plus `grok-cli.adapter.spec.ts`,
     `provider-session-lane-handle.sdk-unavailable.spec.ts` and `...review-1450.spec.ts`.
   - Group C (vscode-lm-tools): the two sweep specs.
   - Group D (acp-runtime): the profile spec.

   Add `--related` for the projects whose comments change.
7. **F7 (minor, coordination).** Extend the shared-file section with three items:
   - the TASK_2026_2320 files whose behaviour this task relies on but does not edit
     (`acp-session-runtime.ts` resume fallback, `cli-adapter.interface.ts` `SdkHandle`,
     `grok-cli.adapter.ts`);
   - a note that TASK_2026_2320 `task-description.md:68,87` must drop its agy stream-json rows
     after this task merges;
   - A1's rebase rule for those files.
8. **F8 (nit).** Plan §2 says to delete "the `agyModelWithEffort` tests". There are none.
   `antigravity-cli.adapter.spec.ts:188` imports only `AntigravityCliAdapter` and `agyModelId`.
   It is only covered through the argv cases at `:759-806`. Reword the item.
9. **F9 (nit).** In the lane-handle spec describe `:1680-1872`, the plan keeps only `:1861` and
   the hint from `:1745`. Also keep, as plain setup-failure cases, the assertions that do not
   depend on a fallback, or point to existing coverage for them:
   - a failed setup closes the ACP child (`:1841`, `h.agent.closed`);
   - a refused model after the session opens fails the lane (`:1760`).
10. **F10 (nit).** Cite `provider-session-lane-handle.ts:233` (lanes hard-code `'new-session'`)
    beside `acp-session-runtime.ts:1765` in inventory row 36 and the plan evidence row 40.

## Round 1 recheck (r1)

Inputs: decisions.md row 4 (the orchestrator keeps the F1 redaction and ports it to the ACP
path) and the Revision 1 changelogs. Same rules as before: targeted reads only, no builds and
no tests.

### r0 findings

| r0 | Status | Evidence in r1 |
| --- | --- | --- |
| F1 | Resolved | Plan component 6, D9 and the security requirement (plan lines ~390-440, 118, 483); inventory row 61 is `move`. Verified: the lane-handle `diagnostic` branch emits raw `event.line` at `provider-session-lane-handle.ts:183-186`. `lane-mcp-attachments.ts:19-28` sends `Authorization: Bearer ${mcpToken}`. `options.mcpToken` exists (`cli-adapter.interface.ts:157-158`). A3 holds: `logMcpRequest` logs only the name and transport (`acp-session-runtime.ts:338-350`), and no acp-runtime error string formats `mcpServers` or `headers`. The empty-token guard is specified. See R1 and R2 |
| F2 | Resolved | Plan §2 ports `:556, :584, :660, :597, :611, :637, :716, :726, :740` to the ACP spec and asserts the ACP `model`, not the argv |
| F3 | Resolved | Plan evidence row 62; inventory row 98 |
| F4 | Resolved | D5 states the accepted risk. §4 adds the removed shape to the log line |
| F5 | Resolved | Component 5b with harness-sync files and lines (the same as the r0 citations). Group E check and gate include `@ptah-extension/harness-sync`. `http-mcp-server.service.ts:1211` and adapter `:506` are added. The spec helper stays; only its comment changes, which is correct because it still proves the lock behaviour |
| F6 | Resolved | Groups A-E each name a `--related` command, the specs that must run, and a separate lint and typecheck command |
| F7 | Resolved | Inventory "TASK_2026_2320 files this task relies on but does not edit" and "Obsolete rows"; plan A1 |
| F8 | Resolved | Plan §2 rewords the item (no own spec; covered through the argv cases) |
| F9 | Resolved | Plan §3 keeps `:1861`, the `:1745` hint, `:1841` `h.agent.closed` and `:1760` in a "setup failure" describe |
| F10 | Resolved | Plan evidence row 53; inventory row 47 |

### Component 5b (harness-sync, comments only)

- The file and line list matches the r0 sweep: `mcp-facet.port.ts:69-73`,
  `mcp-config-lock.ts:13-16`, `file-lock.ts:4-7, 286-287`, `rival-targets.ts:50-56`,
  `antigravity-mcp-facet.spec.ts:5`, `harness-reconciler.antigravity-mcp.spec.ts:136`.
- No logic change. `withMcpConfigLock` and `createMcpFacet` keep their production users
  (`json-mcp-facet.ts:218`, `codex-toml-mcp-facet.ts:203`, `retired-ptah-mcp-slots.ts:55`,
  `ptah-mcp-slots.ts:104`), so the "lock still protects concurrent writers" wording is
  accurate.
- The group can run in parallel. It has its own project check.

### Changed `removeRetiredPtahEntry` return shape: all callers

`rg removeRetiredPtahEntry` over `libs/` and `apps/` finds these:

- Production: one caller, `sweepRetiredPtahMcpEntries` at `retired-ptah-mcp-slots.ts:188`
  (`if (await removeRetiredPtahEntry(configPath))`). A `'lane' | 'persistent' | false` value
  keeps that truthiness check valid. The log line must read the value.
- Internal returns that must change to the new union: the early `false` returns, including
  `:149`, and the `return true` at `:152`.
- Spec: `retired-ptah-mcp-slots.spec.ts:136, 153` (`toBe(true)` → the shape) and
  `:164, 181, 182` (`toBe(false)`, unchanged). `:193` (`rejects`) is unchanged. `:175` is
  the lane case and flips to `'lane'` (plan §4).
- Not affected: `http-mcp-server.service.ts:72, 851` import only `sweepRetiredPtahMcpEntries`,
  which still returns `Promise<void>`. The concurrency spec asserts file contents, not the
  return value. No caller outside vscode-lm-tools exists, and the lib's `index.ts` does not
  export it (the sweep found no external import).
- `isPtahPersistentEntry` (exported, spec `:101`, `:118`) stays valid when the lane shape uses
  a sibling predicate, as the plan allows.

### Remaining findings (non-blocking)

1. **R1 (minor, test source).** Plan §6, Files, and inventory row 61 say to "take" or "move"
   the `redactAgyText` cases from `antigravity-result-diagnostics.spec.ts`. That spec has only
   one `formatAgyDiagnostics` case (lines 3-26), with an indirect Bearer assertion. There are no
   `redactAgyText` cases to move. The new `lane-stderr-redaction.spec.ts` must write one case
   per rule:
   - a quoted secret key (`"api_key":"x"`);
   - `Bearer x`;
   - `token=x` or `password: x`;

   plus the three new cases the plan lists. Impact: if this is read literally, the regex rules
   are left with no tests.
2. **R2 (minor, Grok behaviour change).** D9 applies the agy rules to Grok stderr as well.
   Evidence row 50 still says "Grok's behaviour does not change". `INLINE_SECRET`
   (`antigravity-result-diagnostics.ts:5`) replaces everything after `authorization|token|session|…`
   followed by `:` or `=`, up to the end of the line. `classifyCliStderr` then sees only the
   redacted line (plan §6). Add one lane-handle or redaction spec case that shows these
   classifier wordings survive the redaction:
   - `HTTP 401 Unauthorized`;
   - `RESOURCE_EXHAUSTED`;
   - `429 Too Many Requests`.

   Also reword row 50 to name the redaction change. Impact: limited to over-redacted
   diagnostic text. This is not a security issue.
3. **R3 (nit, consistency).** The plan's "Observability" bullet (line ~468) still says the
   existing `Removed retired ptah entry from <path>` info "covers D5". §4 and D5 now add the
   removed shape to that line. Align the bullet. Live-test step 9 could also expect `(lane)`
   in the log.

## Unresolved items

- None block the gate. The team-leader carries R1 and R2 into the Group B brief, and R3 into
  the Group C brief. They can also be fixed in the plan text.
- decisions.md row 4 records F1 as a keep, not a removal. P1 and P2 stay covered by row 2 and
  must be reported in the PR.

## Verdict

**APPROVED (r1).** F1-F10 are all resolved in the revised text, and the cited code supports
each of them. The redaction port is feasible as specified. The new harness-sync group contains
only comments and has its own check. The `removeRetiredPtahEntry` return change has one
production caller and six spec assertions, all within the plan's Group C. R1-R3 are
non-blocking corrections for the handoff.

This review is still same-side (a Claude author and a Claude reviewer, with no CLI lane), so
the evidence is weaker than an opposite-side review.
