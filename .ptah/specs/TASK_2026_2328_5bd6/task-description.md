# Task Description - TASK_2026_2328_5bd6

Performance-backed routing: score each provider + model + effort choice from real outcomes, and
discover each provider's model catalog automatically.

## Requirement of record

The user's words (context.md, "User Request") are the requirement of record:

> back up the decision models based on how they preform and be able to automatically grasp each
> provider and thier different model they provide so it doesn't have to be always the same model
> we set as default in our settings the main model has the ability to run the cli with any model
> effort it wants and we need to be intelligent about scoring it with real world data and funnels
> that we can build in some way ?

### Desired outcome (what the user asks for)

1. A routed CLI lane does not always run the one default model from settings.
2. Ptah knows which models each provider offers, without manual entry.
3. Ptah picks provider + model + effort from how those choices performed in real use.
4. The evidence is "real world data and funnels": staged success rates, not a single count.

### Suggested mechanism (open to the architecture phase)

- "Funnels that we can build in some way" is a direction, not a design. The stages, the store and
  the formula are architecture decisions.
- "Decision models" is read as the routing decisions of `ptah_route_decide` plus, where it
  applies, the System One decision model (decisions.md row 2). Open question Q4 confirms the
  System One part.

---

## Context

### C1. How a candidate gets its score today

- The score is additive: `prior + learned + preference + limit (+ override)`
  (`libs/backend/lane-routing/src/lib/ranking/score.ts:199-236`).
- The prior is the `user` cell, else the `seed` cell, else `NEUTRAL_SCORE` 50
  (`ranking/score.ts:209`, `routing-constants.ts:21`).
- The learned part is the `local` cell minus the prior, capped at ±`LEARNED_DELTA_CAP` 15
  (`ranking/score.ts:214-215`, `routing-constants.ts:24`).
- An exploration bonus of 5 applies while a cell has fewer than 3 local samples
  (`ranking/score.ts:211-213`, `routing-constants.ts:27-30`).
- Local cells come from outcome summaries in a 90-day window. Delivery rate and review pass rate
  are blended toward the prior with weight 10 (`matrix/local-derivation.ts:24-44`,
  `routing-constants.ts:220-224`).
- Local cells are keyed by `[family, model, taskKind]` (`matrix/local-derivation.ts:148`).
  A run stored as `lane-default` or `auto` lands on the family profile `*`
  (`matrix/local-derivation.ts:43-48`, `:169`).
- The shipped seed covers only the `implement` kind and seeds only one model, `z-ai`/`glm-5`
  (`matrix/seed-matrix.ts`, header comment). Other cells start `unknown` at 50.

### C2. Where `model: lane-default` and `models unknown` come from

- Per lane, a listed model is chosen only when its own cell beats the family cell by more than
  `CLOSENESS_BAND` 5. Otherwise the configured model is used, otherwise `lane-default`
  (`ranking/score.ts:8-12`, `ranking/score.ts:127-132`, `ranking/score.ts:156`).
- A system CLI lane never gets a promoted model: `isSystemCliLane` returns `null` for promotion
  (`ranking/score.ts:129-131`). `isSystemCliLane` covers every lane except `ptah-cli` and
  `claude` (`ranking/candidate.types.ts:66-78`). This is why a `codex` row always shows
  `lane-default`.
- Model listing for each row races a 2000 ms budget (`routing-constants.ts:169`,
  `pipeline/gather.ts:501-537`). A non-`ok` result (`timeout`, `error`, `empty`,
  `unregistered`, `contracts/route-decide-result.schema.ts:83`) adds the reason
  `models unknown for <lane> (<status>)` (`pipeline/gather.ts:485-490`).
- The routed spawn records `model: info.model ?? lane-default`
  (`libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:62`). A lane
  routed with `lane-default` records `lane-default`, so its outcomes feed only the family
  profile `*`. No per-model evidence accumulates, and per-model cells cannot beat the band.
  This is a self-reinforcing loop.
- The record holds the model id as spawned, not the model the CLI actually resolved
  (`libs/shared/src/lib/types/lane-outcome.types.ts:65-68`, `:85-86`).

