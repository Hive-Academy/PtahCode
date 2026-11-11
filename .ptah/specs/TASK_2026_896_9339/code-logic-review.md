# Code Logic Review — TASK_2026_896_9339

Reviewer: independent code-logic lane. Method: read-only trace of the uncommitted diff and its
callers. No build, test, lint or verify command was run.

## Verdict

**REVISE.** The router part is mostly correct. Alternates keep the lane identity, so hard
constraints still apply to the lane of the chosen option. A fallback row cannot become a
routed model with provenance `reported`. Also, an unsent request, a timeout or an invalid label
gives the ranking pick with the default model. There are four gaps that need a decision or a fix
before the push:

1. The new contract text makes orchestrators pass a model that deterministic score promotion
   picked. That model then overrides the user's `agentOrchestration.<cli>Model` setting
   without any decision-model choice (Finding 1).
2. Alternates of one phase can prune primary lanes of other phases, because the fit uses one
   width for all phases (Finding 2).
3. Ptah CLI lanes do not get the `Lane policy` request fields or the `Lane model outcome` line,
   and nothing reports this (Finding 3).
4. No test covers the R3 wiring in `AgentProcessManager` (Finding 6).

## Findings

1. **Serious — deterministic promotion now overrides the per-CLI model setting.**
   `libs/backend/lane-routing/src/lib/ranking/score.ts:100-111`,
   `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tools.ts:122-124`,
   `.claude/skills/agent-lanes/SKILL.md` (section 2, changed lines).
   The router does not know `agentOrchestration.<cli>Model`. `listSystemCli` gives only
   `reported`/`fallback` rows (`rpc-handlers/src/lib/services/lane-model-listing.adapter.ts:126-159`),
   so `configuredModel` is never set for a system CLI lane (`pipeline/gather.ts:247-262`).
   `score()` still promotes a reported id when its own cell beats the family cell by more than
   the band (`score.ts:120-139`). The changed text now tells the orchestrator to pass any row
   `model` that is not `lane-default`. `resolveLaneModel` gives the request first place
   (`cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:257-265`).
   Scenario: the user sets `codexModel = X`. The live Codex catalog contains `Y`, and `Y` has a
   matrix profile above the family cell plus the band. With no decision model, the roster row is
   `model: Y`, the orchestrator spawns with `model: Y`, and `X` never runs. Before this diff the
   text said the row was advisory, so `X` ran. This conflicts with "one default model: setting,
   else native default" and "deterministic code keeps the present default". The plan's R1 says
   "scored model or lane-default", so the plan permits it, but the task summary does not.
   Proposed fix: for a system CLI lane, keep the deterministic primary at `lane-default`. Use
   the promoted id only to rank lanes, or only as an alternate that the decision model must
   choose. Another option: change the text to "pass `model` only when the row `source` is
   `model`". If the current behavior is intended, record it in `decisions.md` as a
   user-visible change.

2. **Moderate — alternates of one phase can prune primary lanes of another phase, or stop the
   whole request.** `libs/backend/lane-routing/src/lib/pipeline/model-refine.ts:256-289`
   (`fitLane`), `:308-317` (`sliceOptions`).
   `fitLane` shrinks every phase to the same width. `laneQuestion` puts alternates after the
   primaries of the same phase (`phase-plan.ts:236-251`), but not after the primaries of other
   phases. Scenario: phase A has 2 primaries + 2 alternates and phase B has 4 primaries, near
   the byte cap. Before the diff, width 4 fit. Now phase A's alternates add bytes, the width
   drops to 3, and phase B's 4th lane is `pruned` (`assemble-gate.ts:219-229`). At width 2, a
   newly sendable one-lane phase adds 2 options. This can push a request that fit before over
   the cap, and then `emptyOutcome('payload-too-large')` drops the decision model for all
   phases. Also, newly sendable phases take `QUESTIONS_PER_REQUEST` (32) slots
   (`route-decide.service.ts:345-349`), so a later multi-lane phase can get `question-limit`.
   This is rare. The R1 rule "a shrink drops alternates before lanes" is true only inside one
   phase. Proposed fix: in `fitLane`, first drop alternates in all phases (primaries-only pass)
   before you reduce the primary width. Alternatively, fit with a per-phase width of
   `min(width, primaryCount)` before the alternates are added.

