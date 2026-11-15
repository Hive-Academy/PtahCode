# Changed files

- `libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts`: resolve each phase from workspace-owned orchestration, then active user clone, then shipped plugin.
- `libs/backend/lane-routing/src/lib/phase-definition-file.reader.spec.ts`: add workspace precedence, per-file fallthrough, and predicate-error coverage; retain disabled-clone coverage.
- `apps/ptah-electron/src/di/phase-2-libraries.ts`: wire workspace root, ownership, and clone activation from harness source, selection, origin, and manifest services.
- `libs/backend/cli-engine/src/lib/container.ts`: wire the same policy for CLI/TUI.

# Decisions

- Precedence is workspace-owned file ? active user clone file ? `ptah-core` plugin file, evaluated separately for each phase. The reader implements this at `libs/backend/lane-routing/src/lib/phase-definition-file.reader.ts:20-32`.
- The harness drops disabled clones at `libs/backend/harness-sync/src/lib/manifest/harness-manifest.builder.ts:516`, then excludes unselected clones at line 528. Its plugin-origin gate is at `libs/backend/harness-sync/src/lib/manifest/plugin-origin-gate.ts:123-145`. Both host factories use the same harness source resolver and skill-selection gate.
- A workspace `.claude/skills/orchestration` entry counts as workspace-owned only when it is not recorded in the Claude managed manifest. Harness target scanning treats unowned entries as foreign at `libs/backend/harness-sync/src/lib/targets/claude-target.ts:674-687`; legacy links into source roots are migratable there, so host callbacks exclude those. A missing phase file falls through without suppressing predicate errors.
- The existing route-decision catch and legacy browser table remain untouched.

# Checks

- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/phase-definition-file.reader.spec.ts`: pass, 8 tests.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.spec.json`: pass.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`: pass after final host edits.
- `npx tsc --noEmit --project libs/backend/cli-engine/tsconfig.lib.json`: pass after final host edits.
- `npx eslint` on all four changed source/spec files: exit 0; two existing file-length warnings in host composition files.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; no baseline edits.

# Not done

- No nearby cheap host-level unit test covers these factory registrations; reader-level behavior is covered by the focused spec.
- No commit, push, build, serve, dev, e2e, package, Nx, or workspace-wide verification ran.
- Existing untracked `pr-1290-threads.md` and `HANDOFF.md` were left untouched; they were not created by this lane.

# Risks

- Harness source resolution deliberately reports policy unknown rather than disabled state on read failure. The host callback throws so routing uses its existing legacy fallback.
- Host factories use the active workspace provider; routing has no per-request workspace root parameter, so an Electron multi-folder request needs the active provider to reflect its intended folder.

# Round 2

## Changed files

- `libs/backend/harness-sync/src/lib/sources/orchestration-phase-sources.ts`: add one host-neutral factory for the orchestration clone and workspace ownership callbacks. It preserves the existing policy-unknown throw, disabled and selected skill checks, plugin origin and opt-out rules, overlay matching, manifest ownership check, and source-root symlink exclusion. Harness-sync already uses Node filesystem calls, so this helper uses `node:fs` for the same synchronous ownership checks.
- `libs/backend/harness-sync/src/index.ts`: export the factory and options type.
- `libs/backend/harness-sync/src/lib/sources/orchestration-phase-sources.spec.ts`: cover unknown policy, disabled and unselected skills, manifest-managed and plain workspace entries, and a symlink into user skills.
- `apps/ptah-electron/src/di/phase-2-libraries.ts` and `libs/backend/cli-engine/src/lib/container.ts`: replace duplicated callback bodies with the helper and fix reader constructor argument indentation.

## Checks

- New harness-sync Jest spec: pass, 6 tests.
- Lane-routing reader Jest spec: pass, 8 tests.
- `npx tsc --noEmit` for harness-sync library and spec, lane-routing library, cli-engine library, and Electron app: all pass.
- `npx eslint` on the five Round 2 changed source/spec files: exit 0. Only the two existing host file-length warnings remain.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; no baseline edit.
- `git diff --check`: exit 0.

Ptah tools and CLI skill discovery were unavailable in this lane; native workspace inspection and focused checks were used. No prohibited command, commit, or push ran.

# Round 3

## Changed files

- `apps/ptah-electron/src/di/phase-2-libraries.ts` and `libs/backend/cli-engine/src/lib/container.ts`: return an undefined workspace skills root when the workspace provider has no open root, while retaining the existing clone policy fallback.
- `libs/backend/harness-sync/src/lib/sources/orchestration-phase-sources.ts`: use `isMigratableLink` for symlinks into user skills or plugin source roots.
- `libs/backend/harness-sync/src/lib/sources/orchestration-phase-sources.spec.ts`: cover a symlink into the plugin source root, with Windows EPERM handling.
- `libs/backend/lane-routing/src/lib/phase-definition-file.reader.spec.ts`: cover unowned workspace fallback, ownership errors, and absent workspace root.

## Checks

- Harness-sync focused Jest spec: pass, 7 tests.
- Lane-routing focused Jest spec: pass, 11 tests.
- `npx tsc --noEmit --project` for harness-sync lib and spec, lane-routing lib and spec, cli-engine lib, and Electron app: all pass.
- `npx eslint` on the five Round 3 changed source/spec files: exit 0, with two existing host file-length warnings.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; no baseline edit.
- `git diff --check`: exit 0.
