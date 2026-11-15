# Fix F result

## Changed files

- `libs/backend/harness-sync/src/lib/sources/orchestration-phase-sources.ts`: A manifest-managed orchestration skill is workspace-owned when its live directory hash differs from the recorded hash. Missing skills and managed symlinks remain unowned; link migration rules remain in place. A null hash throws.
- `libs/backend/harness-sync/src/lib/sources/orchestration-phase-sources.spec.ts`: Added unmodified and edited managed-copy cases; updated existing assertions for the asynchronous ownership check.

## Decisions

- Reused the harness rule: a live, non-null hash differing from `owned.hash` is local drift (`libs/backend/harness-sync/src/lib/targets/claude-target.ts:612-621`). The manifest `hash` is the content Ptah wrote (`libs/backend/harness-sync/src/lib/manifest-store/managed-manifest.ts:41`). The Claude target uses `hashDir` for skills (`libs/backend/harness-sync/src/lib/targets/claude-target.ts:210-211`), so the ownership check uses that same helper (`libs/backend/harness-sync/src/lib/hash/content-hash.ts:299`).
- The phase reader already awaits `isWorkspaceOwned` (`libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts:23`), so no reader change was needed.
- No matching CLI skill mechanism was exposed in this lane; local skill files were discoverable, but no matching implementation skill was applied.

## Checks

- Focused Jest: passed, 8 tests.
- `tsc --noEmit` for harness-sync lib and spec configs: passed.
- ESLint on both changed source files: passed.
- Degradation audit: exit 0; no baseline edit.
- `git diff --check`: passed.

## Risks

- Managed skills now incur one asynchronous directory hash on ownership checks. The shared hash helper's existing unreadable-file sentinel behavior remains the harness rule; a null hash fails routing explicitly.

- Ptah workspace analysis did not return during this run; native ripgrep and targeted file reads supplied the source inspection.

