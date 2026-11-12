# Final diff review 2: TASK_2026_1009_f898 (fix round 2)

## Verdict

**APPROVED**

Review family: anthropic-api; implementer family: codex

All 17 findings are fixed or fixed with a small residual. No Blocker or Serious item remains. Five new
items (Moderate and Minor) need no second fix round. Paths are relative to
`plugins/ptah-core/skills/orchestration/` (the `.claude/skills/orchestration/` mirror is byte-identical).

Evidence: read from files and `git show` of both fix commits. Commands run: `validate-skill` (0 errors,
0 warnings), role census without `--update` (exit 0, total 1700 lines, all buckets ok), `diff -r` of the
two skill trees (no output).

## Status of F1 to F17

| ID | Status | Evidence |
| --- | --- | --- |
| F1 | Fixed | `references/team-leader-modes.md:17-29` has `## Acceptance step`, steps 1-6, in the orchestrator voice. Each Mode 2 item of `.claude/agents/team-leader.md:286-359` is present. (1) parse report: `:19`. (2) verify on disk with `ptah_ast_analyze`/`ptah_context_enrich_file`, then `IMPLEMENTED`, else `PARTIAL FAILURE`: `:20`. (3) one scoped check, `NOT ACCEPTED` with `file:line`: `:21`. (4) `git status --short`, `git diff --name-only`, stage only this batch, match last ten subjects: `:22`. (5) `COMPLETE` plus SHA on batch header, count `PENDING`, combined-diff review from the parent of the first phase commit: `:23`. (6) verdict handling, one fix batch, one re-review: `:24`. `IMPLEMENTED` and `COMPLETE` are defined at `:23`. `SKILL.md:166` links to it. `phases/batch.md` refusal now points to it. Small gaps are in N3. |
| F2 | Fixed | `phases/completion.md:15` has: every batch and task `COMPLETE`; SHA checked with `git log --oneline`; every file named in `batches.md` on disk; risk resolutions; missing inventory is a blocker; old-surface comparison first (routes, commands, RPC calls, actions); `keep`/`move` rows need a passing test; removals need approval. `:17` has the preserve-list variant. Output contract `:20` has the SHA ledger and risk resolutions. |
| F3 | Fixed | `references/agent-catalog.md` has `### Skill routing` (`:62`), `### Document review` (`:90`), `## Parallel QA` (`:96`). The stack-cue table is back, 21 rows. A diff against `main` shows only one difference: the header "(load when the host lists it)" is shortened. The intro paragraph keeps the optional-skill rule. All links resolve (validator, 0 errors). |
| F4 | Fixed | `references/agent-catalog.md:128-129`: `Required Skills: ui-ux-designer` and `technical-content-writer`, with "Load `ui-ux-designer`" and "Load `technical-content-writer`". |
| F5 | Fixed, with a residual (N1) | One order now: `implement -> review -> tests -> completion` in `SKILL.md:53-60`; `strategies.md:76-87` (Phase 5 batch, Phase 6 review/tests, Phase 8 completion); `task-tracking.md:170` ("Run required review and tests, then completion, Gate 3"); `checkpoints.md:559`/`SKILL.md:116` Gate 3 after completion. The four files agree on the run order. Residual: Gate 3 is the QA selection but sits after the QA runs (N1). |
| F6 | Fixed | `git diff main -- references/checkpoints.md` shows only role names changed to phase kinds and acceptance step. No gate, response table, template or rule was removed. Gate 1 and 1.7 text, selection rule rows (4 rows kept with the same cues), template, response table (6 answers) and rejection loop (`team-leader MODE 2` to acceptance step) are intact. `grep` finds no role name or `MODE n` left in the file. One wording drop: "runs before batch acceptance" became "before completion" (`:595`); this is consistent with the new order. |
| F7 | Fixed | `references/agent-catalog.md:45-57`: `Task({ subagent_type, description, prompt })` block with skeleton, `**Task Folder**`, `Required Skills:`, `**Deliverable**`, "Do NOT return content inline", `Reply WROTE`. Column header `Legacy alias (subagent_type)` at `:116`. |
| F8 | Fixed | `strategies.md:176-189`; `SKILL.md:56`: `docs` (content spec) then `implement (documentation files)`. `phases/implement.md:17` names the deliverable. |
| F9 | Fixed | `SKILL.md:53`: `plan -> document-review` in FEATURE. |
| F10 | Fixed | `phases/completion.md:22` and `:20` (`completion-report.md`); `phases/research.md:19` (after-QA scan writes `future-enhancements.md`); flows in `SKILL.md:53-58` end with `research`; `task-tracking.md:143-144,171-173` has layout and continuation rows for both files. |
| F11 | Fixed | `team-leader-modes.md:76-90` rewritten as orchestrator transitions; `SKILL.md:165-166,218` no longer require `### Next action:` and name the batch report path as input. |
| F12 | Fixed | `phases/visual-review.md:15`: six viewports 320, 375, 768, 1024, 1366, 1920, one screenshot each in `screenshots/`; both inputs (base capture and running app). |
| F13 | Fixed | `agent-catalog.md:90-94`: role eligibility for `<artifact-stem>-review.md`, absolute inputs list, `prototype/` and screenshots, `deliverables` path. |
| F14 | Partly fixed | `phases/implement.md:7` now correct. The same wording remains in `phases/batch.md:7` (N2). |
| F15 | Fixed | `strategies.md:269`: `implement`, default alias `devops-engineer`, `Required Skills:` from the routing table. |
| F16 | Fixed, with false-error risks (N4) | `scripts/validate-orchestration-skill.ts:465-495` checks files and heading anchors; fenced blocks are masked. The validator passes. |
| F17 | Fixed | `phases/design.md:18` names `prototype/index.html`, `prototype/README.md`, `prototype/screenshots/`. |

