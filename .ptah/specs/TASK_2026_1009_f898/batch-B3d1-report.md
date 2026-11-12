# Batch B3d1 report

## Changed files

Authored sources: `plugins/ptah-core/skills/orchestration/references/{agent-catalog,team-leader-modes,lane-assignment}.md`. Each was copied byte for byte to the corresponding `.claude/skills/orchestration/references/` file (six changed files total).

## Moved items

| Item | Destination |
| --- | --- |
| Fourteen role profiles, capability grades, invocation contexts, deliverables, instructions, timing, reads and parallel hints | One row per legacy role in `agent-catalog.md` → `## Compatibility appendix`; each row links its phase definition. |
| Default executor aliases and user-authored agent path | Catalog appendix for old aliases; active catalog retains explicit `phase.role` selection and the user-authored agent-file path/Task invocation shape. |
| Selection paths and specialist capabilities | Active catalog `## Phase kinds`, `## Selection` and `## Invocation`, linked to `phases/<kind>.md`. |
| Mode 1, Mode 2, Mode 3 | `team-leader-modes.md` compatibility table maps to `batch`, each phase's orchestrator acceptance step, and `completion`. Existing verification, risk review, retry, scoped checks, commit and gate discipline stays below it. |
| Per-role lane hand-offs and prohibitions | `lane-assignment.md` kind-based hand-off table and `## Never on a lane`; routing, live roster, independence and Gate 0.1 rules remain. |

## Census

Before: skills 461 role-bearing lines (batch task baseline). After: **313**, a reduction of 148 and below the 459 hard gate. Other buckets unchanged: templates 68, generated-agents 176, docs 116, test 938, source 201, other 120. The read-only census reported total 1932 lines in 296 files.

## Verification

| Command | Exit code | Evidence |
| --- | ---: | --- |
| GNU `diff.exe -r plugins/ptah-core/skills/orchestration .claude/skills/orchestration` | 0 | No diff output. PowerShell's `diff` alias is not recursive, so the Git distribution's GNU executable was used. |
| `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill` | 0 | 21 Markdown files checked, 0 errors, 0 warnings. Initial run failed on one migrated link; it was fixed before the passing rerun. |
| `npx ts-node --transpile-only tools/role-census/check-role-census.ts` | 0 | `skills: 313 ok (baseline 466)`; satisfies `<=459`. No `--update` was run. |

## Decisions

- Used one compatibility appendix at the end of the catalog, with exactly one row for each retired role. The validator requires each role to appear as a catalog row but does not prescribe an appendix heading; `## Compatibility appendix` is used.
- Mapped the old three mode numbers as specified by the plan. The acceptance step remains orchestrator-owned; it includes scoped checks, independent review, commit/status and gate evidence.
- Preserved backend, frontend and infrastructure work as `implement` variants; preserved modernization follow-up under `research` and content under `docs`.
- Replaced role names in lane instructions with phase kinds and kept the same delegation limits and examples.
- An unrelated concurrent writer changed `scripts/validate-orchestration-skill.ts` and added task files while this batch ran. Those changes were not edited or reverted here; validation used the current worktree state.

## Proposed Removals

None.

## Clarifications Needed

None.
