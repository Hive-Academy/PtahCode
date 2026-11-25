# Implementation Plan Review - TASK_2026_2320_lnpar

## Review record

| Field | Value |
| --- | --- |
| Artifact | `implementation-plan.md`: round 0 read at 68,920 bytes; revision 1 read at 986 lines (2026-11-23) |
| Reviewed revision | revision 3 (a scoped recheck after the cap, under decisions.md 15, option (a)). The round 2, 1 and 0 sections below are kept as history |
| Completed revise rounds | 3 (the third is the scoped post-cap recheck) |
| Author | software-architect subagent (Claude) |
| Reviewer | general-purpose subagent (Claude) |
| Execution sides | same side (Claude / Claude). No CLI lane was available (decisions.md 2, 4), so this is weaker evidence than an opposite-side review |
| Method | targeted source reads and greps only. No builds, tests, nx or verify runs. The artifact was not edited |
| Verdict | **REVISE** (revision 3: two bounded findings, R3-1 and R3-2; each needs one plan addition) |

## Revision 3 scoped recheck

Scope: the R2-1 raw-delivery rule, the blocked check on the raw text, receipt and ack handling
without the header, R2-2, R2-3, and the B2 restored-record change. Nothing else was re-reviewed.

Plan text read:
- the changelog (`implementation-plan.md:3-12`);
- B2 (`:264-270`);
- B3 "Raw command delivery" (`:333-363`), "Blocked check" (`:364-370`) and the router (`:371-377`);
- the specs (`:408-436`), A14 (`:951-954`), L8 (`:1116`) and L12 (`:1120`).

Source read:
- `messaging/agent-message-dispatcher.ts:61-155`;
- `messaging/agent-message-reconciler.ts:65-71,174-184`;
- `messaging/agent-message-delivery-text.ts:40-48`;
- a `git grep` for `[Ptah message` across `libs` and `apps`.

| Item | Result |
| --- | --- |
| Raw-delivery rule | **resolved** (`:333-353`). Raw delivery needs all of: the sender is `user`; the first token starts with `/` and matches the lane's advertised list (case-insensitive, exact); and the blocked check passes. The body is `trimStart()`ed and sent with no header and no ack line. Parent and lane senders always keep the header, so an agent cannot send provider commands into another lane. That is a sound safety rule |
| Where the advertised list comes from | **resolved**. Three sources: `turnOptions(laneId)`, bounded at 5 s; a per-lineage in-memory cache for stopped lanes; and, when no list is known (a restart, or a lane that was never live), the manifest's `commands`/`skills` support. In the last case the blocked check still runs first. Accepted: the user typed the command, and the manifest plus the blocked list bound what goes through |
| `delivery: { raw: true }` on the envelope | **resolved** (`:352-353`). It is a strict, optional field, so retries and scheduler re-offers use the same decision. A schema spec checks that older records still parse (`:434-435`), and a dispatcher spec checks the retry (`:430`) |
| Blocked check on the same raw text | **resolved** (`:364-370`). It runs at the coordinator (`request.message`), at the dispatcher before the live/cold choice (`attempt.body`), in the resume guard, and in the manager (`rawBody`). Each is covered by a spec (`:416-433`) |
| Receipts without the header: `:111-117`, `:128`, `:146-150` | **verified**. Cold start: the `started` transition is keyed by `dispatching.id`, with `turnSeq` and `cliSessionId` (`:112-117`). Live: `sendToAgent(laneId, text, …, envelope.id, …)` (`:128-129`), and the `started` transition is keyed by `envelope.id` (`:146-150`). Neither path reads the header text |
| `tool-description.builder.ts:1199` | **verified**. It is the MCP tool description only ("Acknowledge a message you received as \"[Ptah message <id> from ...]\""), and it parses nothing |
| Other parsers of the header | **none**. `git grep` finds the formatter (`agent-message-delivery-text.ts:4,46`), its spec, and coordinator specs that assert the header for parent and lane senders (`coordinator.service.spec.ts:68,91`; `coordinator.lane-messaging.spec.ts:43`). Those senders keep the header, so the specs still hold. There is no renderer or app parser. The two `apps/ptah-docs` hits are unrelated prose |
| Ack state | **partial**. The dispatcher's two `started` transitions are covered (`:359-361`). The reconciler start path is not (R3-1) |
| R2-2: `rawBody` through `PendingAgentMessage`, `continueConversation`, flush and interrupt-resume | **resolved** (`:371-377`). Router call sites `:289` (interrupt-resume) and `:453` (flush) pass `rawBody`, and the manager checks `rawBody ?? message`. A router spec and a manager spec are named (`:431-433`). There is no backend coalescing of queued messages: the router contains no `join`/`coalesce`, so a raw command is never merged into another message |
| R2-3 | **resolved** (`:56-61`). Skills: `general-video`, `hyperframes`; plain commands: `compact`, `context` |
| B2 restored-record change | **accepted** (`:266-269`). A restored record now carries the manifest's `commands`/`skills`, because the resumed process receives the raw command as its prompt. This is needed for the manifest fallback, and it is consistent with the static `blocked` list |
| Live checks | L8 sends `/compact` to agy both while idle and after Stop, and checks "Delivered as a command". L12 sends a Grok command and a skill, and checks `/always-approve on` on a running and on a stopped lane. A14 covers Claude and ptah-cli with a runner spec, plus `/compact` live |

### Revision 3 findings

