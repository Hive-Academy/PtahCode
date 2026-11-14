# Lane Assignment

When orchestration work runs on CLI lanes instead of (or under) subagents: who may spawn, what each
kind hands off, what never goes to a lane, and how to run phases — up to a whole task — on lanes.
How to run any lane (discovery, addressing, prompts, resume, review, revise cap) is the
[agent-lanes skill](../../agent-lanes/SKILL.md); nothing here repeats it.

---

## Who spawns

| Actor               | May spawn                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Orchestrator**    | Every subagent, every batch executor (subagent or lane), every lane a phase is assigned to                                                                    |
| **Team-leader**     | Nothing. It recommends executors in `batches.md`; you act on them                                                                                             |
| **Other subagents** | CLI lanes for their own sub-tasks, when Gate 0.1 left lanes `enabled` or `auto` and the kind is not on the never list below. They own what their lanes return |

## Gate 0.1 outcome

If `ptah_route_decide` is listed, make the initial `stage:'gate-0.1'` call with the planned phases, the user
`request`, chosen `taskType` and `depth`, and `phases` (`id`, `kind`, optional `role`,
`reviews`, `shape`, `weight`). After the `batch` kind writes `batches.md`, make one more `stage:'gate-0.1'` call with one phase per batch, its shape and weight, and the same preferences. Re-key each user pin to the `id` of the batch phase it covers. A current user pin still wins. `shape` is
`mechanical|logic|contract|test|docs|review`; `weight` is the integer 0-200000 token
estimate for the batch read and write sets from `ptah_count_tokens`, plus 10% framing.
Pass explicit user `pins` and known `preferenceSource`/`preferences` when
available. Use `roster` entries with `status:'chosen'` to
select the reported executor and model; an `unavailable` entry follows the existing
disclosed fallback. Show phase, executor, model, reason, source and confidence (`—`
for null), plus `overallSource`, `overallConfidence` and reasons. Record the result
in `decisions.md` with stage, source, confidence, reasons, fallback cause and any
low-confidence model proposal. If the tool is not listed, skip it silently and use
the live-list rules below.

Each chosen roster row returns `executor`, `model`, `tier`
(`haiku|sonnet|opus`), `effort` (`low|medium|high|xhigh|max`) and a `reason` ending
`policy Rn; tier ..., effort ..., shape ..., weight ...`. For subagent Agent/Task calls,
pass `tier` as per-call `model` alias and `effort` where host and model support it.
Keep frontmatter `model:` as the phase-kind default; record requested vs observed model
when observable. In supported Claude Code versions, model precedence is call ->
frontmatter -> `CLAUDE_CODE_SUBAGENT_MODEL` -> parent; `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`
and `CLAUDE_CODE_EFFORT_LEVEL` can override. For system CLI rows other than `claude`,
`model` is `lane-default` unless the decision chose an exact ID from that CLI's live
model list (`source: model`); unavailable rows have null. Deterministic ranking uses
`lane-default`. Pass a concrete row `model` as spawn `model`; omit it for `lane-default`.
For ptah-cli and `cli: "claude"` rows, pass `tier` as `modelTier`, not row `model`.
Pass row `effort` as spawn `effort` when present; it overrides the per-CLI effort setting.
A user-pinned lane/model wins. Never invent a model id. System CLI resolution is request
`model` -> `agentOrchestration.<cli>Model` setting -> native CLI default.

