# Fix-commit re-review — d3c74ea27 (final-pr-review.md Findings 1 and 2)

Branch: `refactor/lane-batching-model-routing` at `d3c74ea27`.
Scope reviewed: `git show d3c74ea27` in full (2 files, +29/-6). Read whole: `phase-plan.spec.ts`,
`tier-effort-policy.ts`, `route-tools.ts`, `route-tools.spec.ts`, `route-decide-args.schema.ts`,
both `lane-assignment.md` copies. Grepped every weight-recipe mention in the worktree
("plus 10% framing", "estimated source tokens", "write sets"). Read-only; no repo file was
edited. No verify, build or workspace-wide command was run, per the task rules; the green
scoped verify (lane-routing + vscode-lm-tools: 4/4 lint+typecheck, 2/2 test) is quoted from
the task brief, not re-run here.

## Verdict

**APPROVED**. Both Minor findings are fixed as recommended, and the fix introduces no new
defect.

- **Finding 1 (weight recipe drift) — fixed.** `route-tools.ts:120-121` now says `weight` is
  "estimated source tokens in its batch read and write sets, plus 10% framing" — the same
  recipe as `plugins/ptah-core/skills/orchestration/references/lane-assignment.md:23-24` and
  its byte-identical `.claude` copy. The worktree grep finds the 10% margin in all seven
  recipe sites: both `lane-assignment.md` copies (`:24`), both `team-leader-modes.md` copies
  (`:36`), `.claude/agents/team-leader.md:234`, the team-leader template
  (`agent-generation/templates/agents/team-leader.template.md:215`), and `route-tools.ts:121`.
  No other site describes the recipe without the margin. The 7,300-token scenario from the
  original finding now routes to the same tier whichever text the caller follows. The bounds
  the skill adds ("integer 0-200000") are enforced and advertised by the generated
  inputSchema (`weight: { type: 'integer', minimum: 0, maximum: 200000 }`, pinned at
  `route-tools.spec.ts:74`; the zod field at `route-decide-args.schema.ts:37` carries no prose
  description), so the tool text omitting them is not a second drift. The description test
  (`route-tools.spec.ts:81-88`) pins only substrings, so the longer text passes with no stale
  pin.
- **Finding 2 (helper couples shape to weight) — fixed.** `phase-plan.spec.ts:68-99` now
  takes `SubagentPhaseHints { shape?, weight? }` and spreads the two fields independently
  (`phase-plan.spec.ts:89-90`), so a shape without a weight and a weight without a shape are
  both expressible — exactly the recommended fix.
  - New case "uses the R4 middle bucket for a mechanical phase without a weight"
    (`phase-plan.spec.ts:107-113`): `{ shape: 'mechanical' }` on kind `implement` expects
    `{ tier: 'sonnet', effort: 'medium', ruleId: 'R4' }`. Correct per
    `tier-effort-policy.ts:28-31`: an undefined weight fails both `weight !== undefined`
    guards, so the middle bucket at line 31 applies. The case also asserts the plan carries
    `shape: 'mechanical'` and `weight: undefined` through the real `planRoutePhases`
    (construction sites `phase-plan.ts:152-153`, `:190-191`), and that the ranked row gets
    model `sonnet`, provenance `tier`.
  - New case "uses R5 for a weight-only phase and carries the weight on the plan"
    (`phase-plan.spec.ts:115-121`): `{ weight: 9000 }` on kind `implement` expects
    `{ tier: 'opus', effort: 'high', ruleId: 'R5' }`. Correct per
    `tier-effort-policy.ts:33-35`: no shape skips R3 and R4, and `9000 >= 8000` selects
    opus/high. Also asserts `shape` undefined, `weight` 9000 on the plan, and model `opus`,
    provenance `tier`, on the ranked row.
  - The old three cases keep their meaning; each new call is input-equivalent to the old one:
    `subagentPlan(2000)` -> `subagentPlan({ shape: 'mechanical', weight: 2000 })` (same R4
    haiku/low), `subagentPlan(2000, 'haiku')` -> `subagentPlan({ shape: 'mechanical',
    weight: 2000 }, 'haiku')`, and `subagentPlan(undefined, 'haiku')` ->
    `subagentPlan({}, 'haiku')` — the old helper spread nothing when weight was undefined, so
    both produce a legacy phase with no shape and no weight (R5 sonnet/medium). All five
    cases call the real `planRoutePhases`; the stub matrix fixes only scores, so the
    assertions pin the real policy propagation. The pipeline-coverage gap the finding named
    is closed; `tier-effort-policy.spec.ts` keeps the unit-level rule coverage. The narrow
    `'mechanical'` literal type on `SubagentPhaseHints.shape` loses nothing: every call site
    needs only mechanical or nothing, and the `logic` shape is covered by the literal
    multi-phase case at `phase-plan.spec.ts:46-66`.

## Findings

1. **Minor (non-blocking polish)** — the realigned recipe phrase is pinned by no test.
   - `route-tools.spec.ts:81-88` pins the description's tier-semantics phrases
     (`"tier" is the model alias to pass`, `for CLI lanes, both are advisory`) but not the
     weight recipe. The `plus 10% framing` text at `route-tools.ts:121` is routing-load-bearing
     (the margin decides which side of the 8000/4000/12000 boundaries a batch lands on), and
     it already drifted once — that drift is why this commit exists. No test fails if the
     phrase is dropped again.
   - Fix (one line): add `expect(description).toContain('plus 10% framing');` to the
     `describes phase inputs and roster outputs` case. Reversible; does not block this commit.

No other finding. Nothing blocking remains against the plan contract.
