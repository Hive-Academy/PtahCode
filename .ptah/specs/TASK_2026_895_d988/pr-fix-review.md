# PR fix-round review — TASK_2026_895_d988, PR #1015

Review of the uncommitted diff (working tree vs HEAD) in worktree
`D:\projects\ptah-extension\.claude-worktrees\lane-batching-model-routing`
(branch `refactor/lane-batching-model-routing`). Read-only review.

## Verdict: APPROVED

| Metric              | Value |
| ------------------- | ----- |
| Verdict             | APPROVED |
| Blocking issues     | 0 |
| Serious issues      | 0 |
| Moderate issues     | 0 |
| Minor issues        | 2 |
| Score               | 8/10 — sound logic, no new failure mode; two Minor gaps below the fix line |

The three CodeRabbit findings are fixed correctly. The alias pin now takes
effect end to end: score, roster `model`, roster `tier`, provenance `tier`
and the reason suffix all carry the pinned alias, while policy `ruleId` and
`effort` stay from the phase policy. Both doc copies match. No Blocking,
Serious or Moderate defect was found. The two Minor items do not invalidate
the round.

## Defects

1. **Minor (docs).** `.claude/skills/orchestration/references/lane-assignment.md:22`
   (and `plugins/ptah-core/skills/orchestration/references/lane-assignment.md:22`):
   the new post-decomposition instruction says to pass "the same user pins and
   preferences" in the second `stage:'gate-0.1'` call. The first call's pins
   name the planned phase ids; the second call's phases are batch ids. The args
   schema rejects a pin whose `phaseId` is not a phase of that same call
   (`libs/backend/lane-routing/src/lib/contracts/route-decide-args.schema.ts:102-107`,
   "pin phase id must name a phase"). Followed literally with the first call's
   pin entries, the second call fails validation. The sentence should say to
   re-key each pin to the batch phase it covers (same executor and model).
   Failure is loud and recoverable, so Minor.

