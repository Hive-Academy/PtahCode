# Phase Mode Compatibility

The orchestrator owns the phase exchange. The `batch` kind decomposes and recommends executors without spawning. Each phase acceptance step verifies reports, records state and commits under the existing gate protocol. The `completion` kind audits final evidence and presents QA options. Phase definitions own the discipline; this file retains the legacy Mode 1/2/3 mapping and orchestration rules.

---

## Mode compatibility mapping

| Legacy mode | Active phase step | Invoke when | Produces |
| --- | --- | --- | --- |
| Mode 1 -> Decomposition | `batch` -> `../phases/batch.md` | Architecture approved, or plan-free BUGFIX after initialization and required research/design gate; no `batches.md` yet | `batches.md`, Batch 1 `IN_PROGRESS` |
| Mode 2 -> Verify and commit | Orchestrator acceptance step of each phase -> `../phases/<kind>.md` | Executor report or phase review verdict ready | Scoped checks, independent review, commit/status and gate evidence; next assignment, review request or rejection |
| Mode 3 -> Completion | `completion` -> `../phases/completion.md` | Every batch `COMPLETE` | Final verification summary and QA options |

Pass the absolute task folder, mode-equivalent kind or acceptance step, and relevant report paths to a fresh invocation. For acceptance, supply the batch report path and, when available, the review path and one-line verdict. Require a file deliverable and `WROTE: <absolute path>` confirmation.

## Lean orchestration rules

- Every acceptance/completion invocation is fresh. In Mode 2, give it the batch report path
  (plus the review path only when you return with a phase review verdict) rather than resuming an earlier orchestrator with its long thread.
- The `batch` kind writes `batches.md`. Each self-contained batch entry records its id and state; shape
  (`mechanical|logic|contract|test|docs|review`); estimated weight (read-set plus write-set tokens
  measured with `ptah_count_tokens`, plus 10% framing); actual lane tokens (`pending` until measured,
  `unavailable` if unknown, never guessed); write set; read set with line ranges; inline contract
  excerpts; dependencies; parallel-safe flag; routed executor/tier/effort/reason; exact verify command
  (`npm run verify -- -p A,B`); and acceptance criteria.
- Each acceptance step records actual lane tokens beside each batch estimate in `batches.md` for calibration by shape.
- "Re-invoke the same executor" (below) means resume it only if its last activity was under
  5 minutes ago; otherwise start a fresh one with the batch section and the report paths.
- Risk-based review: no per-batch review; each batch passes its scoped typecheck, lint and tests
  before commit. One independent code-logic review per phase on the combined diff, requested by the orchestrator
  after the phase's last batch commits; none for a phase whose batches change only types, tests,
  docs or measurement; a style review only for new public API. Assign the code-logic review to a
  capable different-family lane when available. A same-family or subagent fallback needs its
  specific reason and a weaker-evidence label; record `Review family` and `Subagent reason` when used.
- At most one fix round: Blocking and Serious fixed; Moderate only if it can break a lane config or
  lose data (else a named later task); Minor fixed when local (one file, no contract or public API change), else recorded. Then one re-review scoped to the
  fixes.

## Completion checks

The `completion` kind verifies `parity-inventory.md` row by row: each capability stays, moves with its proving
test, or has a user-approved removal. A missing, unapproved capability blocks completion.
UI batches require visual-review screenshots in dark + light themes against the approved
`<taskFolder>/prototype/`, or — for a UI change with no added/redesigned surface and so no
prototype — before/after screenshots (dark + light) of the affected screen (the "before" screenshots
captured from the base commit, before the fix lands), shown to the user before merge; typecheck/test/lint alone do not suffice.
Check the lane's tool list; lanes that have `ptah_browser_*` render and screenshot their own UI; the visual-review still gives the independent dark+light evidence.
For changed persisted settings/config/storage writes, require a **write-path trace** to each
runtime reader (key, scope, value format, side effects such as env vars), confirming unchanged or
intended behaviour. Missing evidence goes back for verification before `TASK COMPLETE`.