### C3. Model catalogs that exist today

| Lane | Source | Evidence |
| --- | --- | --- |
| `claude` (system) | Native Claude model service; empty when unavailable | `cli-adapters/claude-cli.adapter.ts:167-177` |
| `codex` | CLI app-server catalog, then `~/.codex/auth.json`, then adapter list | `rpc-handlers/.../cli-model-list.service.ts:60-72` |
| `copilot` | Host, then auth service; adapter returns `[]` | `cli-model-list.service.ts:74-79`, `copilot-sdk.adapter.ts:269-271` |
| `grok` | `grok models` probe | `grok-cli.adapter.ts:227-231` |
| `antigravity` | `agy` models probe; throws on timeout | `antigravity-cli.adapter.ts:465-475` |
| `cursor` | Cursor SDK; empty without an API key | `cursor-cli.adapter.ts:353-360` |
| `opencode` | `opencode` models probe | `opencode-cli.adapter.ts:434-444` |
| `pi` | `pi --list-models` probe | `pi-cli.adapter.ts:327-334` |
| `ptah-cli` providers | Saved config plus one shared provider discovery per provider | `rpc-handlers/.../lane-model-listing.adapter.ts:9-11`, `:119-127` |
| System One decision model | Ollama `/api/tags` + `/api/show`, or Ollama Cloud tags | `decision-model/decision-model.catalog.ts:1-27` |

- The routing port is `LaneModelListing.list(row, signal)` with provenance
  `reported | fallback | configured | tier` (`lane-routing/src/lib/lane-model-listing.port.ts`).
- The adapter interface also has optional effort sources: `laneEfforts` and
  `stoppedLaneCatalog` (`cli-agent-runtime/.../cli-adapter.interface.ts:470-485`).
- Discovery is done at route time inside the routing budget. No catalog snapshot outlives one
  call for system CLIs.

### C4. Outcome data that is stored today

- One row per run, schema `LaneOutcomeRowSchema`
  (`libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts:42-80`). Fields include
  `laneId`, `family`, `provider`, `model`, `taskKind`, `phaseKind`, `taskId`, `verdict`
  (`delivered | no-deliverable | unverified | failed`), `failureClass`, `durationMs`,
  `inputTokens`, `outputTokens`, `costUsd`, `routingSource`, `reviseRounds`, `finalReview`
  (`approved | rejected`).
- `ptah_outcome_report` has two kinds: `deliverables` (paths, task kind) and `review`
  (`approved | rejected | revise`) (`lane-outcome.schema.ts:15-39`).
- The row has no effort field. No file in `libs/backend/lane-outcomes/src` refers to effort.
- No merge or pull request stage exists in the outcome store.
- Capacity failures (`usage-limit`, `auth`, `timeout`) are left out of the rates
  (`matrix/local-derivation.ts` `CAPACITY_FAILURE_CLASSES`).
- Routing reads `LaneOutcomeSummary`, which "Holds no text"
  (`libs/shared/src/lib/types/lane-outcome.types.ts:122-140`).
- The System One payload receives outcome figures keyed by `[laneId, taskKind]` only, with
  `delivered` and `failed` counts (`matrix/outcome-figures.ts:17-45`,
  `decision-model/decision-payload.ts:42-47`).
- System One performance data today is only an in-memory prefill throughput rate per target
  (`pipeline/prefill-rate.store.ts`). Nothing records whether a System One proposal led to a
  good outcome.

### C5. How effort is chosen today

- Tier and effort come from rule tables by phase kind and weight, rules `R1`-`R5`
  (`pipeline/tier-effort-policy.ts:29-40`). Outcomes do not change the effort.
- The route result carries `effort` (`contracts/route-decide-result.schema.ts:202`, `:237`).

### C6. Visibility that exists today

- Electron settings show the capability matrix and a decision matrix page
  (`libs/frontend/chat/src/lib/settings/ptah-ai/capability-matrix-setting.component.ts:58`,
  `decision-matrix-page.component.ts`), fed by `AgentGetCapabilityMatrixResult`.

### C7. Evidence in this task

