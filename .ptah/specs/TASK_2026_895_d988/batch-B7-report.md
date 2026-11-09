# Batch B7 Report

## Changes

- Updated `plugins/ptah-core/skills/orchestration/references/team-leader-modes.md` and `.claude/skills/orchestration/references/team-leader-modes.md` with identical policy text (15 added lines per copy).
- Mode 1 now specifies self-contained batch entries: id/state, shape, measured estimate with 10% framing, actual lane tokens, bounded file sets and contract excerpts, dependencies, parallel safety, routing, exact scoped verification, and acceptance criteria.
- Executor prompts now use one batch entry plus the generic lane policy and role. Routing and CLI model-resolution behavior are explicit; Mode 2 records actual tokens beside estimates.

## Verification

- `npm run validate-skill`: passed; 9 Markdown files, 0 errors, 0 warnings.
- `npm run verify -- -p @ptah-extension/agent-generation`: failed (exit 1). Typecheck reports `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts` at lines 291 and 324 missing `tier` and `effort` fields. Tests: 46 suites passed, 1 failed; two `user-layer-reap.spec.ts` cases fail with Windows symlink `EPERM`.
- Ptah diagnostics for changed Markdown files: unavailable (no requested file could be checked).
- Both touched files match byte-for-byte as UTF-8 text. Mojibake grep (`â€|â‰|â†`): zero matches.

## Decisions

- Kept routing as a conditional policy when `ptah_route_decide` is listed, and left CLI tier advisory; the requested contract specifies both. Reversible documentation change.
- Reworded sequential and parallel executor bullets to source prompts from their batch entry, avoiding conflict with the new prompt rule. Reversible documentation change.

## Open issues

- Scoped verify remains red from TypeScript errors in lane-routing and Windows symlink permission failures outside this documentation write set.
