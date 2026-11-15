# Review round 2 — Phase 4 step 2 (retire verification roles)

Reviewer: independent lane, read-only. Method: `plugins/ptah-core/skills/orchestration/phases/review.md`.

## Verdict: APPROVED

Blocking findings: 0. Serious findings: 0. All round 1 findings that were to be fixed are fixed
(M-1, m-1..m-5, n-1, n-2, n-5). The deferred items (n-3, n-4, n-6) stay deferred. Round 2 found
one new Minor finding and four Nits. None of them changes runtime behavior in a wrong way.

## Scope and evidence

- `git diff HEAD` (66 files, 6 more than round 1) plus the four staged template deletions.
- Fix reports: `fix-step-2-review-result.md` (13:02) and `fix-2-review-result.md` (13:10).
- Files read in full or in the changed region: `orchestration-namespace.builder.ts:240-348` and
  its spec `:120-310`, `code-execution/types.ts:2026-2087`, `system-namespace.builders.ts:385-412`,
  `agent-process-manager.service.ts:1015-1185`, `cli-adapter.interface.ts:109-115`,
  `claude-cli.adapter.ts:530-545`, `lane-spawn-policy.ts:345-440`, `validate-orchestration-skill.ts`
  (alias block `:117-131`, `:742-756`), `retired-roles.ts:15-66`, `agent-catalog.md:120-126`,
  `decisions.md`, `step-2-learned-differences.md:7`, `task-spec.contract.ts`, both `review.md` copies.
- Mirror parity: `cmp` of both `review.md` copies is equal. `diff -rq` of both `orchestration`
  trees and both `tribunal` trees reports no difference.
- Consumers of `action`: a search of `libs`, `apps`, `plugins` and `.claude` for `invoke-agent`,
  `present-checkpoint` and `getNextAction` finds only `types.ts`, the builder, its spec and the
  help text. No `switch` on `action` exists in product code.
- Personal data: `git diff HEAD -G` for home paths, user names, mail domains and the organization
  name finds no changed file. The task folder has no match either.

### Limitation

I did not run Jest or `npm run validate-skill`. The lane shell refused both commands without
approval. Test evidence comes from `fix-step-2-review-result.md` (manager spec 256 tests,
resolver and adapter specs 111 tests, namespace spec 14 tests, `tsc` on two projects,
`validate-skill` 0 errors). The coordinator gate must run these again.

## Round 1 recheck

| ID | State | Evidence |
| --- | --- | --- |
| M-1 | Fixed | `types.ts:2031` adds `'invoke-phase'`; `:2044-2045` adds `phaseKind?: PhaseKind`. Builder `:282-288`, `:306-313`, `:330-336` return `{ action: 'invoke-phase', phaseKind: 'tests' }` for `qa`, with no `agent`. Spec `:282-284` checks `action`, `phaseKind` and that `agent` is undefined. Help text `system-namespace.builders.ts:392` and `:406-409` describe both actions and the phase kinds. No other consumer exists. End-to-end wiring is complete. See r2-1 for test depth. |
| m-1 | Fixed | `agent-process-manager.service.ts:1027` computes `phaseKind = request.phase?.kind ?? previous?.phaseKind` once. Effort (`:1031`), record (`:1070`) and adapter input (`:1181`) use the same value. Spec `agent-process-manager.service.spec.ts:796-818` resumes a `review` lane without a new phase and expects `phaseKind: 'review'` and `reasoningEffort: 'medium'`. |
| m-2 | Fixed | `cli-adapter.interface.ts:113` adds `phaseKind` to `CliCommandOptions`. `claude-cli.adapter.ts:538` calls `isReviewerOrTester(name, input.phaseKind)`. Spec `claude-cli.adapter.spec.ts:332-342` is a real regression case: before the fix, `custom-reviewer` added `medium`; now `effort` is undefined for an `implement` lane. |
| m-3 | Fixed | `validate-orchestration-skill.ts:126-130` builds `RETIRED_ALIASES` from `RETIRED_ROLES`. `:742-755` requires `Retired; alias of .*<kind>` for each of the 7 slugs. Catalog rows `:120-126` match. See r2-3. |
| m-4 | Fixed | Both `review.md` copies, Method lines 17-19, hold the three rules. `step-2-learned-differences.md:7` records the `REVIEW_FOCUS` drop and its reason. |
| m-5 | Fixed | `decisions.md` adds a "Follow-ups" table with F-S2-1 and the C2-2 reason. |
| n-1 | Fixed | `lane-spawn-policy.ts:364-366` says the phase kind wins and the name rule applies only without one. |
| n-2 | Fixed | `task-spec.contract.ts:115` points at `phases/tests.md`. |
| n-5 | Fixed | `agent-role-resolver.service.spec.ts` adds `['senior-tester', 'no origin entry']` to the custom same-name cases, and a new `it.each` rejects all four step 2 slugs with the correct phase hint. |
| n-3, n-4, n-6 | Deferred | No change, as agreed. |

## Duplicate-lane check

- `fix-2-review-result.md` is a step 1 artifact (committed in `7e9e87a17`, items N1-N4). Its
  mtime is 13:10, but `git diff HEAD` shows no content change. The second lane rewrote it with
  the same text or only touched it. No content was lost.
- I found no duplicated edit: each fix appears once (one `invoke-phase` branch per path, one
  F-S2-1 row, one copy of the three `review.md` rules, one `phaseKind` field in the interface).
- Two changes are not in either fix report. They are probably from the second lane:
  `rival-targets.agent-model.spec.ts:220-247` (step 2 slug sync with and without wizard origin)
  and whole-file Prettier output in `validate-orchestration-skill.ts` and the `review.md`
  frontmatter. Both are consistent with the intent. See r2-4 and r2-5.