- The Gate 0.1 roster for this task shows `claude` and `codex` rows with `model: lane-default`,
  `provenance: lane-default` and `models unknown`. The `ptah-cli` Ollama row shows the
  configured model `glm-5.3:cloud` with sample count 14 (context.md).

---

## Classification

- **Type:** FEATURE.
- **Estimate:** XL. The change crosses at least `shared` (outcome types), `lane-outcomes`
  (row schema and a store migration), `cli-agent-runtime` (actual model and effort at
  completion), `rpc-handlers` (catalog adapter), `lane-routing` (score and choice) and
  `libs/frontend/chat` settings in the Electron renderer. It also changes a self-reinforcing
  data loop (C2), which needs a cold-start design.
- **Priority basis:** direct user request. No priority scale is set in this document.

---

## Scope

### In scope

| Item | Reason |
| --- | --- |
| Catalog discovery per lane that is not bound to the 2000 ms routing budget | C2/C3: catalogs exist but time out or are empty at route time |
| Model and effort on each outcome row, as spawned and as resolved | C2/C4: no effort, and `lane-default` hides the real model |
| Funnel stages per choice key | User asks for "funnels" (requirement of record) |
| Score and choice per provider + model + effort + task kind, system CLI lanes included | Desired outcomes 1 and 3 |
| Routed spawn passes the chosen model and effort | Without it, no per-model evidence accumulates (C2) |
| Electron settings visibility of catalog, funnel and choice reasons | User must see why a model was chosen |
| Recording System One proposal outcomes, if Q4 confirms | Requirement of record says "decision models" |

### Out of scope

| Item | Reason |
| --- | --- |
| Changes to how the main model spawns a lane with an explicit model and effort | The user states the main model can already do this |
| New provider integrations or new CLI adapters | The request is about choosing among existing providers |
| VS Code host-specific UI | CLAUDE.md: Electron first |
| Public benchmark ingestion beyond the existing seed | Request asks for real-world outcome data |
| Price lookup changes in `usage-analytics` | Cost is already on the row (C4) |
| Merge stage, unless Q1 selects it | Needs user intent |

---

## Functional areas

Each criterion is checkable by a test or by an inspection of a route result.

### FA1. Model catalog discovery

- **Actor/system:** Ptah host, for each installed lane and each configured `ptah-cli` provider.
- **Capability:** Ptah keeps a current model catalog per lane without manual entry. Routing reads
  it within the existing routing budget.
- **Outcome:** A routed row lists the lane's models with provenance, and with efforts where the
  lane reports them.

Acceptance criteria:

1. Normal: for each lane with a listing source in C3, a route call after discovery returns the
   lane's models with provenance `reported`, `fallback` or `configured`.
2. Normal: a route call does not wait longer than today's `MODEL_LISTING_BUDGET_MS` for a lane
   whose catalog is already known.
3. Dependency failure: when a catalog fetch fails or times out, routing uses the last known
   catalog. The reason names the lane, the failure status and the age of the catalog.
4. Dependency failure: with no catalog ever read, the row keeps today's behavior
   (`lane-default`, `models unknown for <lane> (<status>)`).
5. Change: a model that leaves the catalog is no longer a choice for new routes. Its past
   outcomes stay in the store and stay visible.
6. Change: a model that enters the catalog is a choice with zero samples (see FA4.4).
7. Invalid: an empty or blank model id from a source is not listed (keeps
   `lane-model-listing.adapter.ts:136-139`).
8. Privacy: no host text (error body, URL, key) reaches a route result or a log line (keeps
   `decision-model.catalog.ts` rule).

### FA2. Outcome records with model and effort

- **Actor/system:** lane completion recorder and `ptah_outcome_report`.
- **Capability:** each run row records the provider, the model as requested, the model as
  resolved where the lane reports it, and the effort.
- **Outcome:** outcomes can be grouped by provider + model + effort + task kind.

Acceptance criteria:

1. Normal: a lane spawned with model M and effort E records M and E.
2. Normal: a lane spawned without a model records `lane-default` as requested and the resolved
   model when the lane reports it.
