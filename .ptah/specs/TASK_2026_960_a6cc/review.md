# Independent review

**Verdict: changes needed.**

## Finding

- **Medium — RPC cancellation can wait past its 30-second budget** (`libs/backend/usage-analytics/src/lib/usage-summary.service.ts:136-171`). The parent abort only aborts each source's controller. For a noncooperative read already awaited at line 171, neither the read nor `Promise.race` settles on that abort; the race waits until the source's independently scheduled 10-second deadline plus 1-second grace. If the RPC budget expires shortly after a source starts, `summarize` can return roughly 11 seconds after the RPC abort. The 30-second caller timer in `analytics-rpc.handlers.ts:98-99` therefore does not bound the handler. Settle the pending race on parent abort (or race the await against an abort promise), and add a fake-timer test that aborts an unresolved source before its source deadline.

## Other checks

- Early-started source reads have rejection handlers through `Promise.race(...).then(success, failure)`, so an ignored later source does not produce an unhandled rejection. Timers and parent abort listeners are removed when each race settles; on an early return, outstanding races remain until their source deadlines, but are bounded by the 11-second timer where the event loop is running.
- Results are consumed in the original source order. The existing `seen` set, aggregation map, and overflow path preserve deduplication and fact ordering. A stalled source receives a partial `time-budget` status and subsequent completed sources are still consumed. The new stalled-source test uses Jest fake timers.
- OpenCode checks abort after both awaited file stats, before opening its database. Synchronous SQLite calls still cannot be interrupted mid-call.

## Verification

Ran once: `npm run verify -- -p @ptah-extension/usage-analytics,@ptah-extension/persistence-sqlite` — **pass**, exit code 0. Lint/typecheck: 4/4 succeeded, all cache hits. Tests: 2/2 succeeded, both cache hits. This run did not re-execute cached tests.
