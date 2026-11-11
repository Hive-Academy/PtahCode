# Implementation Plan — TASK_2026_896_9339

## Change log

- **2026-11-10 user correction: no tier map for system CLIs; routed per-call model from the
  live catalog.** Tiers (`opus`/`sonnet`/`haiku`) stay a Ptah CLI concept (ptah-cli providers,
  and `cli: "claude"` as today). A system CLI has one default model (the
  `agentOrchestration.<cli>Model` setting, else the native default). The routing decision can
  choose a concrete model id from the CLI's live catalog, and the orchestrator passes it as the
  existing `model` argument of `ptah_agent_spawn`. Design D1-D3 of the first revision (tier
  policy, tier catalog service, `tier-map` model source) is withdrawn. Its files are removed.
- 2026-11-10 re-validation against `main` (187 commits after the first plan):
  - Still valid: weak or absent catalog keeps the CLI default; a resumed lane keeps its session
    model; "actual" model is logged only from runtime evidence, else `unobserved`.
  - Already on `main`: `ptah_route_decide` roster rows carry `model`, `tier`, `effort`,
    `provenance`; `LaneModelListing` port and adapter; the decision model answers with a label
    of an offered (lane, model) option, so it cannot invent an id; the spawn schema forwards
    `model`, `modelTier`, `effort`; the `Lane policy` log line.

## What is missing on `main` (the scope)

1. Each lane offers only ONE model to the decision model (the scored model). The decision model
   can refine the lane, not the model of a lane.
2. `score.ts` can promote a listed model of any provenance. A curated fallback id is not live
   catalog evidence and must not become a routed model of a system CLI lane.
3. `CliModelListService.listForClassification` marks every Cursor and OpenCode row as fallback,
   also when the CLI reported the rows.
4. The skills say the roster `tier` and `effort` are advisory. They do not say to pass the row
   `model`.
5. The spawn log does not record requested and actual model.

## Mandatory rules for every batch

Verify only with `npm run verify -- -p <projects>`. Never run `build`, `serve`, `dev`, `e2e` or
`package` targets, and no workspace-wide checks. Never run `npm install`. Do not raise
degradation-audit baselines. No `any`, `@ts-ignore` or `as unknown as`. Zod at boundaries.
Injected `Logger` only. No commit, push or PR from a lane. No git command that discards
changes. Electron first; `platform-cli` and `cli-engine` must still compose. Known unrelated
local failure: 2 tests in `libs/backend/auth-providers` `codex-account-usage.service.spec.ts`.

## Design

### R1. Router offers a lane's live models (`libs/backend/lane-routing`)

- **No deterministic model for system CLI lanes (review fix).** For a system CLI candidate
  other than `claude`, `score()` does not promote a listed model: the deterministic row keeps
  `lane-default` (the setting or the native default runs). Only listed models with provenance
  `reported` can be offered as an alternate. Ptah CLI, `claude` and subagent rows keep the
  present behavior.
- **Alternates.** For each ranked system CLI lane of a phase, deterministic code adds at most
  `LANE_MODEL_ALTERNATES_CAP = 2` more options `(same lane, other reported model id)` inside the
  closeness band, by score and then in the order of the catalog. No model id is hardcoded. The score of an alternate is the matrix cell
  of that id (the family profile when the id has no profile).
- **Order.** The primary option of each ranked lane stays first, in the present order (rotation
  pick first). Alternates follow. A request that does not fit drops the alternates of all phases
  before it reduces the primary width, so an alternate never costs a lane or the request. `OPTIONS_PER_PHASE_CAP`, the byte cap and the decision
  timeout do not change.
- **Deterministic default.** Without a decision model, or on timeout, error or an invalid
  answer, the result is the present result: the first option (scored model or `lane-default`).
  An alternate is chosen only by a valid decision-model answer.
- **When a question is sent.** A phase is asked when it has at least `MIN_OPTIONS_PER_PHASE`
  options inside the closeness band. Alternates count, so one eligible lane with a live catalog
  can get a model choice. Such a phase (fewer than two primary options) resolves with
  `source: ranking` and no fallback cause when no valid answer exists.
- **Validation.** The answer is a label `oN`; the code maps it to the offered option. An
  unknown label is dropped and the default is used (present behavior). Hard constraints
  (implementer is never the reviewer, AT LIMIT exclusion, batch cap) stay in code and apply to
  the lane of the chosen option.