## New findings

| ID | Severity | file:line | Scenario | Concrete fix text |
| --- | --- | --- | --- | --- |
| N1 | Moderate | `SKILL.md:116`; `references/checkpoints.md:557-560`; `references/strategies.md:76-79` | Gate 3 selects QA by rule "after `completion`". The flows run `review` and `tests` before `completion`. The reader cannot tell whether the selection or the QA run comes first. Gate 3 is a notice, so no work is lost. | Change the Gate 3 trigger to "After the last batch is `COMPLETE`, before `review` and `tests`" and keep `completion` after QA; or state in `checkpoints.md:559` that Gate 3 only adds QA beyond the required `review` and `tests` and the user may add it after `completion`. |
| N2 | Minor | `phases/batch.md:7` | `acceptanceStep` still says each batch is checked "with scoped verification and independent review". This contradicts lean rule 3 (no per-batch review). | Write: "orchestrator later checks each batch with scoped verification, records git and status evidence; one phase review per the lean rules". |
| N3 | Minor | `references/team-leader-modes.md:23`; `references/agent-catalog.md:121` | (a) Step 5 omits the source exception "phase review not `none`" and "do not proceed in the same invocation"; `:44-45` (lean rules) has the exception. (b) The visual-reviewer row says "Run the visual review checklist below", but the checklist is now in `phases/visual-review.md` only. | (a) Add "unless the phase review is `none`" to step 5. (b) Replace "below" with "in `../phases/visual-review.md`". |
| N4 | Minor | `scripts/validate-orchestration-skill.ts:481-491` | Slug rule differs from GitHub. (1) It strips `_`, GitHub keeps it: heading `## SAAS_INIT` gives `saasinit`; link `#saas_init` is a false error. (2) Duplicate headings: GitHub adds `-1`; link `#x-1` is a false error. (3) A heading with a link, `## [a](b)`, uses raw text: false error. (4) Link with a query (`x.md?y`) fails `existsSync`: false error. (5) Non-markdown target with `#L10` is parsed as headings: false error. (6) `mailto:` and other schemes are treated as files: false error. (7) Malformed `%` makes `decodeURIComponent` throw. (8) Link `a#b#c` checks only `b`. (9) Directory links pass without an anchor, and are skipped with an anchor (correct). A false pass also exists: a heading inside an HTML comment counts. No current file triggers these, so CI is green. | Do not strip `_`. Count duplicates and add `-N` slugs. Strip `[text](url)` to `text` before the slug. Skip links that match `^[a-z]+:`. Cut `?query` from the path. Check anchors only when the target ends in `.md`. Wrap `decodeURIComponent` in `try`. |
| N5 | Minor | `SKILL.md:166,251`; `references/strategies.md:123`; `references/lane-assignment.md:15,75`; `references/git-standards.md:113`; `references/fleet.md:36`; `references/strategies.md:88` | First-review F18 and F19 items are not in the fix report and remain: "MODE 1", "Team-leader | Nothing", "who requests and records commits"; "Phase 7: User handles git" disagrees with the standing PR workflow of the repository. | Replace with phase-kind wording or mark as legacy aliases; change Phase 7 to "orchestrator commits and opens the pull request". Not a gate. |

## Regressions

No removed or contradicted rule, gate or capability found in the fix round beyond N1 to N3. Phase file changes
(`acceptanceStep` lines, `implement`, `docs`, `research`, `completion`, `visual-review`, `design`) agree with the flows.

## Not checked

- I did not run any phase through the resolver or run a full flow.
- I did not re-read `libs/**` (unchanged in this round).
- I did not test the validator against synthetic links; the false-error list in N4 comes from reading the code.
- I did not compare every non-listed sentence of the `ad0e1bde6` diff of `checkpoints.md` beyond the `main` diff above.