Record it in `context.md` under `## CLI Lanes`: the preference source, mode (`enabled` / `auto` / `disabled`), the
approval mode (`Approval: lane-review` / `Approval: user`, per
[checkpoints.md § Approval mode](checkpoints.md#approval-mode)) and the `ptah_agent_list` rows verbatim. Then, for `enabled` or `auto`, add this block to every subagent
prompt except batch phase:

```markdown
## CLI Lanes

Mode: <enabled — delegate bounded work by default | auto — delegate when it clearly helps>
Discovered lanes: <the ptah_agent_list rows>
Run lanes per the agent-lanes skill. You own the synthesis: verify lane output before it enters your deliverable.
```

For `disabled`, add nothing and never spawn a lane. Required reviews then use the disclosed same-side
fallback (agent-lanes §6) and the user approves each document gate; in `auto`, required reviews
count as useful lane work.
With `enabled` and a capable spawnable row, scoped tests, research and reviews default to lanes.
The live `ptah_agent_list` rows decide capability and availability; `AT LIMIT` is unavailable
even if its reset reads `reset unknown`.

## Batches on lanes

A CLI lane is the default executor for every bounded batch, sequential or parallel, when the batch
fits the cap and a capable lane is spawnable. Parallel batches still require independent,
file-disjoint tasks. A subagent executor must carry a `Subagent reason`. You spawn and merge
parallel lanes: [phase mode compatibility](team-leader-modes.md#spawning-a-batch-executor).

## What each kind hands off

| Phase kind                               | Hands to a lane                                              | A task line that works                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `plan`                          | Codebase surveys, dependency and file-structure analysis     | "List every component under `<dir>` grouped by feature. Markdown table: name, path, inputs."           |
| `architecture`                       | Pattern analysis in named modules, dependency checks, spikes | "In `<dir>`, list every DI token, its type, and where it is provided. Flag circular-dependency risks." |
| `implement` (backend/front-end)    | Test scaffolding, boilerplate inside the batch               | "Create unit-test scaffolding for `<Class>` in `<absolute path>`: one describe per public method."     |
| `implement` (infrastructure)                          | Config and script generation                                 | "Write a multi-stage container file that installs with `npm ci`, builds, and ships a minimal image."   |
| `tests`                            | One lane per module for test generation                      | "Write unit tests for `<file>`: happy path and error cases for every public method."                   |
| `review` (style/logic) | One lane per file across many files                          | "Review `<file>` for naming, error handling and type precision. Numbered issues with line references." |
| `research` (technical unknown)                        | Separate aspects of one question in parallel                 | One lane on the external API surface, one on how this codebase already uses it.                        |
| `research` (modernization)                   | One lane per module                                          | "Analyze `<dir>` for deprecated APIs and outdated patterns. Prioritized list."                         |
| `docs`                 | Feature research and section drafts                          | "Read `<dir>` and summarize its capabilities and integration points for developer docs."               |

## Capability rule and lane limits

The router does not refuse a lane by phase name. A phase that needs a capability goes to a
candidate whose effective tool list has it: `visual-review` and `design` need `browser` (a
`ptah_browser_*` tool). A candidate without it is not selected. When no candidate has it, the
router stops the phase with a clear reason (`missing-capability` or `capability-unknown`); it
does not fall back to an incapable candidate. A pin to an incapable candidate gives
`pin-unavailable` with the reason.

These items stay off lanes for other reasons:

- Requirements and plans that pass Gate 1 / Gate 2 (`task-description.md`, `implementation-plan.md`) as a
  subagent's _own_ deliverable — lanes may gather inputs, the subagent writes and owns the document.
  A phase assigned wholly to a lane (below) is the exception, and still passes Gate 1 / Gate 2.
- Git commits, and anything that asks the user.
- `design` discovery with the user — it is interactive. A lane can do the non-interactive design
  work when it has the `browser` capability.
- Final security-critical decisions. A lane document review may approve Gates 1, 1.7 and 2 in
  `lane-review` mode ([checkpoints.md § Approval mode](checkpoints.md#approval-mode)); in `user`
  mode its findings are advisory and you present them at the user gate. A review that needs
  evidence or tools the lane lacks states that limit and uses the agent-lanes §6 fallback instead of
  asserting approval. Design document review checks the spec, prototype and supplied evidence; it
  does not replace the browser-based visual review of the built UI.

---

## Assigning phases to lanes

Any phase can run on a lane instead of a subagent: PM, architect, a batch, a review. When every
authoring phase is a lane, the whole task runs on external lanes — a relay. Document reviews for
Gates 1, 1.7 and 2 use an independent reviewer on the opposite execution side unless a disclosed
fallback or a user-pinned same-side reviewer applies (agent-lanes §6). Shipping-code reviews use
an independent capable reviewer from a different family than the implementer when available. A whole-phase
lane still respects the batch cap (≤6 files, ≤2 libs, one scoped verification per batch). Lanes
have no tool-call ceiling; Ptah stops a lane only on a repeated-call loop (agent-lanes §8), so work
is split by scope, not by call count: an implement phase larger than one batch is spawned as
several sequential lanes, each with its own file list, not one long lane. Each lane writes its
deliverable early as a skeleton and fills it in as it goes, so any stop leaves usable output.

| Phase           | Deliverable                                                                                     | Default lane when the user names none                                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan`          | `task-description.md`                                                                           | A strong-reasoning lane                                                                                                                              |
| `architecture`  | `implementation-plan.md`                                                                        | A strong-reasoning lane                                                                                                                              |
| `implement`     | code in place + a report with evidence per task; **you** record `batches.md` after verifying it | A capable coding lane in the live list                                                                                                               |
| `review`        | `code-logic-review.md`                                                                          | An independent capable lane from a different family than the implementer; same-family exception requires a specific reason and weaker-evidence label |
| `document-review` | `<artifact-stem>-review.md` per plan, design and architecture artifact                          | The opposite execution side from the author, with the disclosed fallback in agent-lanes §6                                                           |

### Live phase-kind roster

- **Pinned** by the current user → resolve the requested lane against `ptah_agent_list` and use it
  when spawnable and capable. If the named lane is absent, stop and ask; do not invent a row.
- **Not pinned** → choose a live row by capability and availability. For shipping-code review,
  select a different family from the implementer. For document review, select the opposite execution
  side from the author. Record `Review family` and the actual author/reviewer families.
- Record `phase → lane → model` in `context.md` and announce it as a table before spending.

Fill this roster from current `ptah_agent_list` rows, not a fixed vendor list:

| Phase        | Live lane row                | Spawn args from row                       | Deliverable              |
| ------------ | ---------------------------- | ----------------------------------------- | ------------------------ |
| `plan`       | `<spawnable capable row>`    | `<listed identifier and supported model>` | `task-description.md`    |
| `architecture` | `<spawnable capable row>`    | `<listed identifier and supported model>` | `implementation-plan.md` |
| `implement`  | `<spawnable capable row>`    | `<listed identifier and supported model>` | code + report            |
| `review`     | `<independent eligible row>` | `<listed identifier and supported model>` | `code-logic-review.md`   |

For shipping code, try `other family same capability`, then `same family other provider/model`,
then an independent `subagent` when no eligible lane can review. The latter two require a
specific exception reason and a weaker-evidence label. Record `Subagent reason` when falling back
to a subagent; never claim an unavailable review occurred. An in-process subagent reviewing code
written by an in-process subagent of the same family also needs the reason and label. For document
Gates 1, 1.7 and 2, keep the opposite-side protocol in [checkpoints.md](checkpoints.md#cross-side-review-protocol):
a same-side review goes to the user rather than approving the gate in `lane-review` mode.

### Constraints that survive pinning

1. The review lane is never the implement lane — review independence per agent-lanes §6.
2. Every gate stays with you: Gate 1 after the plan, Gate 2 after the architecture, approved before
   the next phase — by the cross-side reviewer in `lane-review` mode, by the user in `user` mode or on
   escalation. A lane returning `## Clarifications Needed` goes through Gate SR.
3. A phase you write in-process, because no suitable lane exists, is labelled as not an outside
   opinion in the summary.
4. Every plan, design and architecture artifact gets a cross-side document review before its gate
   (agent-lanes §6). A pinned roster that names no reviewer still gets one; the writer never
   reviews its own artifact.

### Flow

1. Create the task folder ([task-tracking.md](task-tracking.md#new-task)), or use the one the
   prompt says already exists.
2. Announce the roster, phase count and call count; get the go-ahead — this writes code.
3. For each phase in order: invoke the author with the prior approved artifact as an absolute input
   path, run the required independent review, pass the gate per the approval mode, then pass the
   approved artifact on.
4. Implement runs in place on the active branch. Use a worktree only if you fan one phase out to
   several lanes; say so and the added cost.
5. When the implement phase is the risky one, run implement + review as the `tribunal` skill's
   Crucible loop instead of a single review pass.
6. Verify with the project's typecheck, tests and lint; if review found a real defect, send it back
   per agent-lanes §6. Summarize which lane produced what, link every artifact, present the diff.
   Never commit without the user.
