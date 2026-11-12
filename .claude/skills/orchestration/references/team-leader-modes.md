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

## Acceptance step

The orchestrator runs this step from the batch report path in a fresh invocation. The report is a claim; the file is the fact.

1. Parse the report: require every assigned task to be done, every changed file path to be listed, evidence for each task, and a resolution for every plan-validation risk. If evidence is missing, return `BATCH [N] PARTIAL FAILURE` with the missing item.
2. Verify each reported file on disk yourself. Inspect source structure first with `ptah_ast_analyze` or `ptah_context_enrich_file`, then read the relevant implementation and compare it with the batch contract. Missing files or incomplete work give `BATCH [N] PARTIAL FAILURE`. Only after this verification mark each task `IMPLEMENTED` in `batches.md`.
3. Run the batch's one scoped verification command. Record its result. On failure, keep the batch `IN_PROGRESS` and return `BATCH [N] NOT ACCEPTED` with actionable `file:line` diagnostics. Retry the same executor under the lean retry rule; do not accept or commit a failed batch.
4. Discover the full write set with `git status --short` and `git diff --name-only`; executors may have touched unreported shared files. Review each diff, stage only files belonging to this batch, and match the style of the last ten commit subjects before committing. Never stage another writer's changes.
5. After checks and commit, mark every task and the batch `COMPLETE` and write the commit SHA on the batch header. `IMPLEMENTED` means verified on disk; `COMPLETE` means checked and committed. If more batches remain, count and return the `PENDING` batches. On the last batch of a phase, request one review of the combined diff from the parent of its first phase commit to `HEAD`: code logic for shipping code, style for new public API, and visual review for rendered UI.
6. Read the review at its supplied path. For APPROVED or APPROVE, record its path on the last batch header and return the next batch or `ALL BATCHES COMPLETE`. For NEEDS_REVISION, REVISE, REJECTED or REJECT, open one fix batch `IN_PROGRESS` for findings within the fix-round rule and return `BATCH [N] NOT ACCEPTED`. Its work repeats steps 1-5; its one re-review covers only the fix commits. Record review-family evidence before advancing.

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
For each reviewed phase, the recorded state transition and Mode 3 summary must identify the actual
executor, author family, reviewer family, and any same-family reason with its weaker-evidence label.
If review fell back to an independent subagent, include `Subagent reason` and the unavailable lane
evidence. Do not describe a same-family review as different-family evidence.

## Orchestrator state transitions

The orchestrator records and follows these state transitions in batches.md or decisions.md.

| State recorded              | Orchestrator action                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DECOMPOSITION COMPLETE`    | Spawn Batch 1's executor (below)                                                                                                                                                                                                                                                                                                                                                                     |
| `DECOMPOSITION BLOCKED`     | Plan-free BUGFIX: return the blocking questions to the orchestrator, who runs Gate SR or commissions research, then re-invokes `batch`; no architecture/Gate 2 for a flow without a plan. Planned flows: re-invoke architecture with the blocking issues, refresh the document review, then Gate 2 again.                                                                        |
| `BATCH [N] PARTIAL FAILURE` | Re-invoke the same executor for the missing tasks only                                                                                                                                                                                                                                                                                                                                               |
| `NEEDS REVIEW`              | A phase review is due. For shipping code, select an independent capable reviewer from a different family than the implementer when available (agent-lanes §6). Use an eligible existing review if present; otherwise obtain the combined-diff `code-logic-review.md` and any additional named review. Record actual executor, author/reviewer families and any same-family weaker-evidence reason or `Subagent reason`. Repeat acceptance with each actual report path (`code-logic-review.md`, `code-style-review.md`, `visual-review.md` as applicable) and verdict |
| `BATCH [N] NOT ACCEPTED`    | Re-invoke the same executor with the listed issues (a failing scoped check, or the fix batch for a rejected phase review), then acceptance again                                                                                                                                                                                                                                                         |
| `BATCH [N] COMPLETE`        | Spawn the next batch's executor                                                                                                                                                                                                                                                                                                                                                                      |
| ALL BATCHES COMPLETE | Run required review, tests and applicable visual-review, then invoke completion |
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