R3-1. **Medium. A raw command queued behind a running turn gets a pending ack that never arrives.**
   The plan sets `ackState: 'unavailable'` only at the dispatcher's own `started` transitions
   (`:359-361`).
   - The queued path: a user `/compact` sent while the lane runs is parked (`queue-next-turn`).
   - Where it starts: the reconciler moves it to `started` at the next turn, in
     `onTurnStarted` (`agent-message-reconciler.ts:174-183`).
   - What goes wrong: that call uses `ackStateAtStart(envelope.ackState, laneMcpCapability(info))`,
     which gives `pending` on any MCP-capable lane. The raw command carries no ack line, so the
     receipt waits for an ack that never comes.

   Fix:
   - In `onTurnStarted`, use `envelope.delivery?.raw ? 'unavailable' : ackStateAtStart(…)`.
   - Add `messaging/agent-message-reconciler.ts` (+ spec) to the B3 file list.
   - Add a spec in which a parked raw envelope starts with `ackState: 'unavailable'` and the
     receipt reads "Delivered as a command".

R3-2. **Minor. A raw command on a steer route.**
   - The gap: the raw rule does not depend on the route. On a steer route, a raw `/name` would be
     folded into the running turn as plain text, not run as a command.
   - Where this is reachable after B6: Claude "Send now" while a tool is in flight.
   - Where this is reachable today: Codex steer. Codex commands are unsupported, but the manifest
     fallback is not involved there, so it is only theoretical.

   Fix:
   - Specify that a raw envelope never takes the steer route. The planner uses interrupt-resume when
     the user confirms, and otherwise queues.
   - Add one planner or dispatcher spec for it.

### Revision 3 verdict

**REVISE**, bounded. Every item in scope is resolved except the ack state on the reconciler start
path (R3-1) and the steer-route rule (R3-2). Each needs one plan addition and one named spec, and
the change stays inside B3. The orchestrator can either apply both as plan edits, or record them as
binding handoff notes for the team-leader. With either, nothing in scope remains open.

---

# Round 2 recheck (history)

## Round 2 recheck (revision 2)

Inputs:
- the Revision 2 changelog (`implementation-plan.md:3-11`);
- B1 `:216-218`, B2 `:262-279`, B3 `:300-385`, B8 `:531-533`;
- the shared-file table `:930-945`;
- source: `messaging/agent-message-dispatcher.ts:61-104`,
  `messaging/agent-message-delivery-text.ts:40-48`, `agent-rpc.handlers.ts:1601-1613`,
  `agent-message-router.service.ts:210,225,289,375,453`, `lane-budget-telemetry.ts:41-55`,
  `vscode-lm-tools/.../agent-namespace.builder.ts:821-822`.

### R1-1 recheck: hidden commands on every route

- **Static source: resolved.**
  - `commands.blocked` is declared on the manifest and on the effective statement (B1 `:216-218`).
  - The Grok manifest fills it from `grokAcpProfile.hiddenLaneCommands` (B8 `:532-533`).
  - The resolver carries it for live and restored records, and for a record with no manifest it
    blocks nothing (B2 `:262-266`).
  - A spec covers a restored Grok record (`:298-299`).
- **Matching rule: resolved.** The rules are at `:268-276`:
  - leading whitespace is removed with `trimStart`, newlines included;
  - only the first token counts, and it must start with `/`;
  - the name must match exactly, case-insensitively, without the `/`.

  The negative cases `please /always-approve` and `/always-approved` are named (`:296`).
- **Dispatcher claim: verified.** `attempt.body` is the raw body. Line 71 builds
  `text = formatAgentMessageDeliveryText(envelope.id, envelope.sender, attempt.body, …)`. Line 99
  calls `this.deps.resume.resume(attempt.info, text)` with the formatted text. Passing
  `attempt.body` as `guard.rawBody` (B3 `:331-338`) is therefore correct and feasible. A dispatcher
  spec asserts it (`:366`).
- **Every route that delivers user or agent text to a lane goes through `AgentMessageCoordinator.send`:**
  - `agent:sendMessage` (`agent-message-rpc.handlers.ts:93`);
  - `agent:continue` (`agent-rpc.handlers.ts:1611-1613`, `delivery: 'queue'`);
  - the MCP agent namespace for lane-to-lane and parent messages (`agent-namespace.builder.ts:821-822`).

  The coordinator check (B3 `:309-312`) applies to every sender and to both the live and the cold
  plan. The router's `steer`/`continueConversation` calls (`:210,225,289,375,453`) are reached only
  from the dispatcher. `deliverLaneBudgetWarning` (`lane-budget-telemetry.ts:41-55`) steers
  host-built warning text only. No route bypasses the coordinator.
  - Not covered, and not required: the spawn prompt itself (`ptah_agent_spawn` task text). The
    parent chooses the lane's policy at spawn (`task-description.md:140-142`), so this is no gap.
    It is recorded only for completeness.
- **Specs: resolved.**
  - Coordinator: a live Grok lane, and a restored Grok record with the resume service left uncalled
    (`:355-359`).
  - Resume service: `'  /always-approve on'` throws `LaneResumeError('blocked-command')`, nothing
    spawns, and a normal body still spawns (`:361-365`).
  - Dispatcher: the raw body is passed (`:366`).
  - `lane-resumer.port.ts` is in the file list for the new error code (`:380-381`).

### R1-2 and R1-3 recheck

- **R1-2: resolved.** The table now gives "none" for `cli-adapter.interface.ts`,
  `usage-scope-adapters.spec.ts`, `acp-session-runtime.ts` and `acp-vendor-profile.ts`, citing
  2322 `:585-589`. The plan explains why B2 and B4 stay gated on purpose and lets the team-leader
  un-gate them (`:930-945`).
