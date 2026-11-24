---
title: Agent Orchestration
description: How Ptah assigns development work to specialist sub-agents and CLI lanes, with checkpoints and verified handoffs.
---

# Agent Orchestration

The `orchestration` skill in `ptah-core` coordinates development work: classify the request, choose a workflow, assign specialists or CLI lanes, run user checkpoints, and verify the results. A phase can run on a sub-agent or a CLI lane; a whole pipeline on lanes is [Relay](/tribunal/relay/).

<video controls preload="metadata" playsinline style="width:100%;border-radius:0.5rem;border:1px solid var(--sl-color-gray-5);margin:1rem 0;">
  <source src="/assets/videos/cli-agent-orchestration.mp4" type="video/mp4" />
</video>

![Orchestration hierarchy](/screenshots/agents-orchestration.webp)

## Who does what

| Role             | Responsibility                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Orchestrator** | Owns the conversation and checkpoints; spawns sub-agents, batch executors, and phase lanes; verifies what returns.                                                           |
| **Batch phase**  | Decomposes the plan into batches, recommends executors, checks evidence, and records batch states in `batches.md`.                                                           |
| **Specialists**  | Work within their assigned scope and return deliverables with evidence. Eligible specialists may use CLI lanes for focused sub-tasks when lanes are enabled or in auto mode. |
| **CLI lanes**    | Run self-contained tasks through `ptah_agent_spawn`, using an installed CLI or a configured Ptah CLI provider.                                                               |

The `visual-review` phase uses browser tools. The `design` phase handles interactive discovery. The `batch` phase recommends work for the orchestrator to assign. No built-in agent role remains.

Specialists do not allocate task IDs or edit `task.md` or `batches.md`. They report completion and blockers; the `batch` phase records batch state. In a Relay run, the conductor verifies the implementation report and records `batches.md`.

## Choosing a workflow

The skill covers FEATURE, BUGFIX, REFACTORING, DOCUMENTATION, RESEARCH, DEVOPS, SAAS_INIT, and CREATIVE work. It chooses full, partial, or minimal depth from the request and asks when the type is ambiguous.

A feature typically runs through `plan`, optional `research` and `design`, `architecture`, `batch`, `implement`, `tests`, `review`, and `completion`. The `batch` phase recommends executors; the orchestrator spawns them and acts on each returned next action.

## Skeleton and packs

Every workflow follows one skeleton of five steps:

1. **clarify** - ask the questions that fix the scope.
2. **plan** - decide the work and the order.
3. **do** - make the change or the document.
4. **check** - review the result and run the tests.
5. **deliver** - hand over the result and close the task.

A pack maps phases onto these steps. Each pack is one kind of work. The packs are `software`, `research`, `content`, and `operations`. The skill text guides the pack flow; existing strategy routing stays in code.

Example: the software pack maps the steps as follows.

| Step    | Software pack phases                                                        |
| ------- | --------------------------------------------------------------------------- |
| clarify | Pre-flight questions (no phase file)                                        |
| plan    | `plan`, `document-review`, optional `research` and `design`, `architecture` |
| do      | `batch`, `implement`                                                        |
| check   | `review`, `tests`                                                           |
| deliver | `completion`                                                                |

## Checkpoints

The orchestrator owns every user checkpoint:

- **CLI lanes** — choose enabled, auto, or disabled when a spawnable lane is available.
- **Scope and technical choices** — clarify ambiguity before planning or architecture.
- **Requirements and architecture** — present `task-description.md` and `implementation-plan.md` for approval before continuing.
- **QA** — choose the verification work after implementation.
- **Specialist clarification** — relay an agent's blocking questions to you, then re-invoke it with your decisions.

## How the router decides

The `ptah_route_decide` tool assigns each phase to an executor. It scores every candidate, ranks them, and returns one row per phase. Every candidate is `chosen`, `ranked`, `pruned` from the offer, or `excluded` with a named rule. A row never hides its math.

### Scoring

The router adds score parts into one total:

```
total = prior + learned + preference + limit
```

| Part          | Meaning                             | Value                                                                  |
| ------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `prior`       | Matrix cell score                   | User value, else seed value, else `50`                                 |
| `learned`     | Local outcome delta, capped         | Local value minus `prior`, capped at `+15`/`-15`                       |
| `exploration` | Bonus for an untested cell          | `+5` when no user value and fewer than 3 runs. It is part of `learned` |
| `preference`  | Boost from a matched `prefer` entry | `+12`, `+8`, `+4`, `+2` for rank 1, 2, 3, 4+                           |
| `limit`       | Lane limit state                    | `confirmed-room` `0`, `unknown` `-5`, `near-limit` `-10`               |

