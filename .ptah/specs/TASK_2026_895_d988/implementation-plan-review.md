# Implementation plan review (Gate 2) - TASK_2026_895_d988

Reviewer: independent Claude-family subagent (different family and side from the Codex author). Document review only, no code run.

## Verdict

REVISE. The design is sound and in scope, but two Serious defects must be fixed before decomposition: existing result-schema fixtures that the required tier/effort fields break are not in any batch write set, and the B5 verification command is not in the allowed form.

## Findings

1. **Serious - Batches B1-B4 (write sets), Design B "Update ... typed fixtures"**. Making `tier`/`effort` required on chosen and unavailable rows breaks two existing lane-routing specs that no batch writes:
   - `libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts:449-470` calls `ChosenEntrySchema.safeParse({...})` with no tier/effort and asserts `success === true`.
   - `libs/backend/lane-routing/src/lib/ranking/hard-constraints.spec.ts:221` calls `UnavailableEntrySchema.safeParse(...)`, and its untyped `chosen` fixture at `:29-40` is used as a roster entry (`:419`, `:434`).
   The plan's risk section says to assign discovered fixtures to a project batch, but it already knows of these. B3 lists only `compile-reasons.ts` ("only if needed"), not the spec. Fix: add both specs to the B3 or B4 write set with read ranges (B3 for compile-reasons.spec, B4 for hard-constraints.spec), and state the required-field change in B1's excerpt. B1 on its own leaves `-p @ptah-extension/lane-routing` red until B3/B4, so say explicitly that lane-routing verify is only expected green at B4, or put the schema change and its fixture fixes in one batch.

2. **Serious - B5 verify command**. `npm run verify -- -p @ptah-extension/vscode-lm-tools ptah-electron` uses a space. The required form is comma-separated: `npm run verify -- -p @ptah-extension/vscode-lm-tools,ptah-electron` (`ptah-electron` is the Nx name, `apps/ptah-electron/project.json:2`). As written, `ptah-electron` becomes a stray positional argument and the Electron check may not run. Fix the command and require the "Running target ... for N projects" header check from CLAUDE.md.

3. **Moderate - Mojibake in the plan (point 5)**. The plan file on disk contains mojibake (`â€”`, `â‰¥`, `â†’`, `â€“`, `4kâ€“12k`, in Verified contracts, the R1-R5 table, Section C and the batch lines). These strings are meant to be copied inline into `batches.md` entries and into docs (`>=8k`, `->`). The plan must add an explicit instruction: files are UTF-8 without BOM; copy text from the plan only after correcting it; prefer ASCII (`>=`, `->`, `-`) in new doc text; before each doc batch commit, grep the touched files for `â€`/`â‰`/`â†` and fix the plan file itself. The existing docs contain real non-ASCII characters, so paired-copy edits must preserve them.

4. **Moderate - B6/B8 (docs batches) verify**. `-p @ptah-extension/agent-generation` does not exercise `plugins/ptah-core/skills/**` or `.claude/skills/**`. The gate that does is `npm run validate-skill` (`scripts/validate-orchestration-skill.ts`, run in `.husky/pre-commit:30`). It has a 300-line SKILL.md target (`:~155`; current `plugins/ptah-core/skills/orchestration/SKILL.md` is 231 lines), required file lists (`:138-142`) and reference checks. Add to B6/B7 acceptance: SKILL.md stays under the target and pre-commit `validate-skill` passes (run as a hook, or under `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill`).

5. **Moderate - Section B, rules R3/R4/R5**. Behaviour change for legacy callers is not spelled out. With shape omitted, every non-plan/review kind falls to R5 (sonnet below 8k, opus at 8k and above). Unknown weight takes the middle bucket, so legacy calls stay sonnet, which matches the old `tierFor` (`phase-plan.ts:346-356`). But R4 introduces `haiku` for subagents, and `scoreCandidate` (`phase-plan.ts:282`) and `FallbackModel` provenance 'tier' have only produced opus/sonnet so far. B2 must verify that downstream code (the decision payload, `applyPinModel` at `:310-343`) handles `haiku`, and add a test that haiku is never produced without an explicit shape plus weight under 4k. Also say that R5's "review" shape on a non-review kind is intentional.

6. **Minor - Section B**. The `max` effort exists in the enum but no rule produces it. Acceptable, but say that the policy spec asserts none does. Also state how unavailable rows get tier/effort when the phase has no ranked candidate: the plan says "from phase plans", so confirm a PhasePlan always exists per phase.

7. **Minor - Section A**. context.md lists A1-A8, not A9. All eight are covered (weight band, read/write sets, inline contracts, contracts first, heavy-file split, shape-to-tier, Nx alignment, estimate vs actual). No scope creep found: per-CLI tier map is deferred (Section C last line, Decisions table), and no decision-model timeout work appears.

8. **Minor - Batch weights**. B6 (14.9k), B8 (14.0k) and B9 (15.1k) sit just under the plan's own 16k ceiling and are doc pairs of two copies each. Acceptable, but note they are past the stated 12k target band. Record this as an exception or split each into source and copy halves.

## Spot checks

