# Batch B6 report

## Changes

- Updated both orchestration `SKILL.md` copies with one-batch executor prompt construction and per-call subagent tier/effort routing, including Claude Code precedence and observed-model recording.
- Updated both `lane-assignment.md` copies with optional Gate 0.1 `shape`/`weight`, one phase per known batch, roster fields, subagent override semantics, and unchanged CLI lane model resolution.
- Source/copy policy additions are identical. Unrelated existing edits to agent-lanes and team-leader-modes were left untouched.

## Verification

- `npm run validate-skill`: passed; 9 Markdown files checked, 0 errors, 0 warnings.
- `npm run verify -- -p @ptah-extension/agent-generation`: lint and typecheck passed (2 tasks); tests failed (1 suite, 2 tests). `user-layer-reap.spec.ts` failed on Windows symlink `EPERM` in:
  - `keeps a clone that contains a symlink, even though the hash skips links`
  - `reports a command clone with both removed paths, and keeps one whose sidecar is a symlink`
  Test summary: 46 suites passed; 1461 tests passed, 1 skipped, 2 failed.
- Mojibake scan for `â€`, `â‰`, `â†`: 0 matches in all four touched files.
- `wc -l` equivalent: both orchestration `SKILL.md` copies are 239 lines (under 300).
- `git diff --check`: passed. Ptah diagnostics reported Markdown unavailable (`analyzed: 0`).
- Extra read beyond the specified read set: the Nx test terminal output at `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\3613380322405742735`, only to identify the two failing test names.

## Decisions

- Used roster `tier` as the subagent per-call model alias; retained frontmatter model as the role default. Evidence: task contract and `research-online.md` lines 9-12. Reversible documentation wording.
- Kept CLI lane resolution separate from subagent routing. Evidence: task contract. Reversible documentation wording.

## Open issues

- Targeted verify remains red because Windows denied symlink creation in the two named tests. No documentation validation issue remains.