3. Unknown: when the lane does not report a resolved model or an effort, the row stores an
   explicit unknown value, not a guess.
4. Migration: rows written before this change stay readable. They count under today's keys
   (family profile `*` for `lane-default`).
5. Privacy: the summary that routing reads still holds no text
   (`lane-outcome.types.ts:122`).

### FA3. Funnel stages per choice

- **Actor/system:** outcome store and its reader.
- **Capability:** for each choice key (provider + model + effort + task kind), the reader gives
  counts for ordered stages from spawn to the last recorded stage.
- **Outcome:** a choice shows where runs drop out, for example limit, failure, no deliverable,
  revise, rejected.

Acceptance criteria:

1. Normal: the reader returns per-stage counts for at least: spawned, completed without a
   capacity failure, delivered, review approved. The architecture phase fixes the final list.
2. Normal: `revise` rounds are visible per key (data exists in `reviseRounds`).
3. Normal: capacity failures (`usage-limit`, `auth`, `timeout`) show as their own drop-out and
   do not lower the quality rates (keeps `CAPACITY_FAILURE_CLASSES`).
4. Normal: duration, tokens and cost per key are available as aggregates where the row has them.
5. Zero data: a key with no runs returns zero counts, not an error.
6. Invalid: a review report for an unknown run is rejected, as today.
7. Window: funnel counts use the same outcome window as the score, so the two agree.

### FA4. Score and choose provider + model + effort

- **Actor/system:** `ptah_route_decide` ranking.
- **Capability:** ranking scores each listed model and effort of a lane from FA3 evidence and
  chooses one per phase. System CLI lanes are included.
- **Outcome:** a routed lane can run a non-default model when evidence supports it.

Acceptance criteria:

1. Normal: with enough evidence that model M at effort E beats the lane default for a task kind,
   the route result names M and E for that lane, with a provenance that is not `lane-default`.
2. Normal: a `codex` (system CLI) row can get a non-default model (today blocked by
   `score.ts:129`, see Proposed Removals).
3. Normal: with no evidence, the result is the same as today for that lane.
4. Zero samples: a model with zero samples gets a bounded chance to run, so evidence can start.
   The bound is set by the architecture phase and is visible in the reason.
5. At limit: a lane at limit is excluded before scoring, as today (`score.ts:217`). Its models
   are not chosen.
6. Model gone: a model missing from the current catalog is not chosen, even with a high score.
7. User control: a user pin or user rule still wins over a learned score (keeps the `user`
   prior precedence in `score.ts:209`).
8. Determinism: the same inputs and clock give the same choice (keeps the pure `score` rule,
   `score.ts:4`).
9. Explanation: the reason and trace name the model, the effort, the sample count and the
   evidence source for each chosen row.

### FA5. Route result to spawn

- **Actor/system:** the coordinator that spawns from a route result.
- **Capability:** the chosen model and effort travel to `ptah_agent_spawn` and to the outcome
  row.
- **Outcome:** the evidence loop closes: a routed run adds evidence to the key it ran under.

Acceptance criteria:

1. Normal: a lane spawned from a route result records the routed model and effort and its
   `routingSource`.
2. Invalid: a lane that rejects the model at spawn fails with a classified failure. The failure
   counts against that model key, not against the family.
3. Override: an explicit model or effort from the main model at spawn wins and is recorded as
   such.

### FA6. Visibility in the Electron settings (lane-proposed; basis: C6 matrix page and the Q3 off setting)

- **Actor/system:** user in the Electron app (`apps/ptah-extension-webview` renderer).
- **Capability:** the user can see per lane the discovered models, the funnel per key, the
  current score and why routing chose a model.
- **Outcome:** the user can check and correct the routing with evidence.

Acceptance criteria:

1. Normal: the capability matrix area shows rows per model, not only per family, with sample
   count and age.
2. Normal: the user can see funnel counts per key.
3. Dependency failure: a lane whose catalog failed shows the failure status and the catalog age.
4. Zero data: a model with no runs shows "no samples", not a score of 50 presented as measured.
5. The page is checked in Electron with a screenshot (CLAUDE.md).

