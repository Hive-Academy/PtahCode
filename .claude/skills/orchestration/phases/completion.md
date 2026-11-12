---
version: 1
kind: completion
input: [context.md, task-description.md, parity-inventory.md, batches.md, scoped check reports, review reports, visual evidence]
deliverable: [completion-report.md, Gate 3 readiness decision]
verdict: [TASK COMPLETE, COMPLETION BLOCKED]
acceptanceStep: ["See ../SKILL.md orchestrator acceptance step", orchestrator presents Gate 3 only after parity, checks and reviews are evidenced]
requiredCapabilities: [audit capability parity, trace write paths, assess gate evidence]
toolProfile:
  disallowedTools: []
  permission: prompt
---

## Method
Audit the task against the original request and every acceptance criterion. Require every batch and task to be `COMPLETE`, each batch to have a commit SHA verified against `git log --oneline`, and every file named in `batches.md` to exist on disk. Require a recorded resolution for each plan-validation risk. When a parity inventory is required, a missing `parity-inventory.md` blocks completion: first compare it with the OLD surface at the base commit (routes, commands, RPC calls and actions), treating any omitted old capability as a blocker; then verify each row against shipped behavior. Every `keep` or `move` row needs a passing test, including the lane preserve-list variant in `SKILL.md`; removals need user approval. Confirm scoped checks and independent review evidence; identify skipped, failed or unreviewed work. For UI, inspect the visual-review artifact and Electron screenshots: approved prototype comparison for redesigned surfaces, dark/light before-after pairs otherwise. Trace writes to persisted settings, files or remote state through the final implementation, including failures and migration. Check documentation, test results, remaining risks and gate decisions. Mark the task complete only when the evidence closes every required criterion; otherwise enumerate fixes and route them to the relevant phase.

For a lane preserve list, check each listed capability in the build with a passing test or a user-approved removal in `## Proposed Removals`. Do not require inventory decision markers in a preserve list. An unapproved missing capability blocks completion.

## Output contract
Write `completion-report.md` in the task folder with criterion-by-criterion evidence, parity table and approved removals, batch/task status and verified commit SHA ledger, plan-risk resolutions, scoped-check ledger, review verdicts, visual evidence paths, persisted write-path trace, unresolved risks, and a Gate 3 recommendation. Distinguish observed evidence from inference and name missing evidence explicitly.

The after-QA modernization scan is a separate `research` phase and writes `future-enhancements.md`; this audit writes `completion-report.md`.

## Return value
Return `WROTE: <absolute path>` and `TASK COMPLETE` with Gate 3 options, or `COMPLETION BLOCKED` with numbered gaps and owners by phase.

## Refusals
Do not infer parity from passing tests alone, accept a UI change without rendered evidence, report an unobserved gate as passed, silently drop a capability, or bypass an unapproved removal. Do not perform batch acceptance, commits or status updates in this audit.

## Escalation protocol
Send missing implementation to the relevant batch, missing proof to tests or visual-review, and unresolved product or removal decisions to the orchestrator. Keep Gate 3 blocked until the specific evidence or approval exists.
