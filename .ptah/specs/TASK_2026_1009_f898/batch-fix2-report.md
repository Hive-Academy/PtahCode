# Batch fix 2 report

| Finding | Change and proof |
| --- | --- |
| F1 | `references/team-leader-modes.md:17-29`: restored the six-step orchestrator acceptance procedure, status distinction, scoped checks, staging, commit, combined-diff review and fix round; phase `acceptanceStep` entries point through `SKILL.md:166`. Compared with `main:.claude/agents/team-leader.md:286-359`. |
| F2 | `phases/completion.md:15-20`: added batch/task status, SHA, file, risk, old-surface parity and passing-test checks, including preserve lists. Compared with `main:.claude/agents/team-leader.md:361-404`. |
| F3 | `references/agent-catalog.md:62,90,96`: restored skill-routing table, document-review contract and Parallel QA, including their existing heading anchors. Validator: 0 broken links. |
| F4 | `references/agent-catalog.md:128-129`: restored the actual `ui-ux-designer` and `technical-content-writer` skill ids and load instructions. |
| F5 | `SKILL.md:53-60,116`, `references/strategies.md:76-87`, `references/task-tracking.md:170`, `references/checkpoints.md:559`: implementation precedes review and tests, completion follows QA, and Gate 3 follows completion. |
| F6 | `references/checkpoints.md:334,548,559,567-600,689-698,741-744`: changed active gate and QA instructions to phase kinds and orchestrator acceptance; retained gate rules. Census skills bucket fell to 81. |
| F7 | `references/agent-catalog.md:45-57,116`: restored `Task({ subagent_type, description, prompt })`, self-contained prompt skeleton and column label. |
| F8 | `references/strategies.md:176-189`, `phases/implement.md:17`: `docs` writes content specification; `implement` edits requested documentation files and reports their paths. |
| F9 | `SKILL.md:53`: FEATURE has `document-review` after `plan`. |
| F10 | `SKILL.md:53-58`, `references/strategies.md:87,117,145,253`, `references/task-tracking.md:143-144,170-173`, `phases/research.md:19`, `phases/completion.md:22`: after-QA modernization runs as `research` and writes `future-enhancements.md`; completion writes `completion-report.md`. |
| F11 | `references/team-leader-modes.md:76-90`, `SKILL.md:165-166,218`: state transitions belong to orchestrator; removed stale next-action return requirement and clarified acceptance report input. |
| F12 | `phases/visual-review.md:15`: six fixed viewport screenshots, dark/light comparison and both before/after inputs restored. |
| F13 | `references/agent-catalog.md:90-94`: restored role-output eligibility, absolute review inputs and lane deliverable path. |
| F14 | `phases/implement.md:7`: scoped checks precede orchestrator acceptance; phase review follows lean rules. |
| F15 | `references/strategies.md:269`: DevOps implementation uses the `devops-engineer` default alias and routed `Required Skills:`. |
| F16 | `scripts/validate-orchestration-skill.ts:465-495`: masked fenced blocks, checked relative markdown files and heading anchors; validator passed with 0 errors. |
| F17 | `phases/design.md:18`: output contract names `prototype/README.md` and `prototype/screenshots/`. |

Role census: templates 68, skills 81 (baseline 119; did not rise), generated-agents 176, docs 116, test 938, source 201, other 120; total 1700 lines in 292 files. All non-skill buckets equal baseline. `SKILL.md`: 263 lines.

Commands: `npx ts-node --transpile-only tools/role-census/check-role-census.ts` exit 0; Git `diff.exe -r plugins/ptah-core/skills/orchestration .claude/skills/orchestration` exit 0 with no output; `node scripts/verify.mjs --exec --task validate-skill -- npm run validate-skill` exit 0, 21 files, 0 errors, 0 warnings. An earlier validator attempt failed on a strict TypeScript nullability error; fixed at `scripts/validate-orchestration-skill.ts:491` before the passing run.

## Decisions

- Used the requested implement → review → tests → completion order, with Gate 3 after completion and an additional after-QA `research` step only in flows that previously had a modernization scan.
- Kept every compatibility alias and optional built-in subagent path. No capability was intentionally removed.
- Skill discovery was available through Ptah's harness inventory, but this coding lane exposed no separate skill invocation mechanism. The task's own orchestration skill and the `main` source text were read directly.

## Proposed Removals

None.

## Clarifications Needed

None.