3. **Moderate — no model log on the `spawnFromSdkHandle` path, and nothing reports this.**
   `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1273`
   (second `trackSdkHandle` call, without `modelLog`), `:1006-1012` (`Lane policy` fields only
   in the `doSpawnSdk` path).
   Ptah CLI lanes (`ptah-cli-registry.ts` → `spawnFromSdkHandle`), the Ptah CLI lane resumer
   (`messaging/lane-resumers/ptah-cli-lane-resumer.ts:124`) and the `execute_code` agent
   namespace (`vscode-lm-tools/.../agent-namespace.builder.ts:476`) create a `TrackedAgent`
   with `modelLog: undefined`. `signalLaneCompletion` then skips the line
   (`:3628-3634`). R3 says one `Lane model outcome` line at the terminal status, and it does not
   exclude Ptah CLI lanes. Proposed fix: build a `LaneModelLogState` in `spawnFromSdkHandle`
   from the request `model` and `modelTier` (`modelSource` from the Ptah CLI resolution).
   Alternatively, write `Lane model outcome` with `selectedModel: 'unknown'` when `modelLog` is
   absent. Another option: record in the plan that R3 covers system CLI lanes only.

4. **Moderate — a blocked decision model, or a timeout, now changes the reason and the
   confidence of a one-lane phase.** `libs/backend/lane-routing/src/lib/pipeline/phase-resolve.ts:17-23,38-50`.
   Before the diff, a phase with one lane in the band was not sendable, so it resolved
   `ranking` with `cause: null`. Now one lane with 1-2 reported alternates is sendable. With
   `mode === 'blocked'` (decision model configured but unreachable or auth failed,
   `decision-caller.ts:42-68`), it resolves with `cause = blockedCause`. With a timeout, it
   resolves with `cause = 'timeout'`. The lane and the model stay the same. The roster
   `fallbackCause`, the reason text (`fallback cause ...`, `compile-reasons.ts:279-281`) and the
   overall source/confidence change. Also, each route call that has such a phase now waits for
   the decision model, up to its timeout. Decision 9 accepts the question. The changed fallback
   fields are not listed as an accepted change. Proposed fix: accept and document it, or keep
   `cause: null` when the only options of a phase are alternates of the ranking pick and the
   request failed.

5. **Minor — the alternate cap is applied before the band filter.**
   `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:262-263` and `:246-248`.
   `alternateOptions` takes the first 2 reported ids in catalog order. Then `laneQuestion`
   drops those outside the band. A later in-band catalog id is never offered. Scenario:
   catalog `[low-a, low-b, good-c]`. `low-a` and `low-b` are outside the band, so no alternate
   is offered. Proposed fix: apply `insideClosenessBand` (against the phase top) inside
   `alternateOptions`, or compute the alternates in `laneQuestion` with the cap after the filter.

6. **Moderate (test gap) — R3 wiring has no test.** The spec
   `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-model-log.spec.ts` tests only the two
   pure helpers. No spec asserts these items: the new `Lane policy` fields; that
   `Lane model outcome` is written once per terminal status (stop, timeout + `handleExit`
   dedupe, held adoption re-signal at `:2387`); that `actualModel` comes from
   `turnTelemetry.usage.modelId` with status `reported`; that `*/unknown` and `*/multi-model`
   are skipped; and that Pi is skipped (`:1500-1506`). A search for `Lane model outcome` in
   `*.spec.ts` finds no match. Proposed fix: add an `AgentProcessManager` spec with a fake
   SDK handle that emits one `turnTelemetry` segment, then stops and times out.

7. **Minor (test gap) — R1 items without a direct test.**
   - The cross-phase fit/shrink in `fitLane` is not tested. The "keeps primaries ahead of
     alternates when only two options fit" test (`live-model-options.spec.ts:116-125`) slices
     `laneQuestion(...)` by hand and does not call `runLaneRequest`/`fitLane`.
   - No test covers an unknown label that passes validation but has no option (for example
     `o9` in `answers`, so `option === undefined`, `phase-resolve.ts:66-73`).
   - No test covers the blocked mode or the `question-limit` mode for a one-lane phase.
   - No test checks that a Cursor or Copilot fallback-only lane keeps `lane-default` through
     the whole `planRoutePhases` path. Only `score.spec.ts` checks it at unit level.
   No new test is vacuous. Each assertion can fail.