| Claim | Result |
|---|---|
| `route-decide-args.schema.ts:19-59` strict phase `{id,kind,role?,reviews?}`, gate fields, 1-100 phases, optional pins/preferences | Confirmed (`:19-26`, `:36-59`). Optional `shape`/`weight` additions are backward compatible; `.strict()` still rejects unknowns. |
| `phase-plan.ts` `tierFor` ~346 returns opus for plan/architecture/review/document-review, else sonnet | Confirmed at `:346-356`; used at `:282`. |
| `route-decide-result.schema.ts:72-153` strict chosen/unavailable rows, unavailable `model: z.null()` | Confirmed (`:104-153`). Neither row has tier/effort today. |
| `route-tools.ts:110-123` input schema generated from `RouteDecideArgsSchema`, prose description | Confirmed (`:110-124`); the description must be edited by hand (B5 covers this). |
| `plugins/ptah-core/skills/**` is the source of `.claude/skills/**` copies | Confirmed: both trees exist, are git-tracked, and `orchestration/SKILL.md` is byte-identical (`cmp`). The `validate-skill` script reads `plugins/ptah-core/skills/orchestration` (`validate-orchestration-skill.ts:~148-155`). |
| Agent-generation team-leader template pairs with `.claude/agents/team-leader.md` | Confirmed: `scripts/validate-orchestration-skill.ts:168` points to `team-leader.template.md`, and the agent file is tracked. |
| No other consumer of the result schema breaks | Refuted: two lane-routing specs break (finding 1). Other consumers are safe: `route-namespace.builder.spec.ts:28` is a pre-flight result, the rpc-handlers host-routing specs use pre-flight results, and the frontend `roster` uses are unrelated session-agent rosters. |
| System One cannot invent model IDs; pins unchanged | Plausible: the plan keeps the pinned payload (`decision-payload.ts:56-75`) and puts policy in deterministic code before System One. Pin semantics are stated as unchanged. B2/B4 acceptance should include a pin test for a subagent model. |
| Rule table R1-R5 coherent and deterministic | Yes: ordered, mutually exclusive by kind/shape, with defined unknown-weight handling. Boundary tests are required in B2. |
| Contracts first, deps, parallel flags | B1 first. B6/B7/B8 are file-disjoint and marked parallel, B9 serial after them. B2-B5 are serial. Consistent. |
| Electron coverage | B5 intends `ptah-electron`, but the command is malformed (finding 2). The renderer has no direct consumer, so no renderer batch is needed (consistent with the plan's search). |


## Re-review (round 1)

Verdict: APPROVED

Checks: revised plan read (Revision log, Section B/C, B1-B9 entries); one Grep across `libs/` and `apps/` in the worktree for `ChosenEntrySchema|UnavailableEntrySchema|RouteDecideResult|RosterEntry|PhasePlan`; plan file scanned for BOM and mojibake (none).

1. Finding 1 (Serious, unassigned result-schema fixtures) -> fixed. `hard-constraints.spec.ts` is in the B1 write set with read ranges, `compile-reasons.spec.ts` is in the B3 write set with read ranges. B1-B3 state that lane-routing verify may stay red until B4, and B4 is named the first expected green gate. The remaining typed consumer, `route-tool-handlers.spec.ts` (`withReasons`, status 'chosen' literal at about :252), is in B5's conditional write set. `host-routing.*.spec.ts` only use `RouteDecideResult` as a type for pre-flight results, and `confidence.spec.ts` uses the separate `ConfidenceRosterEntry` type. No unassigned consumer of the result schema remains.
2. Finding 2 (Serious, B5 verify) -> fixed. B5 uses `npm run verify -- -p @ptah-extension/vscode-lm-tools,ptah-electron` and requires the header to show both projects. All other batches use the `-p A` form.
3. Finding 3 (Moderate, mojibake) -> fixed. The file has no BOM, `grep -c 'â€'` returns 0, and Section A requires UTF-8 without BOM, ASCII-preferred prose and a pre-acceptance scan of touched files.
4. Finding 4 (Moderate, validate-skill) -> fixed. B6-B9 acceptance requires the pre-commit validate-skill hook to pass, and B6 adds the 300-line SKILL.md target.
5. Finding 5 (Moderate, haiku) -> fixed. Section B's rule table (R4) restricts haiku to mechanical/test/docs shape under 4k and defines unknown-weight buckets. B2 acceptance requires no haiku without an eligible shape and weight, plus downstream decision-payload/applyPinModel handling. B4 adds a subagent-model pin case.
6. Finding 6 (Minor) -> fixed. Section B says a PhasePlan exists for every phase, and a spec asserts `max` is not emitted.
7. Finding 7 (Minor) -> no change needed.
8. Finding 8 (Minor) -> fixed. Section B records B6/B8/B9 as paired-copy exceptions and the options to split them.

Parallel batches: B6, B7 and B8 write disjoint file sets (orchestration SKILL.md and lane-assignment.md, team-leader-modes.md, and agent-lanes SKILL.md). B9 is serial after them. B1-B5 are serial. This is OK.

New findings (none Blocking or Serious):
- N1 (Moderate) B2 write set / `libs/backend/lane-routing/src/lib/pipeline/phase-plan.spec.ts:6-17`. The `plan()` helper builds a `PhasePlan` literal. If B2 makes the new policy field required on `PhasePlan`, this spec stops typechecking. It is not named in any write set; B4 only has the vague catch-all "smaller same-project fixture if scoped diagnostics name it". Recommend adding it to B2's write set, or making the field optional.
- N2 (Minor) B5 read set. `route-tool-handlers.spec.ts` ranges 20-55 and 120-145 do not cover the typed chosen-roster literal at about :224-275, which needs tier/effort. Extend the range.
