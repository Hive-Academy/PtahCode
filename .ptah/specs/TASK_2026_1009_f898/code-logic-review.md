# Code logic review: B1, B2, B4 (TASK_2026_1009_f898)

## Verdict

REVISE, score 7/10. No Blocker. Two Serious findings. They are small and local.

Review family: anthropic-api; implementer family: codex

Evidence run: `npm run validate-skill` exits 0 on this branch (9 files, 0 errors). I ran no other check.

## Findings

| id | severity | file:line | scenario | fix |
|----|----------|-----------|----------|-----|
| 1 | Serious | `scripts/validate-orchestration-skill.ts` (`validatePhase`, heading loop) vs `libs/backend/lane-routing/src/lib/contracts/phase-definition-resolver.ts` (`sectionsFor`) | The validator and the resolver do not accept the same files. (a) The validator regex has the `i` flag. A file with `## method` passes the validator, but the resolver is case-sensitive and throws `MISSING_SECTION` at run time. (b) The validator accepts an empty `requiredCapabilities: []`. The resolver `list` schema needs `.min(1)` and rejects it. (c) The validator ignores unknown frontmatter keys. The resolver schemas are `.strict()` and reject them. (d) The validator takes the first duplicate heading, but the resolver takes the last one (`Map.set` overwrite). A later empty duplicate `## Method` passes the validator and fails the resolver. In each case CI is green and the router fails closed in production. | Make the validator match the resolver. Remove the `i` flag. Require `data.requiredCapabilities.length` to be above 0. Reject keys outside `version, kind, input, deliverable, verdict, acceptanceStep, requiredCapabilities, toolProfile` and outside `disallowedTools, permission`. Count each heading with `matchAll` and error when the count is not 1. Better: import `resolvePhaseDefinition` into the validator (or share one schema) so there is one source of truth. |
| 2 | Serious | `phase-definition-resolver.ts:44` (`sectionsFor` regex), and `validate-orchestration-skill.ts` `validatePhase` regex | The section regex is not aware of fenced code blocks. A line `## Foo` inside a fenced block ends the section early and silently truncates `text`, which is the discipline text sent to the lane. A fenced `## Method` can also define or replace a real section. Phase files are likely to show example output in fences. | Before the `matchAll`, mask fenced regions: `const scan = body.replace(/^(```\|~~~)[\s\S]*?^\1[^\n]*$/gm, (m) => m.replace(/^## /gm, '\u0000## '))`. Slice the section text from the original body by match index. Apply the same masking in the validator. Add a spec with a fenced `## Method` in a section. |
| 3 | Moderate | `phase-definition-resolver.ts:63-68` | Every error from `readDefinition` becomes `MISSING`, including `EACCES` and `EISDIR`. The cause is lost, and an operator looks for a missing file. | Catch only `ENOENT` as `MISSING`. Add a code `UNREADABLE` to `PhaseDefinitionErrorCode` for other errors. Do not put the path in the message. |
| 4 | Moderate | `scripts/validate-orchestration-skill.ts` `validatePhases` (active-flow gate) | The gate `^## Phase-kind flows` also matches inside a fenced block, which turns the "all 12 files required" check on by mistake. When the heading is in one copy only, the mirror byte check fails first, so that case is covered. When the heading is absent from both copies, the 12-file check, the unexpected-file check and the role check on the flow section are all skipped silently. That is by design for B4 before B3, but nothing re-enables it. | Make B3 (the batch that adds the heading) add a test or check that the heading exists. In the validator, mask fences before the regex. |
| 5 | Moderate | `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:309-310` and `:328` | Case (d): a lane exists but a hard constraint excludes it (for example `not-installed`). The status is `no-eligible-candidate`, and the reason becomes `...; No executor; the orchestrator does this phase`. The wording hides that lanes exist and were excluded. The spec only tests the empty-lane case. | Keep the text. Append the excluded rules when `plan.constraint.excluded.length > 0`, for example `... (excluded: codex:not-installed)`. Add a gate spec with one uninstalled lane. |
| 6 | Minor | `phase-definition-resolver.ts:51-52`, `:77-79` | A non-review kind with a `## Reviewer stance` section is accepted. `reviewerStance` is added to `definition` and `text`. The spec says nothing about this. It is harmless but it leaks reviewer text into an implement phase. | Reject it with `MISSING_SECTION`, or drop `reviewerStance` for non-review kinds. Choose one and add a spec. |
| 7 | Minor | `validate-orchestration-skill.ts` (`PHASE_KINDS` constant) | The validator keeps its own copy of the 12 kinds. A change to `PHASE_KINDS` in `libs/shared` does not fail the validator. | Import from `libs/shared/src/lib/types/phase-contract.types.ts` by relative path, or add a spec that compares both lists. |
| 8 | Minor | `validate-orchestration-skill.ts` `listFiles` | `entry.isFile()` is false for a symlink. A symlinked file is skipped on both sides and the byte check passes silently. | Add `entry.isSymbolicLink()` as an error. |

## Checked and correct

- Ten old kinds: `DEFAULT_ROLE` entries and `candidatesFor` are unchanged. `role === undefined` is possible only for `batch` and `completion` with no `phase.role`.
- `laneQuestion` and `alternateOptions`: `top = 0` applies only for an empty list. A non-empty list with only negative scores still takes `Math.max`, so results are unchanged.
- `hasExplicitRole` is set on both `plans.push` paths (unavailable and eligible).
- Case (a): a lane is eligible, so the roster is `chosen` (spec covers it). Case (b): no lane and no role gives `unavailable` plus the orchestrator reason. Case (c): an explicit role adds a subagent candidate and gives no orchestrator text. Case (e): a pin to an unknown or excluded target gives `pin-unavailable`, and the orchestrator text is not added (`exclusionReason` is not `no-eligible-candidate`).
- `reviewer-family` does not apply to `batch` or `completion` (`REVIEW_PHASE_KINDS` has two kinds), so the orchestrator text cannot wrongly mask a family block.
- `tier-effort-policy.ts`, `task-kind-mapping.ts`, `route-decide-args.schema.ts`: 12 kinds everywhere. Only `phase-plan.ts` `taskKindFor` and `hard-constraints.ts` use `PhaseKind` in a switch or a table. `taskKindFor` has both new cases. The two lists in `hard-constraints.ts` are `satisfies` subsets, which stay valid.
- gray-matter cache: it caches only when `options` is undefined. The code passes `MATTER_OPTIONS` on every call, so no stale or shared object returns.
- Non-null assertions in `sectionsFor` are safe: the first five headings are checked before use.
- Error messages contain only the kind and the code. No file content or path leaks (spec checks `foo:`).
- `text` is deterministic: fixed heading order, no map iteration.
- CRLF: the regex handles `\r?\n` after the heading. `.gitattributes` forces `eol=lf` on every checkout, so the mirror byte check gives the same result on Windows and Linux.
- Role census read: `ROLES` renamed, empty, or not an array literal throws a loud error (non-zero exit). It does not pass silently.
- Pre-commit pattern includes the plugin path. CI step: `ts-node` and `gray-matter` are root dependencies, `scripts/tsconfig.json` exists, and the script ran correctly here.

## Not checked

- I did not run the lane-routing Jest suite or the lane-outcomes suite.
- I did not check the frontend or `vscode-lm-tools` for hidden `PhaseKind` maps beyond a search for `PhaseKind` and `PHASE_KINDS` (only lane-routing and shared files matched).
- I did not run the CI job. The CI claim is from reading `ci.yml` and a local run of the script.
- The pre-commit hook runs `npm run validate-skill` directly, not under the verify lock (decision P1-5 names the lock). I did not rate this.