8. **Minor — contract text is ambiguous for `cli: "claude"` rows and for pinned rows.**
   `route-tools.ts:122-124` and the three changed skill passages.
   `ptah_agent_spawn` calls `claude` a "system CLI agent". The router does not
   (`candidate.types.ts:46-54`). A `claude` row can carry a promoted listed id: `listSystemCli`
   marks Claude rows `reported`, and `score()` does not filter them. So "for system CLI lanes,
   pass exact model" can make an orchestrator pass both `model` and `modelTier` for a Claude
   row. Which one wins is a host rule that this text does not state. The `ptah_route_decide`
   description also no longer says what to do with `tier` for Ptah CLI rows. A pinned system
   CLI row can carry a `fallback` id (`phase-plan.ts` `applyPinModel`, unfiltered `models`).
   This makes "exact live-list ID" untrue for that row, but "pins win" covers the result.
   Proposed fix: write "system CLI lanes other than `claude`" in the description and in the
   skills. Add "for ptah-cli and claude rows pass `tier` as `modelTier`" to the description.

9. **Minor — effort text makes the routed effort override the per-CLI effort setting.**
   The skills now say "pass roster `effort` as spawn `effort`". `resolveLaneEffort` gives the
   spawn effort first place over `agentOrchestration.<cli>ReasoningEffort`
   (`lane-spawn-policy.ts:344-345`). So a user effort setting no longer applies to routed
   system CLI spawns. This is in R4 as written. It is the same class of change as Finding 1,
   so state it in `decisions.md`.

10. **Minor — `actualModel` has no length cap.**
    `agent-process-manager.service.ts:1501-1505`. `requestedModel` is cut to 128 characters, but
    an adapter-reported id is copied without a cap. The sources are runtime model ids (Cursor
    SDK `model.id`, OpenCode `providerID/modelID`, Antigravity `result.model`, Codex
    evidence), so a secret is unlikely. Proposed fix: use the same 128-character cut.

11. **Minor (suspicion) — OpenCode stdout lines become `reported` ids without a shape check.**
    `cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts:402-413`.
    Each non-empty stdout line of a successful `opencode models` call becomes an id. Before the
    diff these rows were `fallback`, so they were never routed. Now the first two can be offered
    as alternates (no profile is needed for an alternate) and passed as `--model`. If a CLI
    version prints a notice line on stdout with exit 0, that line becomes a routed model id and
    the spawn fails. I did not verify that any OpenCode version does this. Proposed fix: keep
    only lines that match `^[^\s/]+/\S+$`.

12. **Minor — new value-level import cycle between `phase-plan.ts` and `phase-resolve.ts`.**
    `phase-plan.ts:19` imports `resolvePhase`, and now `phase-resolve.ts:15` imports
    `laneQuestion` as a value. Both are function declarations that are used only at call time.
    No top-level statement calls across the cycle, so CommonJS and ESM load it without error.
    This is not a defect today. A future top-level constant in one file that calls the other
    file would break at module load. Proposed fix (optional): move `laneQuestion` and
    `toOption` to a small `lane-question.ts` module.

## Answers

1. **Router determinism.** Mostly yes. With `mode === 'ranking'`, `runPass` sends nothing
   (`route-decide.service.ts:345`). In every failure branch of `resolvePhase`
   (`phase-resolve.ts:38-73`), `rankingResolution(pick, ...)` has no `selectedScore`, so
   `chosenEntry` uses `row.scored` (`assemble-gate.ts:339`). These branches are: not sendable,
   limited, blocked, ranking, not sent / request cause, bad or low-confidence validation, and
   index out of range or lane not ranked. Lane and model are the same as before. The
   exceptions are Finding 4 (one-lane phases now get a non-null `fallbackCause` when blocked or
   timed out) and Finding 2 (shrink across phases). Option indexes line up: `outcome.offered`
   is the sliced `laneQuestion` list (`model-refine.ts:308-317`), labels are `o{index+1}` of
   that list (`model-refine.ts:363-368, 393-396`), and `resolvePhase` indexes the same list.
   It maps the label to an alternate by `(laneId, model)` (`phase-resolve.ts:75-77`). This is
   unique because `alternateOptions` seeds `seen` with the primary model
   (`phase-plan.ts:261-266`). Inside one phase, a slice drops alternates first.
   `PROVIDER_OPTION_LIMIT` is applied through the same slice. Across phases it does not
   (Finding 2). `pushExcluded` uses lane ids, so an offered alternate keeps its lane
   "not pruned", and that is correct.
