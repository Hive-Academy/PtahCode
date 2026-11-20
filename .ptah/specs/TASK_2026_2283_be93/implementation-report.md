# Implementation report

Replaced automatic analysis imports with an index of files to read when needed.

## Changed files

- `libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.ts`: emits an instruction line and backtick-wrapped path bullets. Preserves markers, marker validation, dominant EOL handling, write-race detection, serialization, and best-effort error handling. No API or shared export changes.
- `libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts`: checks every phase path and absence of import lines; updates existing format assertions; adds LF and CRLF migration regressions checking exact outside-text preservation and idempotence.
- `CLAUDE.md`: replaces the old marked imports with the exact index below, with no blank line inside the opening marker.
- `.ptah/specs/TASK_2026_2283_be93/implementation-report.md`: this report.

Inspected `libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts` and `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`. Neither asserts the generated block content, so neither was changed. Changed source and spec remain below 700 lines.

## New block text

```markdown
<!-- ptah:analysis:begin -->
Workspace analysis (read a file only when the task needs it):
- `.ptah/analysis/ptah-extension/01-project-profile.md`
- `.ptah/analysis/ptah-extension/02-architecture-assessment.md`
- `.ptah/analysis/ptah-extension/03-quality-audit.md`
- `.ptah/analysis/ptah-extension/04-elevation-plan.md`
<!-- ptah:analysis:end -->
```

## Decisions

- Use filename-only path bullets rather than descriptions. `PHASE_CONFIGS` has `id`, `file`, and a progress `label`, but no name/title field. This follows the requested filename fallback without inventing descriptions or changing metadata. Reversible within the block formatter.

## Verification

- `npx jest --config libs/backend/agent-generation/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts libs/backend/agent-generation/src/lib/services/wizard/multi-phase-analysis.service.spec.ts`: passed, 2 suites and 50 tests; exit 0. Startup emitted an ES-module configuration warning.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`: passed; exit 0.
- `npx eslint libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.ts libs/backend/agent-generation/src/lib/services/analysis-claude-md-linker.spec.ts`: exit 0, no errors, five existing non-null assertion warnings in unchanged spec code. Nx module-boundary checking was skipped because no cached project graph was available.
- Scoped `ptah_get_diagnostics` was attempted after edits; its TypeScript check remained running after 45 seconds, leaving both files unchecked in that response. The direct scoped TypeScript command above subsequently passed.
- No Nx, verify, build, Electron packaging, commit, or push commands were run. The change stays in the host-neutral linker with no Electron/CLI contract changes.

## Tool availability

No host skill-loading tool/catalogue was exposed, so no skill was loaded. Followed repository instructions and the explicit task scope. The initial `ptah_search_files` returned zero hits and the first `ptah_ast_analyze` rejected its argument; native reads/search were used as fallback, and subsequent AST calls succeeded. `ptah_get_dependents` remained in graph-building status.
