# Batch B3a report (merge only)

## Merge table

| File | Hunk | Side kept | Evidence |
| --- | --- | --- | --- |
| `SKILL.md` | close-out paragraphs after "Status changes" | project | `git diff --no-index`: only in `.claude`; inserted into plugin |
| `SKILL.md` | Skill routing bullet | plugin | only in plugin |
| `references/agent-catalog.md` | prompt `Required Skills:` field, per-row Required Skills, `### Skill routing` table (21 ids) | plugin | only in plugin; project had no unique text |
| `references/git-standards.md` | PR status and cleanup safeguards paragraph | project | only in `.claude`; inserted before "Never commit to or merge" |
| `references/strategies.md` | skill-routing paragraph, two candidate-skill hints | plugin | only in plugin; project had no unique text |
| `references/task-tracking.md` | close-out passage before `context.md` template | project | only in `.claude`; inserted into plugin |

All hunks were non-overlapping, so both sides were kept in full. Plugin files were written first. The five `.claude` files were then copied byte-for-byte (LF, no CR).

## Verify

1. `diff -r plugins/ptah-core/skills/orchestration .claude/skills/orchestration`: no output, exit 0.
2. `validate-skill` (via `scripts/verify.mjs --exec`): 9 files, 0 errors, 0 warnings, VALIDATION PASSED, exit 0.
3. `check-role-census.ts` (no `--update`): exit 0. `skills: 461 ok (baseline 466)`.

`SKILL.md` has 249 lines (below 300).

## Census, `skills` bucket

- Before rephrase (after plain merge): 471 (FAIL, baseline 466).
- After rephrase: 461.

## Rephrased lines (same in both copies)

| File | Before | After |
| --- | --- | --- |
| `SKILL.md` | `the architect and the team-leader must put` | `the architect and the batch planner must put` |
| `references/agent-catalog.md` | `The architect and the team-leader must put` | `The architect and the batch planner must put` |
| `references/strategies.md` (skill routing) | `The architect and the team-leader must put` | `The architect and the batch planner must put` |
| `references/strategies.md:10` | `completion and git in flows without team-leader; Gate 3` | `completion and git in flows without a batch planner; Gate 3` |
| `references/strategies.md` (known cause) | `Skip directly to team-leader MODE 1` | `Skip directly to batch decomposition (MODE 1)` |

## Decisions

- The plan table matched the diff. No hunk was missed.
- The two skill-id table rows (`ui-ux-designer`, `technical-content-writer`) cannot lose the id. Two other role lines (strategies lines 10 and known-cause) were rephrased to offset them.

## Clarifications Needed

None.
