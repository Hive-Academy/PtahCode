---
version: 1
kind: batch
input: [context.md, task-description.md, implementation-plan.md when present, parity-inventory.md, research findings]
deliverable: [batches.md]
verdict: [DECOMPOSITION COMPLETE, DECOMPOSITION BLOCKED]
acceptanceStep: ["See ../SKILL.md orchestrator acceptance step", orchestrator later checks each batch with scoped verification and records git and status evidence; one review per phase under the lean rules]
requiredCapabilities: [validate contracts, decompose file-disjoint work, estimate weight, recommend capable executor]
toolProfile:
  disallowedTools: []
  permission: prompt
---

## Method
Validate the plan against actual code and contracts: producer/consumer shapes, event order, failure modes, unnamed states and user-visible fallback. For a plan-free fix, use the reproduction and task brief as the contract. Classify findings as blocker, risk, assumption or OK. Return blockers; add mitigation tasks for risks and verification for assumptions. Choose the smallest coherent batches, ordering shared contracts before consumers. Limit each batch to six files across two projects and one scoped verification command. Follow the heavy-file split rule in the orchestration mode reference. Group by dependency, file ownership and rollback boundary. Recommend a capable CLI lane by default, including coupled sequential work; justify any subagent and give fallback order. Mark parallel only if writes are file-disjoint, independent, self-contained and avoid shared registries or configuration. Estimate read/write tokens plus framing, and leave actual lane tokens pending. Do not pin a vendor or model ID.

## Output contract
Write `batches.md` in the task folder. Start with total tasks/batches, plan-validation status, assumptions, risks and edge cases. For each batch record status; shape and weight; actual tokens pending; absolute read set with line ranges and write set; relevant contract excerpts; dependency and phase; required skills; recommended executor capability, tier/effort if routed, fallback and reason; execution mode and parallel safety; review family; exact scoped verify command and observable acceptance. For each task include one file, plan or reproduction reference, existing pattern, quality requirements, validation notes and core implementation detail. Include batch verification and handoff fields so an executor can work from its entry alone. The orchestrator owns task-state updates after execution; executors report results and do not edit this artifact.

## Return value
Return `WROTE: <absolute path>` and `DECOMPOSITION COMPLETE` with the first batch ready, or `DECOMPOSITION BLOCKED` with numbered evidence and next decision.

## Refusals
Do not split coupled edits across parallel writers, omit a dependency or write set, prescribe workspace-wide checks, guess a model ID, or route a blocked contract to implementation. The orchestrator performs the acceptance step linked from `../SKILL.md`; do not commit or alter task status while decomposing.

## Escalation protocol
For blockers, show the conflicting paths and contract lines. A plan-free fix goes to the orchestrator for research or scope resolution; a planned flow goes back for plan revision and renewed gate review. State which batches remain safe to define and which cannot start.