### FA7. System One decision model outcomes (conditional on Q4)

- **Actor/system:** route call that uses System One, and the outcome store.
- **Capability:** each routed phase records whether System One proposed the choice, which
  decision model proposed it, and the later outcome of that phase.
- **Outcome:** the user can compare decision models by the outcomes of their proposals.

Acceptance criteria:

1. Normal: a phase routed from a System One proposal records the decision model id and the
   proposal confidence (`modelProposal`, `contracts/route-decide-result.schema.ts:66-72`).
2. Normal: the outcome figures that System One receives can include model and effort, not only
   `[laneId, taskKind]`.
3. Dependency failure: when System One times out (as in this task's pre-flight, decisions.md
   row 1), the phase records no proposal, and the fallback cause stays visible.
4. Privacy: no prompt text or brief text is stored with the proposal outcome.

---

## Non-functional requirements

Only evidenced limits are listed. The architecture phase sets any new number.

| Area | Requirement | Evidence |
| --- | --- | --- |
| Routing latency | A route call stays within `ROUTE_DEADLINE_MS` (gate-0.1 8000 ms, pre-flight 4000 ms) and per-row listing within `MODEL_LISTING_BUDGET_MS` 2000 ms | `routing-constants.ts:46`, `:169` |
| Determinism | Score stays pure: no clock, I/O or randomness inside `score` | `ranking/score.ts:4` |
| Storage growth | Outcome storage grows at most with the number of runs and reports. Catalog storage is bounded by the number of lanes and their listed models | One row per `runId` (`local-derivation.ts` `dedupeByRun`) |
| Privacy | Routing inputs hold no text. No host text, keys or URLs reach results or logs | `lane-outcome.types.ts:122`, `decision-model.catalog.ts` header |
| Hosts | Electron first. Keep provider CLI lanes, `platform-cli` and `cli-engine` working | CLAUDE.md |
| Data window | Rates use the 90-day outcome window and the 180-day staleness rule unless the architecture phase changes them with evidence | `routing-constants.ts:211`, `:223` |

---

## Stakeholders

| Stakeholder | Interest |
| --- | --- |
| User (repository owner) | Better model choice per phase, lower waste, visible reasons |
| Main orchestrating model | Gets a roster with real model and effort choices |
| CLI lane providers (codex, claude, grok, antigravity, ptah-cli providers) | Receive explicit model ids, and must accept them |
| Benchmark (`platform-cli`, `cli-engine`) | Shares lane runtime; must keep working |
| Electron renderer users | See the catalog, funnel and reasons |

---

## Risks

| Risk | Owner | Mitigation |
| --- | --- | --- |
| Exploration runs an expensive or weak model on real work | architecture phase | Bound exploration (FA4.4). Make the bound visible. User pins win (FA4.7) |
| Cold start: today's records are almost all `lane-default` (C2), so per-model data starts at zero | architecture phase | FA2.2 resolved-model capture, FA4.4 bounded exploration |
| A CLI resolves a different model than requested, which spoils the key | implement phase | FA2.2/FA2.3: store requested and resolved, mark unknown |
| Catalog probes (`grok models`, `agy`, `opencode`, `pi`) spawn processes and cost time | architecture phase | Discovery outside the route budget (FA1.2) |
| Schema migration of the outcome store breaks old rows | implement phase | FA2.4 backward reads, tests on old rows |
| Removal of the system CLI promotion block changes routing for every system lane | architecture phase | Proposed Removals; FA4.3 same result without evidence |
| Small samples give noisy scores | architecture phase | Keep the prior blend (`BLEND_PRIOR_WEIGHT`) and the learned cap, or justify a change |

---

## Open questions

Only user-intent questions. Each has a recommendation.

1. **Q1. Last funnel stage.**
   - A: Stop at "review approved" (data exists today).
   - B: Add "pull request merged" from GitHub data.
   - **Recommendation:** A in this task. Add B as a later task, because merge data needs a new
     source and a join from run to pull request.
2. **Q2. Effort as a scored dimension.**
   - A: Score model and effort together. The rule table (`tier-effort-policy.ts`) stays the
     default when there is no evidence.
   - B: Score only the model. Effort stays rule-based.
   - **Recommendation:** A. The user names "model effort" together, and FA2 records effort anyway.
