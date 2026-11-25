# Final router fix report

TASK_2026_2326_5d16 on `fix/route-decide-predictability`, based on `9e1461e07`.

## Findings

Routing file paths in this table are relative to `libs/backend/lane-routing/src/lib/`. MCP file paths are relative to `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/`.

| Finding | Change | Focused regression |
| --- | --- | --- |
| G4b-1 | `decision-model/decision-caller.ts:139` supplies the configured target timeout to admission. `pipeline/model-call.ts:109` gates against the smaller of the deadline remainder and target timeout and reports that budget. | `pipeline/model-call.spec.ts:296` **skips estimates that fit the route deadline but exceed the target timeout**. `route-decide.gate.spec.ts:309` verifies the target timeout and cost reason on chosen rows. |
| G4b-2 | `route-decide.service.ts:648` uses the per-read `rows` timeout for unpinned unavailable rows, including reviewer-family exclusion. Existing pin checks still qualify pinned rows. | `route-decide.gate.spec.ts:434` **attributes reviewer-family unavailability to the timed-out rows read**. It checks the selected implementer and the suffix on both reviewer text fields. |
| G4b-3 | `decision-model/decision-payload.ts:87` indexes figures by lane and task kind. At line 114 a question without a task kind keeps every matching lane/task-kind tuple and totals its sample counts. | `decision-model/decision-payload.spec.ts:87` **retains figures and totals samples for offered lanes when taskKind is omitted**. It includes a second task kind and an unrelated lane. |
| G4b-4 | `pipeline/model-call.ts:100` protects acquisition and setup with `finally`. At line 148 the abort listener releases ownership and records the measurement once. A late completion cannot release a subsequent request's slot. | `pipeline/model-call.spec.ts:312` **releases admission if setup throws after reserving the target** and line 325 **releases an aborted target before transport settles and preserves the next reservation**. `route-decide.gate.spec.ts:331` exercises the same behavior with an unresolved transport at the service boundary. |
| G4b-5 | `pipeline/model-refine.spec.ts:61` exercises alternate removal across two sendable phases. The new test at line 84 puts an alternates-only phase in the sendable window and shows it is omitted by fitting. Service specs cover cost, request-reason propagation and overlap. | **omits an alternates-only phase during fitting inside the question cap**. `route-decide.gate.spec.ts:309` checks cost reasons stay off question-cap rows, line 331 checks model-busy and recovery, and line 690 checks the DI-wired prefill setting and pre-flight reason. `pipeline/model-call.spec.ts:353` checks invalid and throwing settings fall back to the measured rate and the exception is logged once. |
| Final-1 | `route-tool-handlers.ts:137` and line 242 share the absolute tool-entry deadline. Clock checks before and between attempts, including trace sizing, stop optional compaction at expiry. The final attempt strips optional trace fields and retains the existing overflow error. | `route-tool-handlers.compaction.spec.ts:93` **uses only $attempts serialization attempts with $timeLeft ms left (legacy overflow: $overflow)**. The injected clock advances during serialization. Cases cover pre-expiry, mid-compaction expiry, public-schema parsing and legacy overflow. |
| Final-2 | `reasons/compile-reasons.ts:848` packs the display prefix, then removes trailing entries until the marker for the actual omitted count fits. | `reasons/compile-reasons.spec.ts:1160` **fits exactly 4000 characters when omitted diagnostics grow to %i** at both 9 → 10 and 99 → 100. Line 1178 checks a 4,000-character fill with no omissions. |
| Final-3 (D16) | `contracts/route-decide-result.schema.ts:111` requires 1–120 characters if `overrideLabel` is present. | `contracts/contracts.spec.ts:235` **accepts override labels from 1 to 120 characters**. It rejects the empty string and preserves acceptance of the built-in label and the 120-character boundary. |
| Final-4 | `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md:76`, line 87, line 95 and line 159 align the equation, promotion, sample row and fallback descriptions with the producer. Both `skills/agent-lanes/SKILL.md:66` and both `skills/orchestration/references/lane-assignment.md:41` now describe the compaction sequence. | `route-decide.gate.spec.ts:884` **produces the documented R2 review ranking and deciding factor**. It reads the published JSON example and compares the entire row to a real service result. The handler compaction spec covers the documented return path. |

## Documentation verification

