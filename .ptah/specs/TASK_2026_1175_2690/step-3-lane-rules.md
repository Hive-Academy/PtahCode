# Step 3 lane rules (mandatory for every lane)

Worktree: D:\projects\ptah-extension\.claude-worktrees\phase4-step3-definition-roles
Task folder: .ptah/specs/TASK_2026_1175_2690 (in that worktree)
Plan: .ptah/specs/TASK_2026_1175_2690/step-3-plan.md (read "Scope", "Routing confirmation",
"Current references", "Batches", "Preserve list" first)

- Edit only the files in the write set of your batch. Other lanes edit other files in the same
  worktree at the same time. A change that you did not make belongs to another writer: report
  it, never revert it.
- Never commit or push. Never run `git checkout --`, `git restore`, `git reset`, `git stash` or
  `git clean`. Never stop processes by name.
- Do not run `npm run verify`, `nx`, build, serve, dev, e2e or package targets. Permitted checks:
  `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`,
  `npx tsc --noEmit --project <tsconfig>`, `npx eslint <changed files>`. Run one heavy check at a
  time. Write long output to `.ptah/tmp/<name>.log` and read only the tail.
- Do not run Prettier on a full file when you changed only some lines of it. Keep format churn
  out of the diff.
- Never run the role census with `--update`. Never edit a census or degradation baseline.
- Keep the skills `ui-ux-designer` and `technical-content-writer`, their paths and the
  `Required Skills:` names. Keep `team-leader` active (step 4). Keep the deliverable names
  `task-description.md`, `design-spec.md`, `content-specification.md`.
- Keep legacy reads, the alias table, custom same-name agents and historical fixtures.
- `plugins/ptah-core/skills/orchestration` and `.claude/skills/orchestration` must stay
  byte-identical. Apply each edit to both copies. The same rule applies to
  `plugins/ptah-core/commands/*.md` and `.claude/commands/*.md` where both copies exist.
- Electron is the priority host. Keep platform-cli and cli-engine working.
- New code must compile under `strict`. No `any`, no `@ts-ignore`, no `as unknown as X`.
  No `console.*` in libs. Do not swallow errors.
- Public repository: no personal data (names, emails, user paths outside the repository).
- Do not read or write any HANDOFF.md file.
- Write your result file early as a skeleton and fill it in. Result file content: files changed
  (with file:line), checks run with real results, extra files read, `## Decisions`,
  `## Not done`, `## Needs another batch` (edits that you need in a file outside your write set).
- Write documents in short Simplified Technical English sentences.
- Reply: `WROTE: <absolute path>` and one headline line. Nothing else.