A lane at its limit is excluded before scoring. Matrix cells hold integers from 0 to 100. The additive total is not clamped. A listed model is used only when its own cell beats the family cell by more than 5 points. Otherwise the lane uses its configured model, or `lane-default`. For the built-in `visual-review` and `design` policy, a subagent candidate takes an `override` part that lifts its total to 100.

### Preferences

A `prefer` entry matches a candidate id, a display name, a family, or a CLI name. For example, `kimi code` matches a lane display name. Entries earlier in the list get a larger boost. A boost changes the total. It does not pin a lane. The explanation reports selectors that are blank, unknown, ambiguous, duplicate, or ineligible.

Preference sources have an order. A routing rule wins over the call. The call wins over ranks configured on a lane.

### Explanations and candidate traces

Each chosen row explains the choice in one sentence. The sentence names the executor, the model, the total with its score parts, the runner-up with the gap, the deciding factor, the preferences, the policy, and the limit state. The `reason` field ends with the policy clause. Example of one chosen row:

```json
{
  "phaseId": "review",
  "status": "chosen",
  "executor": { "kind": "lane", "id": "codex", "cli": "codex", "family": "codex" },
  "model": "lane-default",
  "tier": "sonnet",
  "effort": "high",
  "provenance": "lane-default",
  "score": 50,
  "source": "ranking",
  "taskKind": "review",
  "confidence": null,
  "fallbackCause": null,
  "modelProposal": null,
  "reason": "phase review; executor lane codex; model lane-default; score 50; no profile; limit state unknown; rotation did not change the choice; preference did not change the choice; model probability not applicable; fallback cause none; policy R2; tier sonnet, effort high, shape review, weight unset",
  "explanation": "Selected codex (model lane-default) with total 45 [prior 50 (neutral), learned +0, preference +0, limit -5] with no eligible alternative, decided by ranking, no preferences active, policy R2, sonnet/high, limit unknown (age unknown).",
  "candidates": [
    {
      "candidate": "codex",
      "displayName": "codex",
      "total": 45,
      "parts": { "prior": 50, "learned": 0, "preference": 0, "limit": -5, "priorSource": "neutral" },
      "disposition": "chosen"
    }
  ]
}
```

Excluded candidates appear in the top-level `excluded` list with a named rule. The built-in rules are `at-limit`, `disabled`, `not-installed`, `missing-capability`, `capability-unknown`, `reviewer-family`, `pruned`, and `not-listed`. A matched routing rule excludes a candidate as `user-rule:<id>`. A pruned candidate carries a cause: `below-band`, `option-cap`, or `payload-fit`.

### Routing rules

The setting `ptah.agentOrchestration.routingRules` holds an ordered array of rules. Each rule has an `id`, a `match` block, and a `set` block. Match fields combine with AND. Values inside one field combine with OR. An empty match object matches every phase. Example:

```json
{
  "ptah": {
    "agentOrchestration": {
      "routingRules": [
        {
          "id": "prefer-fast-review",
          "match": { "kind": ["review", "document-review"] },
          "set": { "prefer": ["kimi code"], "maxTier": "opus" }
        }
      ]
    }
  }
}
```

The list holds at most 64 rules. A selector list holds at most 32 entries. A selector has 1 to 200 characters. An id matches `[A-Za-z0-9._-]` and has at most 64 characters. `set` must set at least one field. `minTier` must not be above `maxTier`. An invalid rule is dropped with a diagnostic. Valid rules stay and keep their order.

Two more settings shape the decision model. `agentOrchestration.decisionModelPrefillTokensPerSecond` sets the prefill rate the router uses to estimate a call cost. `agentOrchestration.decisionModelTimeoutMs` sets an upper bound per request, between 1000 and 60000 ms.

### Deadline and fallback causes

Each call has a hard deadline, measured at tool entry. The `gate-0.1` stage has 8 seconds. The `pre-flight` stage has 4 seconds. The router reserves 250 ms to return the result. When time runs out, the deterministic ranking decides.

A System One decision-model call takes at most 2 questions. The router ranks the remaining phases and marks them `question-cap`. Before each call the router estimates the cost from the prompt size and the prefill rate, when a rate is known. A call that will not fit is skipped as `deadline`. Each target takes one request at a time. A second concurrent request returns `model-busy`. A local model that a residency probe shows as not loaded returns `model-cold`.