3. **Q3. Authority of the automatic choice.**
   - A: Routing chooses a non-default model by itself, with a setting to turn it off.
   - B: Routing only suggests. The default model runs until the user accepts.
   - C: Opt-in setting, default off.
   - **Recommendation:** A. The request says "it doesn't have to be always the same model".
     The setting keeps a way back.
4. **Q4. System One decision model.**
   - A: Record System One proposal outcomes (FA7) and show them. Do not change decision model
     selection automatically.
   - B: Also pick the decision model from those outcomes.
   - C: Leave System One out of this task.
   - **Recommendation:** A. It answers "back up the decision models" with evidence first, at low
     risk.

---

## Handoff

1. `document-review`: check this document against the code citations.
2. `research`: needed, narrow. Questions: which CLIs report the resolved model and effort at
   completion (codex app-server, claude SDK, grok, antigravity, ptah-cli providers), and which
   accept a per-spawn effort. The answer decides FA2.2/FA2.3 coverage per lane.
3. `architecture`: needed. Design the catalog snapshot and refresh, the outcome key and
   migration, the funnel reader, the exploration bound, the change to `score.ts:129`, and the
   settings data contract.
4. Then `batch`, `implement`, `review`, `tests`, `completion` as in context.md.

---

## Proposed Removals

| Surface | Today | Proposed | Reason |
| --- | --- | --- | --- |
| System CLI promotion block | `ranking/score.ts:129-131` never promotes a listed model for a system CLI lane | Allow promotion for system CLI lanes when FA4 evidence supports it | Desired outcome 1. Codex rows cannot leave `lane-default` today |

No other existing surface is removed. The rule table in `tier-effort-policy.ts` stays as the
default for effort (Q2).

---

## Decisions

| # | Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- | --- |
| P1 | Treat the main model's explicit spawn as out of scope | change it / keep it | User says the main model can already do it | yes |
| P2 | Discovery must not depend on the 2000 ms route budget | route-time only / snapshot plus refresh | `models unknown` in this task's roster; `gather.ts:501-537` | yes |
| P3 | Record requested and resolved model separately | one field / two fields | `lane-completion-outcome.ts:62` records only the spawn argument | yes, before migration ships |
| P4 | Keep capacity failures out of quality rates, show them as funnel drop-out | count / exclude / separate | `CAPACITY_FAILURE_CLASSES` in `local-derivation.ts` | yes |
| P5 | List the `score.ts:129` change under Proposed Removals, not as silent change | silent / proposed | Task rule: do not remove existing behavior silently | yes |
| P6 | Estimate XL | L / XL | Six projects plus a store migration and a renderer page | yes |
| P7 | Research phase is needed but narrow | skip / narrow / broad | Resolved-model and effort reporting per CLI is not proven in code read here | yes |

---

## Gate 1 resolution (orchestrator, 2026-11-25)

- Review: `task-description-review.md`, Ollama Code lane (ollama-cloud family), verdict APPROVED,
  round 1. Findings 1-3 (citation ranges, FA6 label) are applied in this revision 2.
- User answers to the open questions (all recommended options):
  - Q1: A. The funnel ends at "review approved". "Pull request merged" is a later task.
  - Q2: A. Score model + effort together. `tier-effort-policy.ts` stays the default without
    evidence.
  - Q3: A. Routing chooses a non-default model automatically. A setting turns it off.
  - Q4: A. Record System One proposal outcomes and show them. No automatic decision-model
    selection. FA7 is in scope.
- Proposed Removal (`ranking/score.ts:129-131`): approved through the Q3 answer. With the off
  setting, the block behavior stays available (decisions.md row 10).

---

## FA8. Native-source fidelity (user-requested, 2026-11-25, revision 3)

User words: "we need to fix the effort dropout we make in ptah ... every value should be
populated from their original lane to make sure their api is verified without much efforts from
our side".