| Claim | Implementation |
| --- | --- |
| Optional override in the total and the built-in design/visual-review case | `ranking/score.ts:234`, `pipeline/phase-plan.ts:256`, `ranking/spread.ts:131`. |
| Promotion is scoped to non-system-CLI lanes and system CLI alternates must be reported and in the score band | `ranking/score.ts:129`, line 146, and `pipeline/phase-plan.ts:445`. |
| Plain R2 selects opus/high for this review shape and the deciding factor is score | `pipeline/tier-effort-policy.ts:53`, `pipeline/assemble-gate.ts:492`, and the exact producer regression above. |
| Admission uses the smaller budget, and model-cold applies to local daemon targets without a positive probe | `pipeline/model-call.ts:109` and `route-decide.service.ts:425`. The probe path covers unloaded, unknown, timeout, rejection and HTTP errors. If the route budget is already inadequate, the deadline guard takes precedence. |
| The byte cap covers both lane choices and fixed criteria | `pipeline/model-refine.ts:178`, line 253 and line 346. |
| Initial shortlisting keeps the choice and best eligible alternative, and later batches can remove trace entries before explanations are reduced | `route-tool-handlers.ts:98` and line 137. Expiry skips to the legacy shape. |

## Decisions

- G4b-3 preserves the optional input contract. The legacy criterion sample count sums its offered lane's retained task-kind counts, while explicit task kinds keep the existing exact-match behavior.
- Final-2's 4,001-character scenario does not follow from the reviewed loop. On rejection, the actual omitted count equals the count reserved by the previous accepted line. The revised packer tests the actual marker directly and also keeps the full diagnostics when every line fits without a marker.
- Final-1 bounds optional attempts. The single required legacy serialization and budget check are synchronous, so they run once even when the deadline has expired.
- The two agent-lanes copies differed by an old paragraph naming specific Ptah tools. I used the packaged copy's existing lane-policy text as the common version and verified both skill pairs are byte-identical.
- The Ptah skill search found `technical-content-writer` and had no hit for `resilient-nestjs-patterns`. I read the repository copies, including the resilience fallback reference. Ptah's dependency graph reported partial coverage, so scoped `rg` and source reads verified the caller and documentation paths.
- The previous alternates test's `offered.has('third') === false` assertion became `offered.has('second') === false` with an empty question-cap set in the new fitting test. The separate existing question-cap test still asserts that the third question is capped. The contract test gained rejection of the empty label. Existing boundary expectations were retained.

## Checks

### Lane routing Jest

```sh
npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts libs/backend/lane-routing/src/lib/route-decide.preflight.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-payload.spec.ts libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts libs/backend/lane-routing/src/lib/contracts/contracts.spec.ts libs/backend/lane-routing/src/lib/pipeline/assemble-gate.spec.ts
```

Final run passed 8 suites and 294 tests. The first run passed 293 tests before the full diagnostic fill and documentation comparison were added. During the intermediate runs, the documentation test first hit a duplicate import, then exposed the missing chosen-row model-list status and reason clause. Both were corrected. Output is in `.ptah/tmp/final-lane-jest{,-2,-3,-4,-5}.log`.

### MCP Jest

```sh
npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.compaction.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.spec.ts
```

Both runs passed 2 suites and 29 tests. Node emitted the Jest config module-format warning. Output is in `.ptah/tmp/final-tools-jest{,-2}.log`.

### TypeScript

```sh
npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json
npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json
```

Both exited 0 with zero diagnostics. Output is in `.ptah/tmp/final-{lane,tools}-tsc.log`.

### ESLint

```sh
npx eslint libs/backend/lane-routing/src/lib/contracts/contracts.spec.ts libs/backend/lane-routing/src/lib/contracts/route-decide-result.schema.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts libs/backend/lane-routing/src/lib/decision-model/decision-payload.spec.ts libs/backend/lane-routing/src/lib/decision-model/decision-payload.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-call.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts libs/backend/lane-routing/src/lib/reasons/compile-reasons.spec.ts libs/backend/lane-routing/src/lib/reasons/compile-reasons.ts libs/backend/lane-routing/src/lib/route-decide.gate.spec.ts libs/backend/lane-routing/src/lib/route-decide.service.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.compaction.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.ts
```

Exit 0 across 14 files. Zero errors and one existing `max-lines` warning in `reasons/compile-reasons.ts:798`. Output is in `.ptah/tmp/final-eslint.log`.

### Formatting and scope

```sh
npx prettier --write apps/ptah-docs/src/content/docs/agents/agent-orchestration.md
git diff --check
git diff --exit-code HEAD -- libs/backend/lane-routing/src/lib/decision-model/system-one.client.ts libs/backend/lane-routing/src/lib/decision-model/system-one.residency.ts libs/backend/lane-routing/src/lib/decision-model/decision-model.config.ts libs/backend/lane-routing/src/lib/decision-model/decision-model.target.ts
cmp .claude/skills/agent-lanes/SKILL.md plugins/ptah-core/skills/agent-lanes/SKILL.md
cmp .claude/skills/orchestration/references/lane-assignment.md plugins/ptah-core/skills/orchestration/references/lane-assignment.md
```

Prettier exited 0 on each of its three runs. The diff checks and both comparisons exited 0. All nine findings were addressed. The worktree remains at `9e1461e07`.
