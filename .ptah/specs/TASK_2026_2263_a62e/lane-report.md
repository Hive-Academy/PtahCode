# Idle compaction default off

Changed only in worktree `D:\projects\ptah-extension\.claude-worktrees\idle-compaction-default-off`, branch `fix/idle-compaction-default-off`. Local idle compaction now defaults to false; explicit true remains supported. No persisted settings migration or runtime/session-budget changes.

## Changed files

- `libs/shared/src/lib/types/advanced-settings.types.ts`: changed the single production default for `compaction.idleCompactionEnabled` from true to false.
- `libs/backend/platform-core/src/file-settings-keys.spec.ts`: updated both literal default assertions to false.
- `libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.spec.ts`: updated unset/null/invalid-value fallback assertions and added explicit true/false setting coverage; retained live-toggle coverage.
- `apps/ptah-docs/src/content/docs/settings/context-management.md`: changed the Compact idle chats default from On to Off and clarified that the behavior requires enabling the setting.
- `.ptah/specs/TASK_2026_2263_a62e/lane-report.md`: this report.

## Default locations and consumers

- Production source of truth: `ADVANCED_SETTINGS`, idle-compaction entry, in `libs/shared/src/lib/types/advanced-settings.types.ts`.
- Derived backend default: `ADVANCED_SETTINGS_DEFAULTS` in `libs/backend/platform-core/src/file-settings-keys.ts` maps the shared table, then spreads into `FILE_BASED_SETTINGS_DEFAULTS`; no independent literal to change.
- Runtime fallback: `CompactionConfigProvider` captures the shared boolean default and uses it for unset, null, or invalid settings. Boolean settings override it, including explicit true. No `?? true` fallback exists for this key.
- Renderer: `libs/frontend/chat/src/lib/settings/advanced/advanced-settings-group.component.ts` consumes the shared table and falls back to `setting.default`; no mirrored idle-compaction literal.
- Documentation default: Context budgets table in `apps/ptah-docs/src/content/docs/settings/context-management.md` used On and now uses Off.
- Test copies: two assertions in platform-core and the provider's fallback/diagnostic assertions, updated above. Idle-service and fire-gate tests already use explicit enabled configurations and remain unchanged.
- Searched all `libs/` and `apps/` for `idleCompactionEnabled`, idle compaction, and the user-facing Compact idle chats wording. No additional schema, Electron, platform-cli, or cli-engine default was found.

## Checks

Commands ran sequentially from the worktree root:

1. PASS: `npx jest --config libs/backend/platform-core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/platform-core/src/file-settings-keys.spec.ts` — 1 suite, 153 tests.
2. PASS: `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-compaction.service.coalesce.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-fire-gate.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-request-tracker.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/idle-session.reducer.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction/idle/unref-scheduler.spec.ts` — 7 suites, 157 tests.
3. PASS: `npx jest --config libs/shared/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/shared/src/lib/types/advanced-settings.types.spec.ts` — 1 suite, 74 tests.
4. PASS (exit 0): `npx eslint libs/shared/src/lib/types/advanced-settings.types.ts libs/backend/platform-core/src/file-settings-keys.spec.ts libs/backend/agent-sdk/src/lib/helpers/compaction-config-provider.spec.ts` — zero errors, two existing unused-import warnings (`ENHANCE_TIMEOUT_MAX_MS`, `ENHANCE_TIMEOUT_MIN_MS`) in the platform-core spec. Module-boundary checking was skipped because no cached Nx ProjectGraph was available; no Nx command was run to generate one.
5. PASS: `git diff --check`.

Jest emitted existing module-format warnings; the platform-core suite also emitted missing temporary settings-file warnings. All listed Jest commands exited zero. No Nx, verify, build, serve, dev, e2e, or package target ran.

Ptah inspection: AST analysis succeeded for the shared settings definition. Dependency lookup remained in graph-building status, so native `rg` searches traced consumers. Scoped `ptah_get_diagnostics` returned unavailable after its compiler check exceeded 45 seconds; it did not certify any changed file. Focused Jest compilation and ESLint provide the verification evidence instead. The first AST call used an unsupported `filePath` argument and was corrected to `file`.

## Unchanged findings and limitations

- The adjacent docs minimum says 200,000 tokens while the shared default is 150,000. Left unchanged because the task explicitly excludes `compaction.idleCompactionMinTokens`.
- Shared help describes the feature without stating that it is on by default; no help-text or renderer/template edit was needed. Session-inspector docs conditionally describe a scheduled idle compaction and remain accurate.
- `compaction.enabled`, `compaction.threshold`, token minima, runtime autocompact, session handoff, and session-budget code are unchanged. Persisted values are untouched.
- No visual UI implementation or template changed; no app server, build, or rendered UI check was run.
- Codex-native skill discovery was unavailable. Read the local `.claude/skills/technical-content-writer/SKILL.md` and documentation guidance directly for the small documentation correction, grounded in the task carrier and inspected implementation.
- Existing untracked task folders were left intact. No commits, pushes, branches, or pull requests were created.
