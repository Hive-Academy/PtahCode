# Code Logic Review: TASK_2026_2283_be93

**Verdict: APPROVED** (score 8/10), with two non-blocking docs findings.

Scope: `git diff main` (3 files): `analysis-claude-md-linker.ts`, its spec, root `CLAUDE.md`. I read the whole linker. I did not run diagnostics or any repo-wide check.

## Five logic questions

1. **No `@` line, and no import by Claude Code.** The generated lines are the heading `Workspace analysis (read a file only when the task needs it):` and `- \`.ptah/analysis/<slug>/<file>\`` bullets (`analysis-claude-md-linker.ts:96-99`).
   - No line can start with `@`. The heading starts with `W` and each bullet with `- `. The slug is limited to `^[a-z0-9][a-z0-9-]*$` (`:52`) and the file to `^[0-9]{2}-[a-z-]+\.md$` (`:61`).
   - The spec asserts `not.toMatch(/^@/m)` at `spec:50` and in the migration test.
   - Claude Code only expands `@path` tokens that are not inside code spans or code blocks. A backticked path in a bullet is a code span, so it is not imported. This comes from Claude Code's documented memory-import behaviour. I did not re-verify it against the Claude Code docs in this review.
2. **Migration, byte preservation, CRLF, idempotence.**
   - With exactly one marker pair, the code keeps `current.slice(0, indexOf(BEGIN)+len)` and `current.slice(indexOf(END))` unchanged and replaces only the middle (`:107-110`). This works for an old `@` block, including the old blank line after BEGIN.
   - The EOL is the dominant EOL of the file (`:93-95`). The new test covers `\n` and `\r\n`: it asserts the exact whole-file output, then a second `link()` returns `{written:false}` via `updated === current` (`:116`).
   - Malformed or unpaired markers are left untouched (`:102-105`, existing tests).
3. **Root `CLAUDE.md` equals the linker output for slug `ptah-extension`.** The block is the same heading plus four bullets for files 01 to 04. The old blank line after BEGIN is gone, which matches the linker output (`BEGIN eol heading`). The root file is LF (checked with `-match "\r\n"`, which returned False). The linker would therefore produce no diff on the next run. I did not run the linker against the repo.
4. **Other callers and specs.**
   - `link()` is called from `multi-phase-analysis.service.ts:426` and `setup-rpc.handlers.ts:625-627`. Neither depends on the line format; they only use `{written, error}`.
   - `multi-phase-analysis.service.spec.ts:252` constructs the linker but contains no `@.ptah/analysis` assertion. A search of `libs/` and `apps/` for `@.ptah/analysis` finds only the new migration test fixture (`spec:153`).
5. **User-facing text.** Stale; see findings.

## Findings

| # | Severity | File:line | Finding | Change |
|---|---|---|---|---|
| 1 | Minor | `apps/ptah-docs/src/content/docs/workspace/project-analysis.md:35` | Says PtahCode "adds an import block" and "Agents that read `CLAUDE.md` get the analysis". Now only an index of paths is added, and agents read a file on demand. | Reword to "adds an index of the latest analysis files; agents read a file when the task needs it". |
| 2 | Minor | `apps/ptah-docs/src/content/docs/workspace/workspace-config.md:14`; `workspace-intelligence.md:14` | Same stale wording: "analysis import block" and "imported through `CLAUDE.md`". | Change to "analysis index" and "listed in `CLAUDE.md`". |
| 3 | Nit | `libs/backend/agent-generation/src/lib/di/tokens.ts:126` | The doc comment still says "analysis import block". | Say "analysis index block". |
| 4 | Nit | `analysis-claude-md-linker.ts:97` and `spec:15` | The heading text is duplicated as a literal in the source and in the spec, so copy changes need two edits. The root `CLAUDE.md` is a third copy. | Export a constant if the text is expected to change. |

No functional defects found. The setup wizard copy was not found to say "imported" (grep of `libs/` and `apps/` found no such string for the analysis).

Residual risk: a user who already has the old `@` block in `CLAUDE.md` keeps it until the next successful `link()`, which needs a completed analysis. If linking never succeeds, the old block stays. That is acceptable, and the migration test covers the next-link case.

## Test results

`npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts`

Result: 1 suite passed, 14 of 14 tests passed. This includes the new migration test (LF and CRLF), the idempotence check and the no-`@` assertions.
