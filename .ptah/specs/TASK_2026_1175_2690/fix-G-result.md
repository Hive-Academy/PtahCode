# Fix G result

## Changed files

- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-skill-phase-writer.ts`: exports the phase-absence marker name.
- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-fs-ops.ts`: supports skipping one file at the copy source root.
- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-mirror.service.ts`: skips that marker during whole-skill revert.
- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-enhance.spec.ts`: adds the marker and sidecar hash regression case.

## Decisions

- Chose option (a): whole-skill revert omits `.ptah-absent-phase` from the snapshot root. The marker remains in history for per-file revert; nested files and other `copyTree` callers retain their behavior.
- Kept the history layout unchanged, so history listing and body reads continue to use the same snapshot paths.

## Checks

- Targeted Jest suite: 24 passed.
- `tsc --noEmit` for `tsconfig.lib.json` and `tsconfig.spec.json`: passed.
- ESLint on four changed files: passed with one existing `max-lines` warning in `user-layer-mirror.service.ts`.
- Degradation audit: exit 0, no baseline edit.
- `git diff --check`: passed.

## Risks

- No known functional risk. The repository's existing file-length warning remains.
- Ptah tools and matching skill discovery were unavailable in this lane; native repository tools were used.
