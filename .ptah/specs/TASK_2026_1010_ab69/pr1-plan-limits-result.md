# PR1-B plan limits result

## Files changed

- `libs/frontend/core/src/lib/services/plan-limits.store.ts`: uses `ClockService.now` and a coarse clock holder; releases it when the store is destroyed. The public clock cadence constant remains exported.
- `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tiles.ts`: passes an eligible future window reset epoch to the tile.
- `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/stats-limit-view-model.types.ts`: adds optional `resetsAt`.
- `libs/frontend/chat-ui/src/lib/molecules/session/plan-limits/plan-limit-tile.component.ts`: renders `ptah-countdown` in strip and inspector tiles.
- Specs: `plan-limits.store.spec.ts`, `plan-limit-tile.component.spec.ts`, `stats-limit-view-model.spec.ts`, `session-stats-summary.component.spec.ts` (fake clock provider for integrated tiles).

## Verification

- `npm run verify -- -p core,chat-ui`: lint/typecheck 4/4 tasks passed; test phase 1/2 project tasks passed. Core tests: 58 suites passed, 0 failed, 58 total; 1763 tests passed, 0 failed, 1763 total. Chat-ui tests: 97 suites passed, 16 failed, 113 total; 1485 tests passed, 8 failed, 1493 total. The eight assertion failures were in `session-stats-summary.component.spec.ts` because its TestBed omitted `PTAH_CLOCK`; that provider has since been added and the focused rerun passed. The other 15 failing suites could not resolve the configured `marked` UMD path. This was not checked against origin/main.
- Focused chat-ui test rerun (`plan-limits|session-stats-summary`): 10 suites passed, 0 failed, 10 total; 207 tests passed, 0 failed, 207 total.
- `npm run verify -- -t typecheck-templates -p ptah-extension-webview`: 1/1 task passed.

## Visible text changes

- A reported window reset now adds `Resets in` followed by a compact live duration in both layouts. Existing reset text remains.
- Checked against design-system epic sections 3A.1 and 3A.2: the reset countdown derives from `resetsAt`, uses the shared clock owner, keeps the timer silent for ticks, and leaves urgency styling to `ptah-countdown`. The existing absolute reset text and data-testids remain.

## Exceptions and open points

- No matching installed Angular/UI skill was found through Ptah skill discovery.
- Visual browser inspection is unavailable without serving the Angular app; serving is prohibited by lane rules. Template compilation and component DOM specs provide UI checks.
- Other pre-existing edits to `libs/frontend/chat/src/lib/components/molecules/agent-card/` were left untouched.

## Fixes (review follow-up)

- M1: the store keeps its coarse clock hold from the first load until store destruction, including after all registered surfaces close. A spec advances the clock after scope release for scope-less readers.
- M2: window tiles receive a countdown deadline only for a future reset in a state that shows a future reset. Passed, aged, and reset-usage-unknown tiles receive no deadline; specs check the passed-reset model and both layouts' absent countdown element.
- m1: countdown and absolute reset text use the same active exhaustion reset instant when one exists. When a countdown appears, the reset line omits its relative duration; without a countdown the prior relative wording remains.
- m2: the visible `Resets in` prefix is hidden from screen readers; `ptah-countdown` retains its label.
- m3: the store comment now states that its coarse hold sets a 30 s floor while other holders can drive 1 s updates. The clock owner's countdown API has no granularity argument; this is an accepted recomputation cost.
- m4: accepted the possible delay of up to one coarse tick between a pushed snapshot and the next `now()` update, and documented it at snapshot apply.
- Verification after fixes: `npm run verify -- -p core,chat-ui` passed 4/4 lint/typecheck tasks and 2/2 test tasks. Core: 58/58 suites and 1763/1763 tests passed. Chat-ui: 113/113 suites and 1920/1920 tests passed. `npm run verify -- -t typecheck-templates -p ptah-extension-webview` passed 1/1 task.
- Visible text change: eligible future-reset tiles now show their existing absolute reset time without the repeated `in …` portion, followed by one compact `Resets in` countdown. Passed resets and reset-usage-unknown tiles no longer show a countdown. Existing data-testids remain.
- UI inspection: checked the component template and DOM specs against the design-system epic's inline countdown and default styling requirements. No Electron screenshot was taken because the lane rules prohibit running the app.
