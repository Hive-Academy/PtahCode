# Batch 4 A result

## Files changed

- `plugins/ptah-core/skills/orchestration/phases/batch.md:15` and mirrored `.claude` file: decomposition and batch acceptance rules.
- `plugins/ptah-core/skills/orchestration/phases/completion.md:15` and mirrored `.claude` file: final audit rules.
- `plugins/ptah-core/skills/orchestration/references/phase-mode-compatibility.md:1` and mirrored `.claude` file: renamed role reference.
- `plugins/ptah-core/skills/orchestration/references/agent-catalog.md:119` and mirrored `.claude` file: legacy alias only.
- `plugins/ptah-core/skills/orchestration/SKILL.md:166`, `references/fleet.md:36`, `references/git-standards.md:113`, `references/lane-assignment.md:75` and mirrored `.claude` files: updated links and ownership.
- `plugins/ptah-core/commands/orchestrate.md:37` and `.claude/commands/orchestrate.md:37`: active phase text and link.
- `scripts/validate-orchestration-skill.ts:116`: removed active role and template checks; required the renamed reference and batch guidance.

## Source-to-destination audit

| Source | Destination or decision |
| --- | --- |
| Template 1-48 metadata and static placeholders | Dropped: template injection and role metadata are not general workflow rules. |
| Template 49-79 role boundary, inputs, legacy `tasks.md`, skills | `phases/batch.md` Method and Output contract; `phases/completion.md` Method. Deliverable names retained. |
| Template 81-92 mode routing | `references/phase-mode-compatibility.md` mapping; phase frontmatter is authoritative. |
| Template 93-113 lean review and retry | `phases/batch.md` Refusals and compatibility reference Acceptance step. |
| Template 114-150 contract validation and blockers | `phases/batch.md` Method and Escalation protocol. |
| Template 151-192 batch size, ordering, executor, parallel safety, weights | `phases/batch.md` Method and Output contract. |
| Template 193-273 `batches.md` format and task fields | `phases/batch.md` Output contract and status vocabulary. |
| Template 274-348 report verification, checks, commit, review verdict | `phases/batch.md` Refusals and compatibility reference Acceptance step. |
| Template 349-392 final parity, visuals, write paths | `phases/completion.md` Method, Output contract and Refusals. |
| Template 393-461 return headers and handoff | Phase Return value sections and compatibility reference state transitions. |
| Template 462-493 executor prompt | `phases/batch.md` Refusals and compatibility reference Spawning a batch executor. |
| Template 494-535 status and refusals | `phases/batch.md` Output contract and Refusals; `phases/completion.md` Refusals. |
| Former modes reference 1-122 | Renamed to `phase-mode-compatibility.md`; durable batch rules copied to `phases/batch.md`, final checks to `phases/completion.md`. |

## Checks

| Command | Exit | Result |
| --- | ---: | --- |
| `npm run validate-skill` | 0 | 21 Markdown files; zero errors or warnings. |
| `npx eslint scripts/validate-orchestration-skill.ts` | 0 | Zero errors; two warnings and a missing cached project graph warning. |
| `bash -lc "diff -r plugins/ptah-core/skills/orchestration .claude/skills/orchestration"` | 0 | Empty. |
| `bash -lc "cmp plugins/ptah-core/commands/orchestrate.md .claude/commands/orchestrate.md"` | 0 | Equal. |
| `npx ts-node --transpile-only tools/role-census/check-role-census.ts` | 0 | All buckets within baseline; zero unreadable paths after staging the two renamed-reference deletions. |

## Decisions

- Keep `team-leader` only as a retired alias. Active flow names `batch` and `completion`.
- Keep Mode 1/2/3 as legacy compatibility terminology in the renamed reference.
- Do not edit census baselines. Staged only the two deleted reference paths so the census index scan sees the rename correctly.

## Not done

- No commit or push.

## Needs another batch

- Batch C owns deletion of the read-only template and related source changes.

## Extra files read

- `.ptah/specs/TASK_2026_1175_2690/step-4-plan.md`, `step-3-lane-rules.md`, and `libs/backend/agent-generation/templates/agents/team-leader.template.md`.
