# Lane C report ? TASK_2026_2259_f0db

Implemented findings 1 and 2 and the regression coverage requested in finding 3. Existing uncommitted work was retained. No commit, push, merge, stash, or rebase was performed.

## Files changed by this lane

- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\core\src\lib\services\providers-orchestration-schema.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\core\src\lib\services\providers-settings-state.service.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\core\src\lib\services\providers-settings.types.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\core\src\lib\services\providers-settings-state.orchestration.spec.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\chat\src\lib\settings\providers\connection-usage.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\chat\src\lib\settings\providers\connection-usage.spec.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\chat\src\lib\settings\ptah-ai\cli-matrix-rows.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\chat\src\lib\settings\ptah-ai\cli-matrix-rows.spec.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\chat\src\lib\settings\ptah-ai\move-preferred-agent-order.spec.ts`
- `D:\projects\ptah-extension\.claude-worktrees\fix-settings-lanes-data-99f8453cafe6\libs\frontend\chat\src\lib\settings\ptah-ai\cli-orchestration-matrix.writes.spec.ts`

## Decisions

Finding 1: retain the existing array data API with the typed intersection `ProvidersCliAgents = PtahCliSummary[] & { readonly missingFields?: readonly string[] }`. The list parser adds `missingFields: ['cliAgents']` only when it rejects a non-array source or any element. A fully valid refresh replaces the annotated array with a plain valid array. This avoids changing every list consumer or adding a second signal and component input. The matrix reads the optional metadata into its existing deduplicated missing set, using the existing single message path. This choice is reversible and confined to the frontend store boundary.

The loose Zod summary schema mirrors the shared PtahCliSummary and uses `satisfies z.ZodType<PtahCliSummary>`. The existing validElements helper retains only valid summaries, preserving unknown fields. Both direct list consumers now guard Array.isArray; connection usage marks a non-array source incomplete.

Finding 2: use a strict detection schema to identify partial input and a salvaging schema for row data. Essential cli/installed/messagingMode remain strict; every optional field catches malformed values to undefined. Both schemas satisfy z.ZodType<CliDetectionResult>. Config and redetection therefore retain readable rows while reporting detectedClis.

## Regression evidence

- Non-array agents and [null, validAgent] preserve readable system detection and retain valid instances; a subsequent valid list clears its missing metadata.
- Unknown summary fields are retained.
- Malformed manifest, version, path, and roleChannel preserve the readable Codex detection in config and redetection and report detectedClis.
- The matrix retains readable system and instance rows and renders exactly one partial-data message for a salvaged summary list.
- Duplicate saved IDs are covered moving both up and down; untouched positions and the input array remain unchanged.
- Invalid redetection followed by a fully valid orchestration refresh clears missingFields.
- The move-with-undo test invokes feedback.undo() and verifies the second write restores the exact original saved order, including an uninstalled ID and omitting an ID that the forward move appended.

## Checks

```powershell
npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/core/src/lib/services/providers-settings-state.orchestration.spec.ts libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts
```

PASS: 2 suites, 124 tests.

```powershell
npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/move-preferred-agent-order.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts libs/frontend/chat/src/lib/settings/providers/connection-usage.spec.ts
```

PASS: 4 suites, 83 tests.

```powershell
npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json
npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json
```

PASS: both commands exit 0, no TypeScript errors.

```powershell
npx eslint libs/frontend/core/src/lib/services/providers-orchestration-schema.ts libs/frontend/core/src/lib/services/providers-settings-state.service.ts libs/frontend/core/src/lib/services/providers-settings.types.ts libs/frontend/core/src/lib/services/providers-settings-state.orchestration.spec.ts libs/frontend/chat/src/lib/settings/providers/connection-usage.ts libs/frontend/chat/src/lib/settings/providers/connection-usage.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-matrix-rows.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/move-preferred-agent-order.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/cli-orchestration-matrix.writes.spec.ts
```

PASS: exit 0 across 10 files, 0 errors, 1 max-lines warning on the already oversized providers-settings-state.service.ts. No layout, template, CSS, token, lanes-table.component.ts, or libs/frontend/ui changes were made by this lane. cli-matrix-rows.ts remains under 700 lines; the matrix component was not edited by this lane. The schema remains under 150 lines.

Ptah scoped diagnostics: no diagnostics in the requested schema and matrix-row source files; the tool additionally reported 483 sibling-project errors, mostly outside this scope in existing specs. The requested library tsc checks above both pass. Ptah symbol search returned a transport error, so native rg was used for shared type discovery. Skill discovery/loading was unavailable to this lane; no skill workflow is claimed.

Visual limitation: component DOM rendering and message/row presence were verified through the Angular Jest specs. No browser screenshot was collected; no application build, serve, or e2e target was started. No claim of visual comparison against a design reference is made.
