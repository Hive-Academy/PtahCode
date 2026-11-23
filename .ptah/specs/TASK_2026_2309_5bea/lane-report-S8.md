# S8 Inspector integration and canvas focus host

## Files and bindings

- `session-inspector.component.ts`, `.html` and `.spec.ts` under `libs/frontend/chat/src/lib/components/organisms/session-inspector/` wire the finished sections and test the integrated destinations and value states.
- `canvas-inspector-dock.component.ts` and `.spec.ts` under `libs/frontend/canvas/src/lib/canvas-rail/` preserve the invoking rail control by its `data-rail-control` key across rail destruction and defer remount. Expand remains the fallback for a missing key or control.
- Header keeps title, status, workflow, branch, session actions, close, requests, announcements and the projected content slot. Answer emits the original request ID, selects the Orchestrator row and focuses its matching request control when rendered. Header `focusReleased` still focuses close.
- SESSION receives `stats`, `totals`, `cliContributions`, `turns`, `agentCount`, and `liveAgentCount`. Its active section and `compactSessionMetrics` read the same aggregate. The leaving SESSION receives a captured view model with its previous session ID, figures, contributions, turns and counts and stays inert and hidden from assistive technology.
- AGENTS receives `tabId`, `sessionId`, `agents`, `laneRuns`, `projection` (the object), `orchestrator`, `cache`, `contextUsed`, `compactionCount`, `sessionTokens`, `selectedAgentKey`, `hasLaneSurface` and `staggerStart`. Its lane, selection, answer and announcement outputs stay connected.
- PLAN LIMITS receives `limits` and `sessionId`. TASK and GIT keep their existing `tabId` and stagger bindings, and linked sessions keep `entries`, `currentSessionId` and `openSession`. Mount order follows header, SESSION, AGENTS, PLAN LIMITS, TASK, GIT and linked sessions.
- Rail buttons expose full accessible text. Tok, Cost and Time request the active SESSION heading, Context requests the Orchestrator row, Limits requests PLAN LIMITS, and the ready attention cue requests the first asking row with the AGENTS heading fallback. A sheet heading retains requested focus if the host first focuses close during deferred mounting.

## Acceptance and parity

| Surface or behavior | Spec cases |
| --- | --- |
| Header identity, session actions, close and section presence | “renders wrapped identity and preserves every expanded section”, “places session actions before the panel toggle in expanded and sheet headers”, and the existing header control cases |
| Header Answer, selection, request focus and close focus | “preserves the Answer emit and selects and focuses the asking row request” uses real AGENTS and request-lines components |
| TOK and Cost aggregation, two data arrival orders, per-metric loss | “shares measured whole-session totals across rail and SESSION when %s arrives first” and “marks a detected CLI cost gap while leaving reported tokens exact” |
| Accessible unknown Context, Tokens and Cost, muted unknown Time, no Todos | “renders unknown usage and context as labelled muted dashes and unknown Time as --:--” |
| 56 px rail, sheet, routing, context and limit cue, attention | “renders only expand when no session stats are available”, “emits expansion targets and exposes the ready attention count”, “shows the %s limit warning on expand and context with the full accessible description”, “uses the stats limit summary when the host supplies no separate summary”, and “routes the plan-limit cue to the PLAN LIMITS heading and keeps section order” |
| Usage split and preserved motions | “passes uncached input tokens to the Orchestrator and preserves missing data”, “focuses only the active SESSION heading during a switch and freezes totals in both directions”, and the existing same-session, null-interval and reduced-motion cases |
| SECTION component parity for Models and budget, AGENTS row details and cache, PLAN LIMITS provider rows | Existing section spec coverage stays with S4/S5/S7. S8 covers the host inputs through the shared totals, unknown Time, request, attention, and Plan Limits fixtures above. |
| TASK and GIT mount parity | “renders wrapped identity and preserves every expanded section” |
| Linked sessions and open behavior | “renders the chain after git in the %s body”, “opens another session through SessionRowActionsService and not the current one”, and the existing missing, malformed, and release cases |
| Cost invoker and default focus restore in the real canvas wrapper | “restores focus to Cost after dismissing the compact sheet opened from Cost” and “closing the compact sheet focuses the rail expand control once its deferred block mounts” |

