# Lane B: reusable populated lanes shots

## Files created

- `apps/ptah-electron-e2e/src/design-preview/settings-lanes.shot.ts`
- `apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts`
- This report. No commits, pushes, stashes, merges, or frontend changes made.

## Fixture and RPC coverage

- `agent:getConfig`: shared `AgentOrchestrationConfig`; installed Codex, Claude,
  Copilot with versions; unavailable Cursor; detected Ptah CLI instance.
  Saved order includes Cursor between installed lanes; Copilot is disabled.
- `agent:detectClis`: same detection data for any refresh.
- `ptahCli:list`: typed `PtahCliSummary` for matching `preview-openrouter`.
- `settings:get`: serialized resolver supplies typed saved `PtahCliConfig[]`
  with direct/tier models, plus enhancement provider/model/timeout settings.
- `agent:listCliModels`: valid model lists for every system CLI key.
- `ptahCli:testConnection`: deterministic success and latency, if requested.
- `auth:getAuthStatus`, `auth:getApiKeyStatus`, `auth:getEffectiveRoute`,
  `auth:getScope`: credential presence, scopes, ready main route, and four
  connected providers (Claude, OpenRouter, Codex, Copilot).
- `provider:listCustomEntries`, `llm:getProviderBaseUrl`: empty custom/local setup.
- `provider:listModels`: two OpenRouter models; `provider:getPlanLimits`:
  valid empty snapshot without fabricated usage figures.
- `config:getScopes`: typed serialized resolver answers each requested key.
- `config:model-get`, `config:effort-get`, `memory:getTriggers`: valid defaults
  for the other reads made by `ProvidersSettingsStateService.refresh()`.
- Capabilities are detection manifests, not a separate matrix RPC.
  Codex includes a typed manifest for its expanded capability details.
- Existing `ui` fixture supplies startup/workspace/config/editor defaults.

## Navigation and captures

- `ui.mockRpc` before `ui.prepare`, then `ui.goto('settings')` and the exact
  `Providers` tab; matrix `cli-matrix`, table role/name `Lanes`.
- Data rows: `tbody > tr[data-testid]`; assert at least four and explicitly
  verify all five identities (`cli-provider-card-*`, `cli-matrix-row-*`).
- Expand installed Codex via `Details for Codex`; wide layout uses
  `More actions for Codex` then the `Details for Codex` menuitem.
  Assert `aria-expanded` and visible `#lane-detail-codex`.
- Dark theme uses the existing theme picker. CDP sets 1440/1920 x 1100.
  Each width starts collapsed; scroll table into view before every capture.
- Four JPEGs, quality 85: `lanes-{1440,1920}-dark[-expanded].jpg`.
  `metrics.json` records image, expansion, data row count, page/table widths.
- Output is repository-root-relative `PTAH_SHOT_DIR`, default
  `.ptah/specs/TASK_2026_2259_f0db/screens`; exact run command is in the header.

## Validation

- `npx tsc --noEmit --project apps/ptah-electron-e2e/tsconfig.settings-lanes-check.json`
  passed (exit 0). Temporary config extended `tsconfig.spec.json`, including
  only both new files and their imports; removed after checking. Neither
  existing e2e tsconfig includes design-preview. Initial check found two missing
  RPC fields (`defaultBaseUrl`, memory `enabled`); corrected and rerun passed.
- `npx eslint apps/ptah-electron-e2e/src/design-preview/settings-lanes.shot.ts apps/ptah-electron-e2e/src/design-preview/settings-lanes.fixtures.ts`
  passed (exit 0). Nx module-boundary rule warned it was skipped because no
  cached ProjectGraph exists. Dependency tags were inspected manually.
- Final scoped `ptah_get_diagnostics`: zero errors/warnings, clean coverage.
- No Electron, Playwright, build, Nx, e2e, or verify execution performed.
  One shot test authored; zero executed. Runtime navigation, screenshot framing,
  theme persistence, reload behavior, and generated metrics remain unverified
  until the coordinator runs the supplied capture command.

## Decisions

- Use local typed fixtures: harness has `scope:webview`, but `scope:e2e` allows
  only shared/e2e dependencies. Importing its fixtures violates that boundary.
  Reversible if the harness becomes an allowed dependency.
- Skill discovery/loading was unavailable; followed repository shot conventions.
  `ptah_ast_analyze` transport failed; native source reads supplied the fallback.