- **R1-3: count resolved, example misplaced.** 55 / 40 / 19 bundled / 21 user / 15 plain is now
  correct (`:45-50`). However, the example "for example `general-video`, `hyperframes`, with
  `_meta.qualifiedName` `user:<name>`" is attached to the 15 plain commands. Those names are
  user-scope skills. This is nit R2-3 and changes no design.

### Round 2 findings

R2-1. **Blocking; new feasibility gap that round 0 missed. A `/` command typed in a lane composer
   never reaches the provider as a command.**
   - The cause: every coordinator delivery is rewritten to
     `[Ptah message <id> from <sender>]\n\n<body>`, with an optional ack line, before it reaches the
     lane (`agent-message-delivery-text.ts:46`; dispatcher `:71`). This happens on both the live
     path (`this.live(…, text)`) and the cold path (`resume(…, text)`).
   - The effect: the first token the Claude SDK, Grok or agy receives is `[Ptah`, not `/compact` or
     `/<skill>`, so the provider treats the command as plain text.
   - Why it matters: D10 and B5/B8 mark commands and skills "supported" for Claude, ptah-cli, Grok
     and agy (Req 1.4, 4.1). Under that header the claim is not true end to end, and the contract
     test helper (Req 4.3) would not catch it. L8 and L12 check only that the list shows.
   - Second consequence: the header also makes `/always-approve` inert today. The R1-1 guard only
     becomes load-bearing once commands are delivered raw.

   The plan has to say how a command message is delivered. Options:
   - (a) **Recommended.** When the trimmed body's first token is a `/name` from the lane's advertised
     command or skill list, deliver the body raw: no header, and no ack line, since the provider
     consumes a command. Keep the header for every other message. Apply `blockedLaneCommand` to the
     same raw text, on the live, cold and retry paths. Add a dispatcher spec ("an advertised
     `/compact` is delivered raw; ordinary text keeps the header") and a live check in L8 and L12
     that the command runs.
   - (b) Keep the header, mark commands and skills "insert-only (sent as text)" with that reason,
     and drop the "supported" claims. That narrows Req 1.4 and needs a recorded decision.

   This is a scope choice on Req 1.4, so it goes to the orchestrator or user gate.

R2-2. **Minor, tied to R2-1. The manager pre-flight cannot match a blocked command.**
   `continueConversation` receives the formatted text, whose first token is `[Ptah`. Its
   blocked-command check (B3 `:322-324`) therefore never matches as specified. Either pass the raw
   body (or a `deliveredRaw` flag) through `PendingAgentMessage` and `continueConversation`, or drop
   that claim and rely on the coordinator check plus the resume guard. Under R2-1 (a), the raw body
   must be what the pre-flight checks.

R2-3. **Nit (follows R1-3).** Move the `general-video`/`hyperframes` example from the plain
   commands to the 40 skills. Use `compact`/`context` as plain-command examples.

### Round 2 verdict

**REVISE**, escalated. R1-1, R1-2 and R1-3 are resolved; R1-3 keeps only the wording nit R2-3.

R2-1 is a real feasibility gap that round 0 missed. It decides whether Req 1.4 ships as
"supported" or "insert-only". That is a scope decision, so the orchestrator's gate has to choose
(a) or (b).

If (a) is chosen, the R2-1 and R2-2 fixes are confined to B3 (dispatcher, coordinator,
`PendingAgentMessage`), the specs and L8/L12. Nothing else in the plan is open.

---

# Round 1 recheck (history)

## Round 1 recheck (revision 1)

Inputs: the Revision 1 changelog (`implementation-plan.md:3-12`), decisions.md rows 13-14 (binding),
and the TASK_2026_2322_4ba4 plan and batches
(`.claude-worktrees/agy-acp-only/.ptah/specs/TASK_2026_2322_4ba4/`), read to check the gating claims.

### Disposition of round 0 findings

| # | Round 0 finding | Revision 1 text | Result |
| --- | --- | --- | --- |
| 1 | Removals contradict decisions 13 | D19 (`:166`); "Proposed Removals: None" (`:849-859`); handoff DELETE line limited to the moved LC (`:950-952`); inputs cite rows 1-14 (`:21-23`) | **resolved** |
| 2 | 2322 gating | Rule `:871-873`. B2 `:254`, B3 `:324`, B4 `:366`, B5 `:425`, B7 `:465`, B8 `:525`, B9 `:549` and B10 `:583` wait. Pre-rebase set `:914` = B1, B11, F1-F7. Post-rebase checks `:885-893` include the agy entry point and `redactLaneStderr` | **resolved**. Checks: (a) the pre-rebase set edits no file in 2322's write sets; 2322 edits the lane handle (+spec), `antigravity-acp-lane.ts` (manifest byte-identical), the agy profile, `cli-detection.service.ts`, `lane-spawn-policy.ts`, `cli-agent-runtime/src/index.ts`, `cli-engine/container.ts`, vscode-lm-tools and harness-sync, and none of those is in B1, B11 or F1-F7; (b) the pre-rebase F groups depend only on B1 types, which 2322 does not touch; (c) every waiting component either edits a table file or depends on B2. Nit R1-2 below |
| 3 | `recoverQueuedText` caller | D21 (`:168`); F4 keeps `recoverQueuedText: Promise<string>`, adds `recoverQueuedMessage`, and leaves `agent-follow-up-queue.service.ts:212` untouched (`:677-680`); spec seam `:690-691`. Backend `getBody` also kept, with a new `getMessage` (`:300-301`) | **resolved** |
| 4 | `UsageScope` cycle | D20 (`:167`); B1 `:198-200,217-218,230`; E52 cites `platform-core/src/index.ts:469` | **resolved** |
| 5 | Interrupt timeout lifecycle | B5 `:377-390`: flag per turn, cleared on that turn's result frame and on `finish()`; only `error_during_execution` maps to 0; a late interrupt gets an info segment; spec cases `:408-414` | **resolved** |
| 6 | ACP skills | D10 (`:162`); B8 `:476-483` groups `_meta.path` `SKILL.md` entries as skills; correction recorded (`:35-39`); spec `:513-515` | **resolved** (nit R1-3 on the count) |
| 7 | Widened decision reaches the Copilot bridge; no schema | D22 (`:169`); `AgentPermissionDecision` unchanged (`:202`); new `LanePermissionResponse` (`:203-204`); strict zod schema with bounded `modifiedInput` and no prototype keys (`:558-565`); `toBridgeDecision()` maps `always_allow` → `allow`, `deny_with_message` → `deny`, and drops `modifiedInput`; the bridge file is unchanged (`:566-569`); specs `:577-581` | **resolved**. Today the RPC handler passes `params` to `bridge.resolvePermission` (`agent-rpc.handlers.ts:1408-1414`), so the mapping belongs at that call site, and the bridge file needs no change. Renderer callers send `allow`/`deny`, a subset of the new type |
| 8 | Unlisted specs | `agent-messaging.schemas.spec.ts` (B1 `:222,229`); `ptah-cli-registry-permission-routing.spec.ts` (B5 `:415,424`) | **resolved** |
| 9 | Usage field semantics | B4 `:341-351` (snapshot fields pass through; `costUsd` only on the correction; `settleTurn` clears `cumulative`); spec `:359-363` | **resolved** |
| 10 | Untested failure cases | B3 dispatcher and scheduler specs for `attachments-unavailable` (`:320-322`); F5 Checking and image-held specs (`:728-732`); `lane-delivery.controller.spec.ts` restore on refusal (`:733-735`); live L11 (`:985`) | **resolved** |
| 11 | ACP usage correction | Inputs → Corrections (`:27-34`); `_meta.usage` live path listed as a future enhancement (`:862`) | **resolved** |
| 12 | Citations, Checking state, Req 5.7 | E1 `:256,262`, E2 `:268-280`, E3 `:143,152,166`; F4 state machine `:681-684`; Req 5.7 traced `:580,754,764` | **resolved** |
| 13 | Permission-policy commands | D18 (`:165`); `filterLaneCommands`/`blockedLaneCommand` (B2 `:250-253,268-269`); coordinator refusal (B3 `:279-281`); manager pre-flight (B3 `:291-293`); Grok profile `hiddenLaneCommands: ['always-approve']` (B8 `:486-488`); specs `:315-316,514,517`; live L12 | **partly resolved**: see R1-1 |

### Spot checks for this round

- In `grok-plain-turn.ndjson`, the last `available_commands_update` has 55 entries. 40 of them are
  skills with `_meta.path` ending in `SKILL.md` (19 `bundled`, 21 `user`). `always-approve` is one
  of the 15 plain commands. No other plain command (`compact`, `context`, `session-info`,
  `feedback`, `deep-research`, `workflow`, `goal`, `loop`, `ptah-orchestrate*`, `ptah-review-*`,
  `learn-traces`) changes permissions. D18's single entry is supported.
- `AcpVendorProfile` exists (`acp-runtime/src/lib/acp-vendor-profile.ts:183`) and has no
  `hiddenLaneCommands` yet, so B8's addition is new. 2322 does not edit this file.
- Group table G1-G11 (`:917-929`): G1-G5 are pre-rebase and G6-G11 wait. G2 is split: B11 runs
  before the rebase and B10 after it, because B10 depends on B3. The plan offers to move B11 into G1
  to keep each group single-phase, which is consistent. The groups are file-disjoint, apart from
  the sequential pairs the plan names (B3 → B4 on the manager; B5 → B6). Each group has scoped
  projects (`:930-938`) and named specs in its components.
- The live test plan now has L11 (refusal) and L12 (Grok `/` list and the `always-approve` refusal),
  as well as L1-L10, with agy on Gemini 4 Hydrogen.

### Round 1 findings

R1-1. **Medium; blocks approval. Hidden commands are not enforced on the cold-resume route.**
   - Where the list comes from: `turnInput.commands.blocked` is copied only from the live handle's
     `turnInputSupport()` (B2 `:250`; B8 `:480-481`).
   - What a restored record gets: B2 resolves it to "all turn input unsupported except what a cold
     resume can carry" (`:244-245`), and gives no `blocked` list.
   - Where the checks run: the coordinator check (B3 `:279-281`) reads that statement. The manager
     pre-flight (`:291-293`) runs only in `continueConversation`.
   - Why that leaves a gap: a stopped or restored Grok lane takes the resume route
     (`usesResume` → `AgentLaneResumeService.resume`, `:298-299`), which bypasses
     `continueConversation`.
   - Consequence: "/always-approve on" sent to a stopped Grok lane passes both checks. It becomes
     the prompt of the resumed session and changes the lane's approval mode, which is out of scope
     (`task-description.md:140-142`).

   Fix:
   - Source the hidden list statically, for example a manifest field
     `turnInput.commands.blocked`, or the profile looked up by CLI, so that the resolver fills it
     for restored records too.
   - Have the resume path apply `blockedLaneCommand` before it spawns.
   - Add a coordinator spec for a restored Grok record.
   - Also state that matching trims leading whitespace. Today the plan says only "first token".

R1-2. **Nit: the shared-file table overstates 2322's edits.** For `cli-adapter.interface.ts`,
   `acp-session-runtime.ts` and `usage-scope-adapters.spec.ts` the table says "possible" (`:877-881`).
   2322's plan lists the first two as "Relied on, not edited" (2322 `implementation-plan.md:585-589`).
   None of the three is in any 2322 write set. Gating them is safe, only conservative. Optionally
   correct the "Expected 2322 change" column, so the team-leader knows that B2 and B4 could start
   before the rebase if 2322 slips.

R1-3. **Nit: the skill count in Corrections (`:35-39`) is unclear.** "120 entries" is the total
   across the fixture's three `available_commands_update` notifications. The last update holds 40
   skills (19 `bundled`, 21 `user`). The `qualifiedName` example `user:<name>` covers only the user
   scope. Reword the sentence; nothing in the design changes.

### Round 1 verdict

**REVISE.** Twelve of the thirteen round 0 findings are resolved, with source support. Finding 13
is resolved for live lanes but not for the cold-resume route (R1-1). That is a narrow fix in B2, B3
and B8 plus one spec. After it, the plan is approvable. R1-2 and R1-3 do not block.

---

# Round 0 review (history)

## Requirement-to-section trace

| Req | Plan component(s) | Named test / seam | Status |
| --- | --- | --- | --- |
| 1.1 same card and toolbar order | F1, F5 | lane-composer spec, Electron L1, L10 | traced |
| 1.2 model picker | F1 picker, F4 catalog, B2/B3/B5/B7/B8/B9 `applyTurnSettings` | picker specs, lane-turn-settings spec | traced |
| 1.3 effort picker | same as 1.2 | same | traced |
| 1.4 `/` commands and skills | D10, F2 notice row, B5 `supportedCommands`, B8 `available_commands_update` | composer-input.controller spec, acp-session-runtime spec | **narrowed**: ACP skills are marked unsupported, but Grok advertises skills (finding 6) |
| 1.5 `@` reference or path text | D14, F2 `fileMode` | controller spec | traced |
| 1.6 images held with a reason | F5 gating, B3 refusal | coordinator spec | traced (renderer spec not named, finding 10) |
| 1.7 Resume with message | F5 (Stop or Resume in toolbar) | moved lane-composer spec | traced |
| 1.8 Checking / error / Retry | F4, F5 | lane-turn-settings spec | partial: the "Checking lane options…" loading state is not specified (finding 12) |
| 1.9 parity rows | F5 "every parity A test id" | moved specs | traced |
| 1.10 disabled controls reachable | F1 `ComposerGatedControlDirective`, D15 (N2 Send exception) | directive spec | traced |
| 2.1 Send queues | unchanged planner, F3/F5 | queued list spec | traced |
| 2.2 steer | B6 (Claude, gated on L4), B7 (Codex) | runner spec, L4, L6 | traced |
| 2.3 interrupt and continue | B5, B7, B8 | runner spec, L2, L6, L8 | traced |
| 2.4 neither steer nor interrupt | planner (unchanged) | planner spec | traced |
| 2.5 Claude/ptah-cli manifest flips | B5 interrupt, B6 steer gated | adapter specs + contract helper | traced |
| 2.6 Codex interrupt | B7 | codex adapter spec, L6 | traced |
| 2.7 next-turn model, card confirms | D3, B3, F7 `observedModel` | manager spec, L3 | traced |
| 2.8 refusal keeps draft and attachments | B3, F5 `LaneDeliveryController` | manager spec | partial: no renderer test named (finding 10) |
| 2.9 spawn-per-turn lanes | B9 | adapter specs | traced |
| 2.10 send-time recheck | B3 (kept) | coordinator spec | traced |
| 3.1 live usage | B4 + B5/B7/B9 | normalizer spec, manager spec, L9 | narrowed for ACP and Cursor, with evidence (see "Checked claims" 1) |
| 3.2 exact totals | B4 D8 | normalizer spec | traced (field semantics gap, finding 9) |
| 3.3 session totals once | E50, A5 | none named | open assumption A5. Accepted as an implementer check |
| 3.4 turn-end lanes say so | D9, manifest `usage.timing` | manifest specs | traced |
| 3.5 malformed or partial | B4, F7 partial badge | normalizer spec | traced |
| 3.6 restored card | B4 "unchanged" | none new | traced |
| 4.1 statement items | B1 sections, B2 resolver | effective-capabilities spec | traced |
| 4.2 refresh on status | existing preview triggers | none new | traced |
| 4.3 contract test | B2 `describeLaneTurnInputContract` | per adapter | traced |
| 5.1 approval in lane surfaces | F6, E35 | canvas-lane-view spec, L5 | traced |
| 5.2 same decisions | B1 widened decision, B10, F6 | responder spec | traced (bridge type risk, finding 7) |
| 5.3 question scoped to lane | B11, F6 | canvas-lane-view spec | traced |
| 5.4 answered once | F6, E38 | responder spec | traced |
| 5.5 deny-with-reason | A13 | none named | assumption only. Accepted with the A13 check |
| 5.6 no-route lanes disabled with reason | D11, D12 | manifest specs | traced (see "Checked claims" 2) |
| 5.7 Copilot bridge keeps working | B10 mapping | agent-rpc spec | traced implicitly. Not named in the plan |

## Checked claims (brief items 1 and 2)

1. **ACP and Cursor usage stay turn-end: confirmed.** The agy fixture
   `acp-runtime/src/lib/__fixtures__/antigravity-p3-ptah-mcp-tool-use.ndjson` has three
   `usage_update` notifications with only `used` (0 / 10485 / 10585) and `size`. They have no
   `_meta.usage`. The token counts arrive only in the prompt response `usage`.
   `antigravity-p3-cancel-then-continue.ndjson` has the same shape. None of the Grok fixtures has a
   `usage_update`: `grok-plain-turn.ndjson` reports usage only in the response. The runtime does
   read `_meta.usage` when an agent sends it (`acp-session-runtime.ts:565-576`). Research marked
   ACP usage "N (usage_update, mid-turn)" (`research-report.md:27,60`), but `used` measures context
   fill, not a token increment, so D9 is correct on the evidence. Cursor usage at turn end matches
   research Q3 (`messages.d.ts:83`). Req 3.1 makes Cursor conditional on research. The plan does not
   record that it corrects the research verdict for ACP (finding 11).
2. **Disabled prompts for Codex, ACP and Copilot `ask` are what Req 5 accepts.** Req 5.6
   (`task-description.md:303-306`) names "Codex, Copilot `ask`, OpenCode, Antigravity; Cursor, Pi and
   Grok unverified" as lanes with no route. For these lanes the required result is the reason in
   the capability statement plus a disabled ask chip, not routing. Req 5.1 adds other lanes only
   "where research confirms a route". Research gives Codex and ACP a W (workaround) verdict:
   - Codex: `approvalPolicy: never` would have to change (`codex-execution-profile.ts:201`).
   - agy: the ACP lane offers no `ask` mode at spawn (`antigravity-acp-lane.ts:112-115`).
   - Grok: unknown (research Q7).

   In both W cases the change would alter the spawn permission mode, which is out of scope
   (`task-description.md:140-142`). D12 holds. It should cite those two lines and not
   "research Q2, Q5, Q7" alone.

## Feasibility citations (contract claims checked at file:line)

| # | Claim | Result |
| --- | --- | --- |
| C1 | E1 `SdkHandle.continue(message)`, `steer(message)` text only | true, but they are at `cli-adapter.interface.ts:256,262`, not `:299-306` (that range is `AgentMessagingCapabilities`). Both are `readonly` function properties |
| C2 | E2 `interrupt`/`supportsInterrupt` | true, at `:270-280`, not `:318-330` |
| C3 | E3 spawn-only model/effort/files | true (`:143,152,166`) |
| C4 | E6 resolver steer = `typeof handle.steer === 'function'` | true (`agent-effective-capabilities.ts:34-36`) |
| C5 | E12 `continueConversation` mutates `turnSeq` at `:3249` before `continue` at `:3281`, and calls `handleExit(1)` on a throw | true |
| C6 | E13 usage fold only when `outcomeUsageIsTurnTotal` | true (`agent-process-manager.service.ts:2048-2053`) |
| C7 | E14 normalizer: `message` returns the running total, `cumulative` returns a delta, `turn` passes through | true (`lane-usage-normalizer.ts:22-45`). Note that `cumulative` is not cleared by `settleTurn` today |
| C8 | E15 renderer sums every segment (`addCliUsage`). Negative values sum correctly | true (`cli-usage.utils.ts:58-77`). `contextTokens`, `costUsd`, `durationMs`, `model` are last-wins, not summed |
| C9 | E17 claude runner `pendingTurns` push/shift, mailbox string content | true (`claude-sdk-lane-runner.ts:137-188`; `ptah-cli-prompt-mailbox.ts:10-21`) |
| C10 | E26 ACP `prompt(string \| ContentBlock[])`, `setModel`, `setEffort`, `getModels`, `getAgentCapabilities`, `interrupt` | true (`acp-session-runtime.ts:213-283`). There is no `getAvailableCommands` yet, as the plan says |
| C11 | E29 agy `usage_update` has no token counts | true (see "Checked claims" 1) |
| C12 | E35 lane permission routed by lane id to `sendCliAgentPermissionRequest` | true (`sdk-permission-handler.ts:428-438`) |
| C13 | E36 `AskUserQuestion` routes by session/tab only; request has no lane id | true (`sdk-permission-handler.ts:842-852`; `permission.types.ts:181-204`) |
| C14 | E37 `AgentPermissionDecision.decision: 'allow' \| 'deny'` | true (`agent-permission.types.ts:64-73`) |
| C15 | E45 chat imports chat-ui; both `scope:webview, type:feature`; chat-ui does not import chat | true (project.json tags; no `@ptah-extension/chat'` import in chat-ui) |
| C16 | E47 store methods exist at `agent-monitor.store.ts:3195,3218,3437` | true |
| C17 | E48 host manifest derives from handler `METHODS` | true (`host-profile/manifest.ts:160-164`). No separate manifest edit is needed |
| C18 | E51 `MAX_IMAGE_SIZE_BYTES` 5 MiB; `InlineImageAttachment` exists | true (`image-media-type.ts:26`; `rpc-chat.types.ts:71`) |
| C19 | B1 A0: `shared` may import `UsageScope` from `platform-core` | **false as a default**: `platform-core` already imports `@ptah-extension/shared` (e.g. `agent-budget-settings-migration.ts`), so the import is circular (finding 4) |

## Callers of changed or moved exports (brief item 3)

| Export | Callers found | Covered by plan |
| --- | --- | --- |
| `LaneComposerComponent` (chat-ui → chat) | `chat/.../agent-continue-input.component.ts:6,25`; `chat/.../inspector-agents-section.component.ts:19,83,271` (+ spec selectors); `chat-ui/src/index.ts:62` | yes (F5). No caller in apps, canvas or html |
| `SdkHandle.continue/steer` (optional 2nd arg) | adapters and the manager inside `cli-agent-runtime` only; no `SdkHandle`/`.continue(`/`.steer(` in `cli-engine/src`, `platform-cli/src`, `apps/ptah-electron/src` | yes (additive). The benchmark libs are in the gate list |
| `ContinuationDispatcher.continueConversation` | router only (`agent-message-router.service.ts:137`); implementer is the manager | yes |
| `PendingAgentMessage` | `tracked-agent.ts:10,101` | additive field, OK |
| `PromptMailbox.push` | runner, `claude-cli.adapter.ts`, `ptah-cli-registry.ts`, `ptah-cli-registry-permission-routing.spec.ts` | the permission-routing spec is not listed (finding 8) |
| `LaneUsageNormalizer.accept` (return type changes) | manager `:2049`; `lane-usage-normalizer.spec.ts`; `usage-scope-adapters.spec.ts` | yes |
| `AgentDeliveryStore.recoverQueuedText` (return type changes to `{text, turn}`) | `chat-streaming/agent-delivery.store.ts:582` (internal); **`chat/src/lib/services/agent-follow-up-queue.service.ts:212`** (main chat follow-up queue); chat-ui LC `:342` | **missed**: main chat follow-up queue (finding 3) |
| `AgentPermissionDecision` (widened) | `copilot-permission-bridge.ts:29,104,185,225,242-292`; `agent-rpc.handlers.ts:1381`; `rpc.types.ts:1970` | the bridge file is not listed (finding 7) |
| `AgentGetQueuedMessageBodyResult` | `libs/shared/.../messages/agent-messaging.schemas.spec.ts` | the spec is not listed (finding 8) |
| `cli-engine` composition | `codex-lane-runtime-composition.ts`, `container.ts` import cli-agent-runtime; none use the changed messaging exports | typecheck in the gate is enough |

## Failure behaviour (brief item 4)

| Case | Plan | Testable | Gap |
| --- | --- | --- | --- |
| Refused model change | B3: refusal is applied before the `turnSeq`/status mutation, gives `turn-options-refused`, and leaves the record untouched. A queued message fails at flush and the receipt restores the draft | manager spec named | no renderer spec for "draft and attachments restored" (finding 10) |
| Unsupported image | B3 coordinator refusal before storage; F5 tray chip "Can't send" | coordinator spec | renderer spec not named (finding 10) |
| Interrupt failure | B5: 3 s bound → `interrupt-failed`, turn left running, draft restored | runner spec | the lifecycle of `interruptRequested` after a timeout is not specified (finding 5) |
| Host restart loses images | D4: `imageCount > 0` and nothing held → `attachments-unavailable`, text recoverable | not named: the dispatcher and scheduler specs are absent from the B3 seam (finding 10) | |

## Batches, gating and shared files (brief item 5)

- The plan leaves batch decomposition to the team-leader. Its eleven suggested groups are
  file-disjoint, except where it says so (B3+B4 manager; B5/B6). Each group has scoped projects.
  Named tests exist per component.
- **Gating gap**: TASK_2026_2322_4ba4 has not merged into `main` (no commit in `git log main`).
  The shared-file table lists `cli-adapter.interface.ts` (B2) and `usage-scope-adapters.spec.ts`
  (B4) as shared with that task, but only B8 waits for the rebase (finding 2).
- Stream-json: no plan file edits `antigravity-cli.adapter.ts`, its specs,
  `antigravity-result-diagnostics.ts` or the agy profile. B8 relies on
  `antigravity-cli.adapter.ts:927` to inherit the handle. That line can move or be renamed in
  2322, so it must be re-checked after the rebase (included in finding 2).

## Live test plan (brief item 6)

L1-L10 cover Claude, Codex and agy ACP in Electron, with agy on Gemini 4 Hydrogen (L8, L9). That
is adequate. Optional addition: a live refusal case (an unknown model id, or an image on a lane
without image support).

## Proposed-constraint decisions

| Constraint | Decision |
| --- | --- |
| D3 a steer that carries a model or effort change is refused | accepted (Req 2.7 "from the next turn") |
| D4 images held in host memory, fail after restart | accepted (Req 1.6 "never dropped silently" holds through `attachments-unavailable`) |
| D5 images refused on a cold resume | accepted (spawn options carry no images, E3) |
| D9 ACP usage at turn end | accepted on fixture evidence; record it as a research correction (finding 11) |
| D10 ACP skills unsupported | **rejected**: Grok advertises skills (finding 6); the command list also needs a permission-command filter (finding 13) |
| D11 approval chip always disabled | accepted (permission policy is out of scope) |
| D12 Codex, ACP, Copilot prompts unsupported | accepted (Req 5.6) |
| Proposed Removals: delete the three store methods | **rejected**: decisions.md 13 keeps them (finding 1) |

## Numbered findings

1. **Blocking. The plan contradicts decisions.md 13.** The plan cites rows 1-12 only
   (`implementation-plan.md:10`). "Proposed Removals" (`:669-675`) recommends deleting
   `continueAgent`, `resumeAgentWithMessage` and `interruptSession`, and the handoff keeps a DELETE
   path "after approval" (`:733`). Row 13 keeps these methods in this task. Fix: cite rows 1-13,
   change the section to "Kept (decisions.md 13), listed for future-enhancements", and remove the
   delete path. Impact: a batch could delete binding-kept code.
2. **Blocking. TASK_2026_2322_4ba4 gating is incomplete.** `cli-adapter.interface.ts` (B2) and
   `usage-scope-adapters.spec.ts` (B4) are in the shared-file table (`:687-690`), but only B8 waits
   for the rebase (`:392,706`). 2322 has not merged into `main`. Fix: either gate B2 and B4 (and
   so most backend work) on the rebase, or name the exact lines B2 and B4 touch and state that 2322
   does not touch them. Also re-check the agy handle entry point
   (`antigravity-cli.adapter.ts:927`) after the rebase. Impact: rebase conflicts in the core
   contract.
3. **Blocking. A caller of `recoverQueuedText` is missing.** F4 changes the return type to
   `{text, turn}` (`:522-523`), but main chat's
   `libs/frontend/chat/src/lib/services/agent-follow-up-queue.service.ts:212` uses the string.
   Fix: add a new method (e.g. `recoverQueuedMessage`) and keep `recoverQueuedText: Promise<string>`,
   or list this file and its spec. Impact: the main chat follow-up queue breaks, against the
   "main chat unchanged" NFR.
4. **Assumption A0 has a known answer.** `platform-core` imports `@ptah-extension/shared`, so
   `shared` → `platform-core` is a cycle (`:172-174,634-635`). Fix: declare `UsageScope` in
   `shared` and let `platform-core/session-usage-sink.interface.ts:5` re-export it or stay
   structurally identical. Add that file to B1 if it changes.
5. **The interrupt timeout lifecycle is not specified** (B5 `:296-298,310-312`). If
   `query.interrupt()` misses the 3 s bound but takes effect later, it is unclear whether
   `interruptRequested` stays set and maps the late error result to exit 0. It is also unclear
   whether a stale flag can mask a real later failure. Fix: specify when the flag clears (on the
   next result frame, or on timeout with a late-interrupt mapping) and add a runner spec case.
6. **ACP skills are narrowed without evidence** (D10 `:130`, B8 `:377-378`). The Grok fixture
   `grok-plain-turn.ndjson` `available_commands_update` lists bundled skills (`create-skill`,
   `code-review`, ...) with `_meta.path` pointing at `SKILL.md`. Fix: group the entries that carry
   that `_meta` as `skill` for Grok (Req 1.4, 4.1), or record why they stay unsupported.
7. **The widened `AgentPermissionDecision` reaches the Copilot bridge.**
   `copilot-permission-bridge.ts:185,225` tests `decision === 'allow'`, so `always_allow` would
   silently become deny if any path skips the B10 mapping. Fix: keep the bridge on a narrow type
   (a separate lane-wide decision type for the RPC) or list the bridge file with a test. Also give
   `agent:permissionResponse` a strict zod schema, because `modifiedInput` from the renderer becomes
   tool input (`agent-rpc.handlers.ts:1380-1405` has no schema today).
8. **Unlisted specs that the contract changes break:**
   - `libs/shared/src/lib/types/messages/agent-messaging.schemas.spec.ts` (queued-body result type);
   - `ptah-cli/ptah-cli-registry-permission-routing.spec.ts` (mailbox `push` shape).

   Add both to B1 and B5. Impact: a batch is not file-complete.
9. **Usage increment field semantics are not specified** (B4 `:270-276`). `addCliUsage` sums
    input, output, cache and total tokens, but takes `contextTokens`, `durationMs`, `model` and
    `costUsd` last-wins (`cli-usage.utils.ts:66-76`). The plan must say that the increment
    rewrite passes these snapshot fields through unchanged and does not subtract them. It must also
    say that `settleTurn` now clears the `cumulative` map, which it does not today
    (`lane-usage-normalizer.ts:46`). Add spec cases for both.
10. **Some failure cases have no named test:**
    - a renderer spec in which a refused model, effort or attachment at flush restores the draft
      and its attachments (F5 / `lane-delivery.controller.spec.ts`; Req 2.8);
    - an unsupported image held in the tray with Send disabled (Req 1.6);
    - a dispatcher or scheduler spec for `attachments-unavailable` after a restart
      (`agent-message-dispatcher.spec.ts`, `agent-message-delivery.scheduler.spec.ts`; D4).
11. **The research correction is not recorded.** D9 overrides the research verdict "ACP usage_update
    N mid-turn" (`research-report.md:27`). Add a row under Inputs → Corrections that cites the
    fixtures. Optionally keep the `_meta.usage` path live when an ACP agent sends it
    (`acp-session-runtime.ts:565`), instead of a hard turn-end statement.
12. **Minor: evidence citations and missing states.**
    - E1 and E2 line ranges are wrong (C1, C2).
    - The Req 1.8 "Checking lane options…" loading state is not specified in F4 or F5.
    - Req 5.7 (the Copilot bridge uses the same card) is not traced explicitly.

13. **Security: provider commands that change permissions.** The same Grok
    `available_commands_update` exposes `always-approve` ("skip all permission prompts"). If B8 shows
    every advertised command in the `/` list, a lane's permission policy can be changed from the
    composer. That is out of scope (`task-description.md:140-142`) and unsafe. Fix: filter the
    permission-changing commands per profile (a profile deny-list), with a test.

## Unresolved items

- A5 (session totals count each lane once), A2, A3, A6-A8, A10-A13 stay implementer checks. They
  are acceptable as written, each with a named check.
- Findings 1-3 block approval. Findings 4-13 must be fixed or explicitly dispositioned in the next
  revision.

## Verdict

**REVISE.** Coverage is broad, and the main contract claims hold at source. The plan conflicts
with binding decision 13, under-gates the files it shares with 2322, and misses a main chat
caller of a changed store API.