## Checks

- PASS, 32 tests. `npx jest --config libs/frontend/chat/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.spec.ts`
- PASS, 20 tests. `npx jest --config libs/frontend/canvas/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.spec.ts`
- PASS, zero errors. `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json`
- PASS, zero errors. `npx ngc --noEmit --project libs/frontend/canvas/tsconfig.lib.json`
- PASS, zero errors. `npx eslint libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.ts libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.html libs/frontend/chat/src/lib/components/organisms/session-inspector/session-inspector.component.spec.ts libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.ts libs/frontend/canvas/src/lib/canvas-rail/canvas-inspector-dock.component.spec.ts`
- Angular emitted warnings in files outside the write set. ESLint reported one existing non-null assertion warning in `canvas-inspector-dock.component.spec.ts:126`.
- Ptah diagnostics timed out on the scoped TypeScript files on both attempts and lacked HTML coverage. The native Angular checks cover the templates.

## Decisions

- Used the host's active SDK snapshot as the SDK aggregate source instead of a second tab read. Reused S3 normalized CLI contributions and coverage and S1 aggregation, then shared one result between all mounted usage surfaces. When CLI arrives before the SDK snapshot, usage figures wait for that snapshot. This avoids treating an in-flight SDK read as a detected loss. Reversible in the parent projection.
- Adapted the S3 projection in the parent to attach the Orchestrator's requests to its row. The other option was modifying the S3 projection owned by a prior batch. The adapter is reversible and preserves the existing header and lane routing.
- Kept the rail Context dash when the primary context value is unavailable to preserve the requested accessible placeholder. Unknown Time follows rev 3 in the rail and expanded section.

## Contract gaps and outstanding work

- `inspector-agent-rows.ts:264` supplies an empty request list for Orchestrator. The inspector adapts the projection for row request controls.
- `inspector-request-panel.component.ts:322` and `:387` reserve the inline panel for permissions and route questions through their existing Answer output. The question fixture focuses the row's matching Answer button. A distinct inline question panel has no current section contract.
- The animated leaving node is SESSION. It captures roster counts and turns for that node, while AGENTS rows and Orchestrator figures are rendered once from the active projection.
- The canvas Cost test uses a minimal inspector fixture in the real deferred canvas wrapper. The real inspector fixture separately verifies active SESSION heading focus. Electron visual review and the broader parity suite, including `session-stats-summary.component.spec.ts`, belong to the coordinator under the lane command allowlist. The D3 TASK test is outside S8.

## Extra reads

- Used `ptah_workspace_analyze` and `ptah_ast_analyze` on the TypeScript write set. `ptah_search_files` returned zero task-file hits and the supplied task path was verified with `rg --files`. Exact report excerpts, template bindings and state selectors were read with native `sed` and `rg`.
- Read `.claude/skills/angular-frontend-patterns/SKILL.md`, `.claude/skills/ui-ux-designer/SKILL.md`, and relevant executor/orchestration excerpts from `.claude/skills/orchestration/SKILL.md` in the worktree. No dedicated skill loader was listed. The approved references and parent batch assignment supplied the design and orchestration inputs.
- Inspected rev 3 `lanes-400-dark.png` and `lanes-300-dark.png` for section order, condensed grid, and responsive header reference.
- Additional contract and fixture excerpts under `libs/frontend/chat/src/lib/`: `components/organisms/session-inspector/inspector-agent-rows.ts`, `inspector-agent-rows.spec.ts`, `inspector-agents-section.component.ts`, `inspector-agent-row.component.ts`, `inspector-request-panel.component.ts`, `services/session-inspector/index.ts` and `session-inspector.types.ts`.
- Additional contract and fixture excerpts under `libs/frontend/chat-ui/src/`: `index.ts`, `lib/molecules/session/session-stats-view.ts`, `session-usage-totals.ts`, `session-usage-format.ts`, `inspector-stats/inspector-session-stats.component.ts` and its spec, `inspector-stats/inspector-limits-lanes.component.ts`, and `plan-limits/stats-limit-view-model.types.ts`.
