# Task Context - TASK_2026_2328_5bd6

## User Request

> yeah i would like to start that as a new task, i'm thinking of this to be a good feature that we
> back up the decision models based on how they preform and be able to automatically grasp each
> provider and thier different model they provide so it doesn't have to be always the same model
> we set as default in our settings the main model has the ability to run the cli with any model
> effort it wants and we need to be intelligent about scoring it with real world data and funnels
> that we can build in some way ?

## Task Type

FEATURE

## Complexity

Complex (crosses lane-routing, lane-outcomes, cli-agent-runtime model listing, settings, and
possibly the Electron settings UI).

## Strategy

Software pack, Full depth: `plan` -> `document-review` -> [`research`] -> `architecture` ->
`document-review` -> `batch` -> `implement` -> `review` -> `tests` -> `completion`.
Pre-flight `ptah_route_decide` returned null for type and depth (fallbackCause `timeout`), so the
skill rule tables decided (keywords "feature", "build" -> FEATURE; unclear scope -> Full).

## Interpretation of the request (orchestrator, open to user override)

1. "Decision models" = the routing decisions that `ptah_route_decide` produces (which lane, which
   model, which effort per phase). It can also include the System One decision model itself.
2. Today a roster row for a system CLI often carries `model: lane-default` and the result says
   `models unknown` (seen in this task's own Gate 0.1 roster). Each lane runs the one model from
   settings. The user wants Ptah to discover each provider's model catalog automatically and to
   choose among those models and efforts.
3. The choice must be backed by real-world outcome data (lane outcomes, review verdicts,
   deliverable verdicts, cost, duration, limits) and by funnels (spawn -> delivered -> review
   approved -> merged, or similar), scored per provider + model + effort + task kind.

## Evidence seen at task start

- Gate 0.1 roster for this task: claude/codex rows `model: lane-default`, `provenance:
  lane-default`, reason ends with `models unknown`; ptah-cli Ollama row has a configured model
  `glm-5.3:cloud` with `sample count 14`.
- Existing libraries: `libs/backend/lane-routing` (ranking, decision-model, matrix,
  `lane-model-listing.port.ts`), `libs/backend/lane-outcomes`, `libs/backend/usage-analytics`,
  `libs/backend/cli-agent-runtime`.

## CLI Lanes

- Preference source: memory search found no stored execution preference -> `preference unknown`.
- Mode: `enabled` (spawnable capable lanes exist).
- Approval mode: `lane-review`.
- `ptah_agent_list` (2026-11-25 11:48 UTC): codex installed (room, weekly 16%); claude installed
  (limits not tracked); antigravity installed (limit reader failed); grok installed (no usage
  source); Ollama Code ptah-cli available (room); kimi code ptah-cli AT LIMIT (5-hour, resets
  15:43 UTC); copilot disabled; cursor, opencode, pi not installed.
- Gate 0.1 roster (source `ranking`):

| Phase | Executor | Model | Tier / effort |
| --- | --- | --- | --- |
| plan | lane claude | lane-default | opus / high |
| plan-review | ptah-cli Ollama Code | glm-5.3:cloud | opus / high |
| research | lane codex | lane-default | sonnet / medium |
| architecture | lane claude | lane-default | opus / high |
| architecture-review | ptah-cli Ollama Code | glm-5.3:cloud | opus / high |
| batch | lane claude | lane-default | opus / high |
| implement | ptah-cli Ollama Code | glm-5.3:cloud | sonnet / high |
| review | subagent review | opus | opus / high |
| tests | ptah-cli Ollama Code | glm-5.3:cloud | sonnet / medium |
| completion | lane claude | lane-default | opus / high |

## Conversation Summary

- The user asked to start this as a new task. The `plan` phase stated the interpretation above
  and listed four open questions.
- User answers (2026-11-25, all recommended options): Q1 funnel ends at review approved (PR
  merged later); Q2 score model + effort together, rule table is the default without evidence;
  Q3 automatic choice with an off setting; Q4 System One record + show only.
- After the research report, the user asked to stop the "effort dropout": every model and effort
  value must come from the lane's own API, not from Ptah tables. Added as FA8 (revision 3) and
  queued to the architecture lane.