2. **One lane can be sent.** Yes. That is intended (decision 9). `isSendable` counts
   `laneQuestion(plan).options` (`phase-resolve.ts:21`). No downstream code needs two
   distinct lanes. `spread` runs before alternates exist. `choiceFlags` compares the candidate
   id with the spread pick (`assemble-gate.ts:166-179`). For a same-lane alternate it keeps
   the rotation and preference flags of the ranking pick, and that is correct because rotation
   chose that lane. `withOnlyEligible` appends "only eligible candidate", which is still true.
   `rosterEntryConfidence` uses only source and reported confidence. A same-lane alternate
   gives `source: 'model'`, `model <alternate id>`, `model probability ...` in the reason
   (`compile-reasons.ts:340-358`). This is accurate: the model chose the model id. No "model
   changed the choice" flag exists in the code, so nothing is false. The System One payload
   `availableExecutors` keeps the primary model of the lane (first appearance,
   `decision-payload.ts:90-99`). The criteria labels carry the alternate model, so the
   decision model still sees it.
3. **Hard constraints.** `implementersOf` reads `resolution.candidate.family`
   (`phase-plan.ts:291-304`). An alternate keeps `candidate: row.candidate`
   (`phase-resolve.ts:80`), so the implementer family stays excluded in pass 2. The test
   `live-model-options.spec.ts:134-150` covers `o1` and `o3`. AT LIMIT exclusion runs in
   `constrainPhase` before scoring, and alternates are made only from `ranked` rows. The roster
   has one entry per phase, and rotation is saved per phase by executor id
   (`route-decide.service.ts:383-392`). So a lane is not counted twice for one phase. Spread
   ranks lanes only. I did not find a batch-cap counter in `lane-routing` that alternates could
   affect.
4. **Provenance.** No. A `fallback`, `configured`, `tier`, `auto`, empty, `lane-default` or
   `auto`-matrix row cannot become `reported` in a routed row. `alternateOptions` requires
   `provenance === 'reported'` and excludes `auto`, `''`, `LANE_DEFAULT_MODEL` and
   `AUTOMATIC_MATRIX_MODEL` (`phase-plan.ts:264-266`). `score()` filters system CLI lists to
   `reported` (`score.ts:101-104`). A pin can still give a `fallback` id with provenance
   `fallback`, as before. The `claude` lane and Ptah CLI lanes are unchanged:
   `isSystemCliLane` is false for both (`candidate.types.ts:46-54`), and the score tests cover
   them. The filter is a behavior change. A lane whose only rows are fallback rows (Copilot or
   Codex without a live list, Cursor without a key) loses its promoted cell score. It falls to
   the family cell, so its lane rank can drop and a different lane can be picked
   deterministically. Spawns are not hurt, because the text said these rows were advisory.
   The lane order can change. This is the accepted rule of decision 6.
5. **Catalog provenance.** `CursorCliAdapter.listModels` (`cursor-cli.adapter.ts:319-349`)
   returns either API rows, which are live and have no flag, or the static `FALLBACK_MODELS`
   (flagged) on the no-key, empty and error paths. The adapter has no cache of its own.
   `CliDetectionService` caches the returned arrays unchanged (`cli-detection.service.ts:396-430`).
   So a non-live Cursor row is always flagged. OpenCode returns rows only after exit 0 with
   stdout, else `[]`, and it has no hardcoded defaults (`opencode-cli.adapter.ts:402-413,
   496-519`). See Finding 11. `lane-model-listing.adapter.ts:133-159` maps `isFallback` to
   `fallback`, else `reported`. For `skillSynthesis:getAgentModels`
   (`skills-synthesis-rpc.handlers.ts:846-850, 1436-1450`), stored Cursor or OpenCode values
   that are in a live list now classify as `listed`. That is correct for "provider-reported
   entries only". A Cursor value that is only in the fallback list stays not listed. I found
   no wrong `listed` state.