2. **Minor (test coverage).** `libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts:334`:
   the guard `if (listed === undefined && !laneDefault && !tierPin) return scored;`
   is now the only barrier that keeps an arbitrary string out of a subagent
   roster row, but this round repurposed the only test that exercised it
   (the old "keeps the selected sonnet tier when a legacy phase pins unlisted
   haiku"). No test pins a non-alias model on a subagent. The "invalid pin
   model id never appears in the result" invariant is pinned only by the lane
   case, `route-decide.gate.spec.ts:907-925`. A later widening of
   `applyPinModel` would fail no test and could leak arbitrary strings into
   `model` while `tier` stays the policy tier. Also untested (pre-existing):
   a `LANE_DEFAULT_MODEL` pin on a subagent, and a lane pin whose model is a
   tier alias.

**Pre-existing observation, not counted as a defect of this round.** A
non-alias subagent model pin (for example a full model id) is silently
dropped: the row reports `model` and `tier` = policy tier, `provenance:
'tier'`, `source: 'pin'`, and the requested model appears nowhere in the
result (`phase-plan.ts:334` returns the policy-tier score;
`assemble-gate.ts:344-348` then reads the policy tier). The fix report
documents this retention as a decision. Lanes have the same silence (row
model becomes `lane-default`, `route-decide.gate.spec.ts:907`). If pin
disclosure is wanted, it is a follow-up.

## Five logic questions

### 1. How does this fail silently?

The only silent path is the pre-existing one above: a dropped non-alias pin
model looks like a successful pin (`source: 'pin'`, `pinAccepted: true`) while
the requested model never appears. For the code this diff changed, nothing
fails silently: the alias pin now reaches every output. The
`assemble-gate.ts:348` fallback to the policy tier is a silent default, but it
is unreachable in practice: a subagent row with `provenance === 'tier'`
always carries an alias (unpinned rows score the policy tier,
`phase-plan.ts:296-299`; pinned rows carry the pin, which the
`ModelTierSchema.safeParse` guard at `phase-plan.ts:333` already validated).

### 2. What user action produces unexpected behaviour?

- Pin a subagent to a full model id instead of an alias: silently ignored
  (pre-existing, see observation).
- Pin a subagent to `LANE_DEFAULT_MODEL` ('lane-default'): the row reports
  `model: 'lane-default'`, `provenance: 'lane-default'`, but `tier` stays the
  policy tier (`assemble-gate.ts:344-348`, safeParse of 'lane-default' fails),
  and the docs tell the consumer to pass `tier` as the Agent model alias
  (`lane-assignment.md:36-37`). The "no model override" intent does not reach
  the spawn. Pre-existing corner, unchanged by this diff and disclosed by the
  `model` field.
- Re-pass the initial pins verbatim in the post-decomposition call: rejected
  by the args schema (defect 1).

### 3. What input data makes this produce a wrong answer rather than an error?

A pin model outside `MODEL_TIERS` on a subagent produces a policy-tier row
instead of an error or a disclosed drop (pre-existing). A tier alias pinned on
a lane is ignored unless that alias is a listed model id for the lane
(`phase-plan.ts:333` requires `candidate.kind === 'subagent'`) — intended for
lanes, where the tier is advisory. An alias pin itself can no longer produce a
wrong answer: the alias set is the same enum the roster `tier` field validates
(`route-decide-result.schema.ts:104-106,118`), so no alias pin can produce a
schema-invalid row.

### 4. What happens when a dependency fails, times out, or returns a shape it should not?

`gathered.matrix.resolve` cannot throw for an unknown (family, model) pair: it
falls back to the family profile and then to an unknown cell with
`NEUTRAL_SCORE` and `noProfile: true`
(`capability-matrix.store.ts:496-505, 486-488`); `score.ts:187-212` enforces
that invariant. The seed matrix holds no subagent family profile
(`seed-matrix.ts:34`), so an alias pin resolves neutral exactly like the
unpinned policy tier — no new failure mode, and the pin still wins the phase
because `pinAccepted` forces the sole eligible candidate
(`phase-resolve.ts:31-37`). The service re-validates the assembled roster
against `GateResultSchema` (`route-decide.service.ts:299`), so a bad tier
would throw a named schema error, not leak.

### 5. What is missing that the requirements never mentioned?

The CodeRabbit finding said the alias pin must be honored. It did not say what
should happen to a non-alias subagent pin, to the effort, or to the
unavailable reason. The fix keeps effort from the policy (documented in the
fix report and visible in the reason: "policy R4; tier sonnet, effort low")
and keeps the unavailable reason on the policy tier — which is consistent:
`unavailableEntry` reports `tier: plan.policy.tier` and `model: null`
(`assemble-gate.ts:264, 320`), and a model pin can never make a phase
unavailable (only an executor pin can, `hard-constraints.ts:263-289`), so no
pinned tier exists there to print. Unspecified and unfixed: the pin re-keying
for the post-decomposition call (defect 1).

## Check-list verification

- **Pin logic paths.** Non-alias subagent pin: ignored, pre-existing
  (`phase-plan.ts:331-334`; subagents never have listed models because
  `facts` is lane-only, `phase-plan.ts:294-299,314`). Lane pin: alias models
  ignored unless listed or `LANE_DEFAULT_MODEL` (the `candidate.kind ===
  'subagent'` term guards this). `LANE_DEFAULT_MODEL`: lane-default
  provenance, tier stays policy tier. Unpinned subagent: policy tier,
  provenance 'tier', roster tier = policy tier — reason output byte-identical
  to pre-fix. Unavailable entry: policy tier in both the row and the reason —
  consistent (see question 5).
- **Changed-export callers.** `withPolicyReason` external callers:
  `compile-reasons.spec.ts:451,608` — both two-arg calls, byte-identical
  output through the new default parameter. `applyPinModel` is
  module-private; no other callers. `ModelTierSchema` callers: the two new
  sites plus the schema itself; the same-named `MODEL_TIERS` in
  `libs/frontend/core` and `ProviderSetModelTierSchema` in rpc-handlers are
  separate definitions (ptah symbol index was empty — Grep fallback used and
  named here).
- **Tests.** New behavior is covered: sonnet over an R4 haiku phase
  (`phase-plan.spec.ts:129-134`; `route-decide.gate.spec.ts:312-326` asserts
  `model`, `tier`, `effort`, `provenance: 'tier'` and the reason suffix) and
  the flipped haiku-over-R5 case (`phase-plan.spec.ts:136-141`). Gap: defect
  2.
- **Docs.** `diff -r --strip-trailing-cr .claude/skills/orchestration
  plugins/ptah-core/skills/orchestration`: identical. The SKILL.md load
  trigger, the frontmatter-model sentence, the two-call description and
  "post-decomposition routing call" agree across SKILL.md,
  lane-assignment.md and team-leader-modes.md. The route tool text
  (`vscode-lm-tools/.../route-tools.ts:122-123`) still says the subagent
  consumer passes `tier` as the model alias — now correct for pinned tiers.
- **TypeScript strict.** No `any`, `ts-ignore` or `as unknown` in the four
  changed code files (Grep clean); scoped `ptah_get_diagnostics` on those
  files: 0 errors, 0 warnings.
- **Test runs.** I did not run tests; the task said the implementer's
  `npm run verify -- -p @ptah-extension/lane-routing,@ptah-extension/vscode-lm-tools`
  run (exit 0) is the evidence. I ran no workspace-wide or build targets.

## Decisions

- The silent drop of a non-alias subagent pin model and the
  `LANE_DEFAULT_MODEL` subagent corner were judged pre-existing behavior, not
  defects of this round: the fix report documents the retention, the roster
  discloses the effective model, and neither path changed. Reversible: either
  can be re-raised as a follow-up.
- The unavailable-entry reason (policy tier) was judged consistent with the
  chosen-entry reason (effective tier): an unavailable phase has no chosen
  model, and a model pin cannot produce one.
- Defect 1 was kept Minor, not Moderate: the schema rejects the bad call with
  a field-naming error, so the failure is loud and recovery is one retry.
