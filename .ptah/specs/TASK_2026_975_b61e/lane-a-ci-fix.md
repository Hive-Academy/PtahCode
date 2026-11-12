# Lane A CI clock fix

ClockService now counts second and coarse holders separately. It runs one interval at 1,000 ms whenever a second holder exists, otherwise at 30,000 ms for coarse holders, and stops while hidden or without holders. It switches intervals when the required cadence changes. Every acquire, tick, and return to visible refreshes `now`.

WallClockService forwards the cadence to ClockService and keeps its linkedSignal coarse filter. Core specs cover the cadence transitions, timer cleanup, and visibility pauses. The six named consumer specs were inspected and left unchanged.

## Verification

- `npm run verify -- -t test -p core,git-ui,chat,canvas,workspace-indexing,memory-curator-ui`: Nx ran six test targets. Three passed; core, chat, and canvas failed. The initial core run found a backward-clock spec that assumed a one-second tick for a coarse-only holder. I corrected that spec to check the next coarse tick. Chat and canvas had suites unable to start because this worktree lacks `node_modules/marked/lib/marked.umd.js`; this includes the canvas consumer spec. The consumer specs were not edited.
- `npm run verify -- -p core,machines-ui`: all four lint/typecheck targets passed. Core tests passed. Machines-ui had 387 tests pass across 19 suites; five suites could not start because the same `marked.umd.js` file is missing.
- Scoped Ptah diagnostics reported no errors in changed files. `git diff --check` passed.

The first six-project run cannot establish a full consumer pass in this worktree because the missing `marked` artifact prevents some suites from loading. The core regression was resolved in the second verification run.