- **Actor/system:** each lane adapter, the catalog snapshot (FA1), the outcome row (FA2).
- **Capability:** every model, supported-effort, default-effort, resolved-model and
  resolved-effort value that a lane's own API or CLI reports is carried through unchanged. Ptah
  does not strip it and does not replace it with a Ptah-side table.
- **Outcome:** routing and scoring use the vendor's own verified values. Ptah keeps no
  hand-maintained effort list for a lane whose API reports one.

Known dropout points to fix (evidence: research-report.md, verified by the orchestrator):

1. `claude-cli.adapter.ts:167-172` maps native models to `{ id, name }` only and drops
   `supportsEffort` / `supportedEffortLevels`. `laneEfforts()` (`:163`) returns the fixed
   `EFFORT_LEVELS`.
2. Codex app-server per-model `supportedReasoningEfforts` and default effort are reduced to an
   ID-only list. The session `reasoningEffort` from `thread/start` / `thread/resume` is not kept.
3. ACP lanes (grok, antigravity): the current model and current effort config value from the
   session are not exposed as resolved values.
4. Pi: the session thinking state from RPC is discarded.
5. Static effort mappings in `lane-spawn-policy.ts` (for example minimal -> low, max -> xhigh)
   and fixed lane-wide effort lists (copilot, antigravity static menu) apply even when the lane
   reports its own per-model efforts.

Acceptance criteria:

- FA8.1 When a lane's catalog reports supported efforts or a default effort for a model, the
  catalog snapshot holds those exact values for that model, with provenance `native`.
- FA8.2 When a lane reports a resolved model or a resolved effort during or at the end of a run,
  the outcome row holds that exact value, with provenance `native`.
- FA8.3 When a lane reports nothing for a value, the snapshot or row holds an explicit unknown
  (not a Ptah guess). A Ptah fallback value, where one is still needed to spawn, carries
  provenance `ptah-fallback` and is never shown or scored as native.
- FA8.4 A requested effort that the lane's own per-model list does not contain is not silently
  mapped. The route result and the spawn record state the requested value, the value sent and the
  reason.
- FA8.5 Each existing effort mapping or fixed list is kept only as the labeled fallback for a
  lane that reports no native list. Any removal of a mapping is listed under Proposed Removals.
- FA8.6 Version-sensitive points (copilot `--effort` vs `--reasoning-effort`, pi and ACP effort
  state) come from what the installed CLI reports, not from a Ptah assumption about its version.

---

## FA9. Seed format ready for public benchmark sources (user-requested, 2026-11-25, revision 4)

User question: which initial sources give new users "a real up to date matrix". User decisions:
this task makes the seed format ready; a follow-up task builds the CI job that pulls benchmarks.
Only sources with a verified license that allows redistribution may be used.

- **Actor/system:** the shipped seed matrix (`matrix/seed-matrix.ts`), its schema and loader.
- **Capability:** a seed value can name its source, the source's license, the fetch date and the
  benchmark row it came from. A seed value can be keyed by model and effort (same key as FA4).
  An alias map joins benchmark model names to lane catalog model ids.
- **Outcome:** a later CI job can publish a richer seed without a code change in routing.

Acceptance criteria:

- FA9.1 Each seed cell carries `source` id, `license` id, `fetchedAt` and a source row reference.
  A cell without them fails seed validation (spec test).
- FA9.2 A seed cell can be keyed by `[family, model, effort, taskKind]`. An existing seed without
  effort maps to the effort bucket that FA2 uses for old rows.
- FA9.3 An alias map (data, not code) maps a benchmark model name plus effort to one or more
  lane catalog ids. A benchmark row with no alias match is dropped and counted, never guessed.
- FA9.4 The seed stays a prior only. Local outcomes take over as FA4 describes. The architecture
  states whether `LEARNED_DELTA_CAP` lets local evidence overrule a strong seed prior, and how.
- FA9.5 No value is carried from one task kind to another (existing rule, seed-matrix.ts header).
- FA9.6 Routing makes no network call for the seed in this task. The current shipped seed keeps
  working unchanged.

Out of scope here (follow-up task): the CI fetch job, the published JSON, the in-app download,
the license checks per source, and any new benchmark data.