6. **Log (R3).** The `doSpawnSdk` path writes `Lane model outcome` once per terminal event.
   The line is at the top of `signalLaneCompletion` (`agent-process-manager.service.ts:3627-3634`)
   and is deduplicated by `completedAt`. Stop stamps `completedAt` before the signal
   (`:2777-2798`). Timeout stamps it, signals, and `handleExit` keeps the same value
   (`:3045-3057, 3351-3363`). A held adoption re-signal (`:2387`) is deduplicated. A new turn
   clears `completedAt` (`:2660`), so each later terminal event logs again. That is one line
   per terminal status. A resume through `ptah_agent_spawn` is a new `doSpawnSdk` agent with
   its own state. No restore-after-restart path makes a `TrackedAgent` (the only construction
   is at `:1365`). The `spawnFromSdkHandle` path has no `modelLog`, and nothing reports this
   (Finding 3). `actualModel` is read only from `turnTelemetry` with `status === 'reported'`.
   Pi is skipped because `pi-cli.adapter.ts:482,519` seeds `turnModel` from `options.model`.
   The other sources are runtime fields: Cursor `message.model.id` / `settled.model.id`
   (`cursor-cli.adapter.ts:460-497`), OpenCode `providerID/modelID` (`opencode-cli.adapter.ts:1075-1077`),
   Antigravity `event.result.model` (`antigravity-cli.adapter.ts:873`), Copilot
   `usage.model || 'copilot/unknown'`, ACP `usage?.model`, and Codex `evidence.modelId`. None
   copies `options.model`. `requestedModel` has a 128-character cut. `routingSource` is a zod
   enum at the MCP boundary (`agent-spawn-args.schema.ts:105`). `actualModel` has no cut
   (Finding 10).
7. **Contract text.** The changed lines are identical in the two copies of each skill file. The
   diff hunks match byte for byte. `agent-lanes/SKILL.md` already differed at line 46 on
   `main`, and that difference is not part of this diff. A routed system CLI row `model` is an
   exact reported id or `lane-default`. It is never `null` for a chosen row, and it is `null`
   only for unavailable rows, as the text says. The text is ambiguous for `claude` rows and
   pinned rows (Finding 8). It also makes the promoted model and the routed effort override the
   user settings (Findings 1 and 9). For Ptah CLI rows the skill text is correct ("`tier` as
   `modelTier`"). The tool description no longer says this (Finding 8).
8. **Tests.** Covered items: fallback row not offered or promoted (`phase-plan.spec.ts` new
   test, `score.spec.ts`); cap and catalog order; primaries before alternates; ranking,
   unsent, timeout and invalid answers give the default; a valid alternate label gives the
   exact id, `reported` provenance, score and reason; one lane gets a question; reviewer
   exclusion after either choice; Cursor and OpenCode provenance. Missing items: R3 wiring
   (Finding 6); R3 precedence "request > setting > default unchanged" (no new or changed
   assertion, and `resolveLaneModel` is not changed); cross-phase fit; out-of-range label;
   blocked mode for a one-lane phase (Finding 7). No vacuous test was found.

Other checks: the `phase-plan.ts` ↔ `phase-resolve.ts` cycle is safe at load (Finding 12). The
`LANE_MODEL_ALTERNATES_CAP` invariant check is correct (`routing-constants.ts:191-193`). The
withdrawn tier files are not in the worktree (`cli-tier` occurs only in frontend files that
existed before).

## Not verified

- I ran no test, lint, typecheck or build (by instruction). Type correctness is assumed from
  the coordinator's checks.
- The upstream source of Codex `evidence.modelId` past
  `agent-sdk/src/lib/codex-app-server/codex-session-usage-owner.ts`. I assume it is
  app-server runtime evidence and not the configured model.
- Whether any OpenCode version prints non-model lines on stdout with exit 0 (Finding 11).
- The host order between a request `model` and `modelTier` for `cli: "claude"` (Finding 8).
- The real byte sizes near `REQUEST_SIZE_LIMIT_BYTES` that are necessary to trigger Finding 2.
- Batch-cap enforcement outside `lane-routing`. I did not find one inside the library.