- **Roster row.** `model` = the chosen exact id, or `lane-default`. For a system CLI row the
  provenance of a routed model is `reported`. The row schema does not change.

### R2. Catalog provenance (`libs/backend/rpc-handlers`, `libs/backend/cli-agent-runtime`)

- `CliModelInfo` gets `readonly isFallback?: boolean`; `CursorCliAdapter.FALLBACK_MODELS` rows
  set it (done by the stopped B2 lane; kept).
- `CliModelListService.listForClassification`: Cursor rows keep their own `isFallback` flag;
  OpenCode rows are `reported` when the id has the `provider/model` shape (`opencode models`
  returns an empty list on failure). Codex and Copilot logic does not change.
- Remove the withdrawn files `cli-tier-model-policy(.spec).ts`,
  `cli-tier-catalog.service(.spec).ts` and the `CLI_TIER_CATALOG` token and registration.

### R3. Requested and actual model log (`libs/backend/cli-agent-runtime`)

- No new resolution rule: request `model` -> `agentOrchestration.<cli>Model` -> native default.
- `Lane policy` line adds `requestedModel` (max 128 chars, or `none`), `requestedTier`,
  `requestedEffort`, `routingSource` (or `none`).
- At the terminal status, one `Lane model outcome` line: `agentId`, `cli`, `requestedModel`,
  `selectedModel`, `modelSource`, `selectedEffort`, `actualModel`. `actualModel` comes only
  from a model id that the adapter reported for this lane; else the string `unobserved`. The
  selected model is never copied into `actualModel`. Scope: system CLI lanes (`doSpawnSdk`).
  Ptah CLI lanes resolve the model in the provider tier mapping and get no model log.

### R4. Contract text

- Both `agent-lanes/SKILL.md` copies, section 2, and the orchestration skill (Gate 0.1 and
  `references/lane-assignment.md`, both copies): for a system CLI row pass the row `model` on
  `ptah_agent_spawn` when it is a real id (not `lane-default`), and the row `effort` as
  `effort`; pass the row `tier` as `modelTier` only for ptah-cli and `cli: "claude"` rows; a
  user-pinned spawn args line wins over the routed model.
- `modelTier` descriptions keep "other system CLIs ignore it".

## Batches (file-disjoint)

| Batch | Write set | Verify |
| --- | --- | --- |
| R1 router | `libs/backend/lane-routing/src/lib/**` | `npm run verify -- -p @ptah-extension/lane-routing` |
| R2+R3 runtime | `cli-agent-runtime` (removal, `agent-process-manager.service.ts` log, specs), `rpc-handlers` `cli-model-list.service.ts` + spec | `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers` |
| R4 text | skills (both copies), `vscode-lm-tools` and `shared` text | `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/shared` |

Final scoped check by the coordinator: the three sets plus `ptah-electron` and
`@ptah-extension/cli-engine` when their files or DI guard specs are affected.

## Tests (acceptance)

- R1: no listed model is promoted for a system CLI lane and a fallback row is never offered; alternates are capped
  and in catalog order; alternates follow the primary options; without a decision model the
  result equals the present result; a valid label of an alternate gives a roster row with that
  id and provenance `reported`; an invalid label gives the default; one lane with a live
  catalog gets a question; hard constraints still hold.
- R2: Cursor live rows are `reported` and fallback rows are `fallback`; OpenCode rows are
  `reported`; Codex and Copilot unchanged.
- R3: precedence request > setting > default is unchanged; `Lane policy` and
  `Lane model outcome` fields; `actualModel: 'unobserved'` without evidence.

## Out of scope (follow-up)

- Filter the effort against a model's `supportedEfforts`.
- A Settings surface for per-CLI model choice by the router.
- A change of the `cli: "claude"` tier-versus-`claudeModel` order.
- Per-model limit state. A quota failure of one model (for example Antigravity, where quota is
  per model) is recorded for the whole lane today, so the AT LIMIT exclusion removes the lane
  also when other catalog models have quota. Follow-up: record the limit per `(lane, model)`,
  keep the lane eligible and remove only the exhausted id from the offered models.
- `fitLane` repeats one identical attempt per width when no phase has alternates (re-review
  note 2). No behavior effect.