| `fallbackCause`     | Meaning                                                       |
| ------------------- | ------------------------------------------------------------- |
| `timeout`           | The request exceeded its per-request timeout.                 |
| `unreachable`       | The target could not be resolved or reached.                  |
| `auth`              | The target needs an API key that is missing.                  |
| `provider-error`    | The provider failed in another way.                           |
| `bad-output`        | The answer failed validation.                                 |
| `low-confidence`    | The reported confidence was below 0.5.                        |
| `payload-too-large` | The request did not fit under the byte cap at two options.    |
| `question-limit`    | The phase stayed outside the structured question budget.      |
| `question-cap`      | The phase stayed outside the two-question budget of one call. |
| `deadline`          | The route deadline ran out before or during the call.         |
| `model-cold`        | A residency probe showed the local model is not loaded.       |
| `model-busy`        | Another request was in flight for the same target.            |

### Capability matrix

The router reads a capability matrix from `~/.ptah/routing/capability-matrix.json`. You edit this file. The store writes it once as an empty template and never rewrites it. The router writes `capability-matrix.view.json` next to it. The view shows the merged cells that routing uses. Cell precedence is user, then local, then seed, then unknown.

Each profile covers one family and one model. The model `*` is the family-level profile. Each profile holds one cell per task kind: `plan`, `implement`, `review`, `research`, `tests`, `docs`. A cell is `unknown`, or a value with a 0-100 score, a source, a date, and a stale flag. Example:

```json
{
  "version": 1,
  "profiles": [
    {
      "family": "kimi",
      "model": "*",
      "cells": {
        "plan": { "kind": "unknown" },
        "implement": {
          "kind": "value",
          "score": 72,
          "source": "user",
          "asOf": "2026-11-24",
          "stale": false
        },
        "review": { "kind": "unknown" },
        "research": { "kind": "unknown" },
        "tests": { "kind": "unknown" },
        "docs": { "kind": "unknown" }
      }
    }
  ]
}
```

A `seed` value must name its dataset in `sourceRef` and what it measures in `note`. A `local` value must carry `sampleCount` and no `sourceRef`. A cell goes stale 180 days after its date.

## CLI lanes and required skills

Enable **`agent-lanes`** alongside `orchestration` to run CLI work. It defines discovery, addressing, self-contained prompts, spawn/status/read, recovery, messaging, review independence, and revision limits. If it is unavailable, orchestration asks you to enable it and uses sub-agents only until you do.

If the session has no `ptah_agent_*` tools, work proceeds with native tools and the agent says so. When `ptah_*` tools are available, agent templates use them first; when absent, they use native tools directly without probing for them.

:::tip[CLI-only delivery: Relay]
[Relay](/tribunal/relay/) is the orchestration pipeline run on CLI lanes, requested through the `tribunal` skill in main chat. Assign a vendor and model to plan, architect, implement, and review. Review uses a separate lane, with another vendor family preferred; a user-requested same-family review is flagged.
:::

## Parallel work and handoffs

The lane skill defaults to **three concurrent lanes**. Parallel writes must be file-disjoint, or each lane needs its own worktree. This workflow budget is separate from the [runtime concurrency setting](/agents/cli-agents/#concurrency-limits).

Each handoff includes the objective, acceptance criteria, absolute input paths, permitted files, and an output format. File-producing tasks name an absolute deliverable path and return `WROTE: <path>` plus a short verdict. Agents that cannot proceed return `## Clarifications Needed` for the orchestrator to resolve with you.

The orchestrator checks reports against files and runs the project's validation commands. A lane's `PASS` does not replace a build, tests, or lint. Reviewers do not review their own implementation, and ordinary lane revision stops after two rounds if it has not converged.

## Following up with a lane

`ptah_agent_message` sends a message to a running lane and reports its delivery mode. A message may steer the current turn, queue a next turn, interrupt and resume with partial work discarded, or be unsupported. The orchestrator checks the result; delivery is not assumed.

A lane can send a finding or blocker back with `ptah_agent_report`; its `delivered` result says whether the spawning session received it. To resume a finished or interrupted lane, `ptah_agent_status` must have reported a **CLI Session ID**. Otherwise, a fresh spawn restates the context. See [CLI agents](/agents/cli-agents/) for the tool flow.
