---
version: 2
kind: batch
input: [context.md, task-description.md, implementation-plan.md when present, parity-inventory.md, research findings]
deliverable: [batches.md]
verdict: [DECOMPOSITION COMPLETE, DECOMPOSITION BLOCKED]
acceptanceStep: ["See ../SKILL.md orchestrator acceptance step", orchestrator later checks each batch with scoped verification and records git and status evidence; one review per phase under the lean rules]
requiredCapabilities: [validate contracts, decompose file-disjoint work, estimate weight, recommend capable executor]
machineCapabilities: []
toolProfile:
  disallowedTools: []
  permission: prompt
---

## Method
Discover the task folder before assuming documents exist. Read `context.md`, `task-description.md` and, in planned flows, `implementation-plan.md`; a missing required plan blocks decomposition. A plan-free BUGFIX uses `task.md`, context and available research. Read design documents and the approved prototype for visual work, and the parity inventory or lane preserve list for a replaced, consolidated, rebuilt or redesigned surface. Read legacy `tasks.md` when present, but write `batches.md`. Load named `Required Skills:` when listed by the host and carry matching skill IDs, or `none`, into every batch, executor prompt and spawned task.

Check whether every named file already exists before assigning creation or modification. Compare producer and consumer fields, types, nullability and write paths; test event order, dependency failures, unnamed states and the user-visible fallback. Classify findings as BLOCKER, RISK, ASSUMPTION or OK. A false core assumption, missing required dependency, conflicting architecture or security hole blocks decomposition. Return numbered evidence to the orchestrator; a planned flow returns to architecture, while a plan-free BUGFIX uses Gate SR or research. Add mitigation tasks for risks and verification steps for assumptions.

Validate the plan against actual code and contracts: producer/consumer shapes, event order, failure modes, unnamed states and user-visible fallback. For a plan-free fix, use the reproduction and task brief as the contract. Classify findings as blocker, risk, assumption or OK. Return blockers; add mitigation tasks for risks and verification for assumptions. Choose the smallest coherent batches, ordering shared contracts before consumers. Limit each batch to six files across two projects and one scoped verification command. Give a file that is too large or touched by many tasks its own batch, or sequence its edits in one batch so two executors never write it at once. Put tasks of similar difficulty together so one hard task does not stall easy ones. Group by dependency, file ownership and rollback boundary. Recommend a capable CLI lane by default, including coupled sequential work; justify any subagent and give fallback order. Mark parallel only if writes are file-disjoint, independent, self-contained and avoid shared registries or configuration. Estimate read/write tokens plus framing, and leave actual lane tokens pending. Do not pin a vendor or model ID.

## Output contract
Use literal task states `PENDING`, `IN_PROGRESS`, `IMPLEMENTED`, `COMPLETE` and `FAILED`. Start with the first batch `IN_PROGRESS`. Keep each batch entry self-contained; executor prompts use that entry alone plus generic lane policy. The orchestrator records actual lane tokens during acceptance; unknown usage is `unavailable`, never guessed.

Write `batches.md` in the task folder. Start with total tasks/batches, plan-validation status, assumptions, risks and edge cases. For each batch record status; shape and weight; actual tokens pending; absolute read set with line ranges and write set; relevant contract excerpts; dependency and phase; required skills; recommended executor capability, tier/effort if routed, fallback and reason; execution mode and parallel safety; review family; exact scoped verify command and observable acceptance. For each task include one file, plan or reproduction reference, existing pattern, quality requirements, validation notes and core implementation detail. Include batch verification and handoff fields so an executor can work from its entry alone. The orchestrator owns task-state updates after execution; executors report results and do not edit this artifact.

## Return value
Return `WROTE: <absolute path>` and `DECOMPOSITION COMPLETE` with the first batch ready, or `DECOMPOSITION BLOCKED` with numbered evidence and next decision.

## Refusals
Batch acceptance belongs to the orchestrator, in a fresh invocation with the report path and any review path. Treat reports as claims. Require evidence for each assigned task and plan risk, inspect reported files on disk, and mark verified tasks `IMPLEMENTED`. Run the batch's scoped command; on failure leave it `IN_PROGRESS`, return `BATCH [N] NOT ACCEPTED` with file and line diagnostics, and retry the executor. Discover the full write set with `git status --short` and `git diff --name-only`; stage only this batch's files. Follow repository commit convention and record the SHA, actual lane tokens and `COMPLETE` status only after checks pass. Missing files or tasks return `BATCH [N] PARTIAL FAILURE`.

Reject batch acceptance if the work has TODO, PLACEHOLDER or STUB markers, empty bodies, mock data, or logging in place of logic.

Review the combined diff after the last batch of a phase: one independent code logic review for shipping code, style review for new public API, visual review for rendered UI; types, tests, docs or measurement alone need no code logic review. Prefer a different reviewer family and record any same-family weaker-evidence reason. On an accepting verdict record the review path. On a rejecting verdict open one fix batch; fix Blocking and Serious issues, Moderate issues that could break lane configuration or lose data, and local Minor issues. Record other findings as later tasks. One review of fix commits follows. Do not advance before the due review accepts.

Build executor prompts only from the assigned batch entry and generic lane policy. For parallel work, spawn one CLI lane per independent task, wait for each completion signal or one status check, and synthesize one report before acceptance. A sequential batch gets one executor. Executors must implement real code, handle listed edge cases, run the exact check, report evidence, paths, risks and actual token usage when available; they neither edit `batches.md` nor commit. Resume an executor only when its last activity was under five minutes ago; otherwise start a fresh invocation with the batch section and report paths. The orchestrator must not fix an executor's code while accepting it, stage unrelated changes, re-plan architecture, or mark a validation risk resolved without evidence.

Do not split coupled edits across parallel writers, omit a dependency or write set, prescribe workspace-wide checks, guess a model ID, or route a blocked contract to implementation. The orchestrator performs the acceptance step linked from `../SKILL.md`; do not commit or alter task status while decomposing.

## Escalation protocol
For blockers, show the conflicting paths and contract lines. A plan-free fix goes to the orchestrator for research or scope resolution; a planned flow goes back for plan revision and renewed gate review. State which batches remain safe to define and which cannot start.