The `batch` kind receives the plan, document reviews and recorded user gate decisions the selected flow
requires (including open items the user accepted). **BUGFIX is plan-free**: decompose from `task.md`,
`context.md` and `research-report.md` when present; `implementation-plan.md` is not required.
Missing or stale required evidence (including any required design gate) is a blocker for you.
The `completion` kind checks that this evidence still applies and that every phase that changed shipping code has its
accepting code-logic review; it never commissions another document review. When a flow legitimately skips an artifact,
its approval and review are not required either.
For each reviewed phase, the `### Next action:` return and Mode 3 summary must identify the actual
executor, author family, reviewer family, and any same-family reason with its weaker-evidence label.
If review fell back to an independent subagent, include `Subagent reason` and the unavailable lane
evidence. Do not describe a same-family review as different-family evidence.

## Acting on a return

Every return ends with a `### Next action:` line. Do what it says; the heading tells you which case
you are in.

| Return heading              | Your action                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DECOMPOSITION COMPLETE`    | Spawn Batch 1's executor (below)                                                                                                                                                                                                                                                                                                                                                                     |
| `DECOMPOSITION BLOCKED`     | Plan-free BUGFIX: return the blocking questions to the orchestrator, who runs Gate SR or commissions research, then re-invokes `batch`; no architecture/Gate 2 for a flow without a plan. Planned flows: re-invoke architecture with the blocking issues, refresh the document review, then Gate 2 again.                                                                        |
| `BATCH [N] PARTIAL FAILURE` | Re-invoke the same executor for the missing tasks only                                                                                                                                                                                                                                                                                                                                               |
| `NEEDS REVIEW`              | A phase review is due. For shipping code, select an independent capable reviewer from a different family than the implementer when available (agent-lanes §6). Use an eligible existing review if present; otherwise obtain the combined-diff `code-logic-review.md` and any additional named review. Record actual executor, author/reviewer families and any same-family weaker-evidence reason or `Subagent reason`. Repeat acceptance with each actual report path (`code-logic-review.md`, `code-style-review.md`, `visual-review.md` as applicable) and verdict |
| `BATCH [N] NOT ACCEPTED`    | Re-invoke the same executor with the listed issues (a failing scoped check, or the fix batch for a rejected phase review), then acceptance again                                                                                                                                                                                                                                                         |
| `BATCH [N] COMPLETE`        | Spawn the next batch's executor                                                                                                                                                                                                                                                                                                                                                                      |
| `ALL BATCHES COMPLETE`      | Invoke `completion`                                                                                                                                                                                                                                                                                                                                                                                        |
| `TASK COMPLETE`             | Present Gate 3 with the options it returned                                                                                                                                                                                                                                                                                                                                                          |

A hook failure during its commit is your gate: [git-standards.md](git-standards.md#hook-failure-protocol).

## Spawning a batch executor

Read that batch entry's executor, tier, effort and parallel-safe flag in `batches.md`. Build each
executor prompt **only** from that entry plus the generic lane policy and kind; do not paste the
plan, `context.md` or other batches. The entry must contain everything the executor needs.

When `ptah_route_decide` is listed, make the post-decomposition routing call with each batch as a phase with its `shape` and `weight`;
the roster returns `model`, `tier` and `effort`. For a subagent, pass `tier` as the Agent call's `model`
alias and `effort` where supported. For system CLI rows other than `claude`, `model` is
`lane-default` unless the decision chose an exact ID from that CLI's live model list
(`source: model`). Deterministic ranking uses `lane-default`. Pass a concrete row `model`
as spawn `model`; omit it for `lane-default`. For ptah-cli and `cli: "claude"` rows,
pass `tier` as `modelTier`, not row `model`. Pass row `effort` as spawn `effort` when present;
it overrides the per-CLI effort setting. A user-pinned lane/model wins. Never invent a
model id. System CLI resolution is request `model` -> `agentOrchestration.<cli>Model`
setting -> native CLI default.

- **Sequential, subagent** → one `Task()` with the prompt built from that batch entry.
- **Sequential, CLI lane** → one capable lane for the bounded batch, including coupled files;
  give it the self-contained task prompt and verify its report before acceptance.
- **Parallel, CLI lanes** → one lane per task, file-disjoint, each with a self-contained prompt built
  from its task in that batch entry. Run them per the `agent-lanes` skill; merge the lane results into **one**
  implementation report; repeat acceptance with it.
- **Recommended executor unavailable** (lanes disabled at Gate 0.1, or no such lane) → use the
  batch's `Fallback executor`.

Who may spawn what, and phase-kind hand-offs: [lane-assignment.md](lane-assignment.md).

Executors never edit `batches.md` and never commit; the orchestrator owns both.
