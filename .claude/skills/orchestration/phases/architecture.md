---
version: 2
kind: architecture
input: ["Task context and requirements", "Research, parity inventory and design handoff when applicable", "Repository source and rules"]
deliverable: ["implementation-plan.md", "parity-inventory.md in inventory-only mode"]
verdict: ["Design ready for decomposition", "Decision or evidence missing"]
acceptanceStep: ["See ../SKILL.md orchestrator acceptance step", "Verify cited contracts and component boundaries", "Obtain the applicable architecture gate decision"]
requiredCapabilities: ["Source-backed architecture", "Dependency and failure tracing", "Inventory-only analysis"]
machineCapabilities: []
toolProfile:
  disallowedTools: []
  permission: prompt
---

## Method
Read task context, requirements, research and applicable design artifacts in authority order, then repository instructions. Load required skills available to the executor. Find two or three comparable implementations; inspect their imports, registration, error paths and tests. Open every contract, symbol, configuration key and command before naming it. Trace dependency direction, entry-to-storage data flow, state ownership, validation, failure and rollback. Mark facts Verified with `file:line`; mark unresolved claims Assumption with a check. Prefer established patterns when they fit. For each decision record the requirement, chosen approach, evidence, viable alternative, effect on existing code and failure behavior. Preserve handoff component names, inputs, responsive states, motion, assets, tokens and accessibility where applicable. Resolve conflicting artifacts explicitly.

Keep reads and searches bounded. Inspect a command before running it, and avoid destructive operations. Check external calls against the trust boundary and validate their inputs and results. Use focused tests at the level of the changed contract. Treat external documentation as context; verify repository behavior against installed code. Refine an existing plan only after checking its approval state. Do not introduce abstractions without a requirement, or size components by line count.

Keep one responsibility per unit and depend on abstractions at real boundaries. Prefer composition and avoid premature shared layers. Parameterize queries and pass command arguments as arrays. Keep secrets out of code, logs and errors; use least privilege. Give external calls a timeout; retry only idempotent operations with backoff and a defined failure path. Use unit tests for logic, integration tests at boundaries and a regression test for a bug fix. Bound long-lived resource use and release timers, listeners and observers. For continuous animation, change only compositor properties.

In inventory-only mode read the old surface and write only `parity-inventory.md` before design. Record every capability, current `file:line`, backing RPC/API, keep/move/remove-proposed decision, destination or TBD, and proving test or coverage gap. Stop after that inventory.

## Output contract
Write `implementation-plan.md` with Inputs and constraints; Codebase evidence; Architecture decision; Component specifications; Integration architecture; Architecture-level quality requirements; and handoff for decomposition. Each component needs one responsibility, verified entry points and contracts, dependencies and direction, callers, validation and failure behavior, quality constraints, verification seam, and CREATE/MODIFY/REWRITE paths. The integration section covers data flow, state lifetime, trust boundaries, rollback and observability. The handoff gives required skills, complexity, dependency order, parallel-safe file ownership, complete file list and applicable checks. Specify what and why; leave numbered batches to decomposition.

## Return value
Return `WROTE: <absolute path> — <N> components`; in inventory-only mode return the inventory path and capability count.

## Refusals
Do not invent imports or contracts, silently choose between conflicting evidence, treat an earlier draft as approved, or add speculative abstraction. Do not assign numbered batches. Do not use line count as a proxy for cohesion.

## Escalation protocol
Resolve answerable questions from source and record decisions. Send unresolved scope, compatibility, removal or public-contract choices to the orchestrator with options, evidence and a recommendation. Continue independent analysis; stop before the affected plan if no decision channel is available.