## New findings

### Blocking

None.

### Serious

None.

### Minor

**r2-1. Only one of three `qa` branches has a test, and the phase kind is hard-coded three times.**
`orchestration-namespace.builder.ts:282-288` (rejected checkpoint) and `:306-313` (missing
documents) have no spec. Only the "advance into qa" branch (`:330-336`) is tested (spec `:282`).
`PHASE_AGENTS.qa` (`:56`) now holds `['tests', 'review', 'visual-review']` but no code reads it:
the three branches return the literal `'tests'`. A maintainer who edits the map will see no
effect. Impact: low. Behavior is correct today. Correction: replace the `qa` entry with a typed
map such as `const PHASE_KIND_BY_PHASE: Partial<Record<OrchestrationPhase, PhaseKind>> = { qa: 'tests' }`,
set `PHASE_AGENTS.qa` to `[]`, use one helper for the three branches, and add spec cases for a
rejected `qa` checkpoint and for `qa` with missing documents.

### Nit

- **r2-2.** `system-namespace.builders.ts:392` says `invoke-phase provides phaseKind (tests,
  review or visual-review)`. The builder returns only `tests`. Say "for example `tests`", or
  make the builder return the next QA phase kind.
- **r2-3.** `validate-orchestration-skill.ts:127-130` calls `phaseKindForRole(slug)`, which can
  return `null`, although each `RETIRED_ROLES` entry already has `phaseKind`. Use
  `({ slug, phaseKind }) => ({ slug, kind: phaseKind })`. Also, `.*review\b` at `:744` also
  matches a row that says `visual-review`, so a wrong `review` row for a reviewer slug passes.
  Anchor the kind on the backticks: `` `${kind}` ``.
- **r2-4.** Format churn grew. `validate-orchestration-skill.ts` shows 308 changed lines, most
  from Prettier. The `review.md` frontmatter changed from double to single quotes in both
  copies (YAML is equivalent; `gray-matter` parses both). Add both to the n-4 note in the PR body.
- **r2-5.** `rival-targets.agent-model.spec.ts:220-247` is a good test, but no fix report
  names it. Record it in the batch or fix result so the PR test plan lists it.

## Five logic answers

1. Failure that looks like success: none found. A model that gets `invoke-phase` and only reads
   `agent` gets `undefined`, not a wrong name. This is a loud failure, which is correct.
2. Surprising user action: a rejected `qa` checkpoint sends the user back to `tests`, not to the
   phase that was rejected. This was also true before (agents[0]); not a regression.
3. Input with a wrong answer: none found. A resumed lane with a different new phase uses the new
   phase (`??` order at `:1027`).
4. Dependency failure: unchanged. A missing `previous` record gives `undefined` phase kind and the
   name rule applies, as before.
5. Missing requirement: none for step 2. F-S2-1 is recorded as a follow-up.

## Five style answers

1. Breaks in six months: the dead `PHASE_AGENTS.qa` data (r2-1).
2. Misread by a new maintainer: the help text that lists three phase kinds (r2-2).
3. Maintenance cost: low. The validator now derives aliases from `RETIRED_ROLES`, so step 3 and
   step 4 need no validator edit.
4. Local pattern inconsistency: `cli-adapter.interface.ts:113` uses an inline
   `import('@ptah-extension/shared').PhaseKind` type. The file elsewhere uses top-level imports.
   Nit level; included here, not as a separate finding.
5. Clearer alternative: a typed phase-kind map for `qa` (r2-1).

## Data flow

`spawn request.phase.kind` or `previous.phaseKind` → `phaseKind` (`:1027`) →
`resolveReasoningEffort` → `isReviewerOrTester(name, phaseKind)` → `reasoningEffort`; the same
`phaseKind` → record (`:1070`) and adapter options (`:1181`) → Claude adapter fallback (`:538`).
`getNextAction` → `OrchestrationNextAction { action: 'invoke-phase', phaseKind }` → model that
reads the help text.

## Edge cases checked

Resume without a phase (spec), resume with a new phase (source), no phase and reviewer name
(name rule kept for provider CLI lanes), `implement` phase and reviewer name (spec), retired slug
with and without wizard origin (resolver spec, rival-targets spec).

## Remaining uncertainty

- Jest and `validate-skill` results are from the fix lane, not from me.
- The official role census was not run in round 1 or round 2.

## Phase file fitness

What helped:
- "Recheck each finding after revision" in `acceptanceStep` made the round 2 structure clear.
- The five logic and five style questions gave a fixed checklist, so I did not miss the
  dead-data and help-text issues.
- "Require a regression case for a fixed bug" let me judge the m-1 and m-2 specs as real
  evidence and the M-1 spec as partial (r2-1).
- The new Method lines ("A passing check that does not exercise the new behavior is not
  evidence") applied directly to the untested `qa` branches.
- The Escalation rule "mark the review limitation" covered the refused Jest command.

What was missing or unclear, compared to a role template:
- No guidance for a re-review round: the report shape for "fixed / still open / new" is not
  defined. The old templates also lacked it, but a recheck table would help.
- The Output contract lists many sections (data flow, requirements fulfillment, maintenance
  debt) with no length rule. For a small round 2 diff this produces padding.
- Severity names differ: the contract says "blocking/serious/minor", round 1 used
  Major/Minor/Nit. The phase file does not define the bands or map them to the verdict
  (for example, "REVISE if any blocking"). The role templates had a score band table.
- No rule for unattributed changes (edits that no fix report names), which this round had.
- The lane cannot run Jest without approval, and the phase file says "run only scoped, relevant
  checks" with no fallback when a check is refused. One sentence on the evidence source in that
  case would help.
