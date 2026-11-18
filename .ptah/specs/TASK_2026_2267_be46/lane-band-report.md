# Context management summary band

## Files changed by this lane

- `libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts`: mounts the shared instrument band above the first section; provides and starts the page store. Existing section markup, identifiers and deferred blocks are preserved.
- `libs/frontend/chat/src/lib/settings/ptah-ai/context-overview.store.ts`: page-scoped signals and parallel RPC reads, loading tracking through Angular PendingTasks, warning fallbacks, and refresh after settings saves/Undo through the existing feedback saving signal.
- `libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.spec.ts`: mocked real-source summaries, six exact labels/ids, token and USD units, enabled/off values, default guards, pending and failed reads, shared cache-state failures, and existing page behavior.
- `.ptah/specs/TASK_2026_2267_be46/lane-band-preview.html`: standalone visual review artifact.
- `.ptah/specs/TASK_2026_2267_be46/lane-band-784.png`: screenshot evidence (may be git-ignored).
- This report.

Pre-existing changes to decision-matrix-page.component.ts, session-budget-settings.component.ts and lane-guards-settings.component.ts were not edited by this lane. No protected UI, Providers, Advanced, Search/Voice or shared files were edited. No commit, push or PR.

## Segment data sources

| Segment id / label | Source and displayed state |
| --- | --- |
| prompt-cache / Prompt cache | Existing `ProvidersSettingsStateService.orchestration()` opened by the page, backed by `agent:getConfig`. Uses `subagentPromptCacheTtl` and `subagentPromptCacheTtlEnvOverride`, exactly as the cache section does. Valid environment override takes precedence. Invalid overrides warn. |
| session-budget / Session budget | `settings:get` for `sessionBudget.enabled`, `sessionBudget.unit`, `sessionBudget.tokens`, and `sessionBudget.usd`. Shows On/Off and the effective selected limit with tokens or USD. Defaults and bounds come from `SESSION_BUDGET_SETTINGS`. |
| lane-guards / Lane guards | `agent:getConfig`, `laneRepeatCallStopAt`, interpreted through the existing `laneGuardFromConfig` helper, including its default of 20. Shows Stop at N repeated calls. |
| routing / Routing | `settings:get`, `agentOrchestration.hostRouting`; same missing-value default of true as HostRoutingSettingComponent. Shows On/Off. No model availability claim is made. |
| close-rotation / Close rotation | `settings:get`, `agentOrchestration.laneRotation`; same missing-value default of true as LaneRotationSettingComponent. Shows On/Off. |
| limits / Limits | Cheap reuse of budget reads: `sessionBudget.handoffPercent` and `sessionBudget.tightenPercent`. Shows the effective handoff percent, labeled Budget handoff. Shared bounds/defaults and tighten < handoff fallback match the budget section. No extra limits RPC or invented usage/restart count. |

Budget RPC methods and settings keys match the budget child; the loader uses ClaudeRpcService rather than the child's VSCodeService rpcCall wrapper. It works before viewport-deferred children mount. No duplicate controls or Checked just now row were added. Unloaded cache data remains neutral Not set; reads in progress show band loading; failures show Unavailable with warn tone. The cache summary follows shared state updates, and other summaries reread after saves and Undo.

## Checks and results

- PASS: `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.spec.ts` — final run: 1 suite, 13 tests passed, 30.77 seconds. An earlier run failed assertions at then-lines 184, 203, 213 and 229 because async loading was not tracked by whenStable; adding PendingTasks resolved all four failures.
- INCOMPLETE (too slow): `npx tsc --noEmit --project libs/frontend/chat/tsconfig.lib.json` — no output after several minutes; stopped only this worktree's identified tsc process. No failing source lines were emitted; this is not a typecheck pass.
- PASS: `npx eslint libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.ts libs/frontend/chat/src/lib/settings/ptah-ai/orchestration-settings.component.spec.ts libs/frontend/chat/src/lib/settings/ptah-ai/context-overview.store.ts` — final run exited 0 with no errors or warnings. An initial run had one warning at then-line 194:83 (non-null assertion); changed to a Node cast.
- Visual review: inspected `rev2-context-dark-784.jpg`, the prototype HTML, and the read-only shared instrument-band implementation. Navigated the in-workspace preview file URL with ptah_browser_navigate and inspected ptah_browser_screenshot. At a verified 784px viewport the preview shows three equal columns (160.656/160.672/160.672px), six segments over two rows (tops 123/123/123 and 204/204/204), no horizontal overflow, the correct label order, and the band above the first section. These match the reference's composition; values intentionally reflect the mocked real-source replies instead of prototype demo usage. Preview CSS is a standalone approximation of the shared band structure; this is not a screenshot of the running Angular/Electron app. Full application visual verification remains outstanding because build/serve/e2e were excluded.

No nx, workspace verification, build, serve or e2e commands were invoked by this lane.

## Skills and tool availability

Read and applied local `.claude/skills/ui-ux-designer/SKILL.md`, its design-system discovery guidance, and `.claude/skills/angular-frontend-patterns/SKILL.md`. Native CLI skill invocation/discovery is unavailable in this session; direct filesystem reading was the fallback. Ptah workspace analysis, AST analysis and browser tools were used. Ptah dependents returned graph-building status, so rg established the direct Settings page/spec usages before editing. Native shell reads and edits were scoped to this worktree. Compiler diagnostics were not launched separately after the requested typecheck proved too slow.

## Open questions / remaining verification

- No product decision is needed: Limits uses the explicitly allowed budget handoff percentage.
- Coordinator should rerun the focused chat typecheck when resources permit.
- Coordinator should verify the actual Electron renderer visually when a running app is available; standalone preview evidence does not establish production CSS rendering.

