# Review: batch R01c (bot create stall)

## Round 2

Score: 8.5 / 10
Verdict: APPROVED (two LOW items, no blocker)

I did not re-run Jest. I accepted the report: 86 tests pass, tsc, eslint and prettier pass.

### Round 1 defects

1. CLOSED. `bot-catalog-adapter.ts:37-38, 53-63`. One 8 s deadline (`BOT_CATALOG_DEADLINE_MS`) now covers all lookups. Provider, CLI, registry and skills tasks run in parallel (`:261-268`). Worst case is 8 s plus local work, well below the 30 s renderer timeout.
2. CLOSED. `bot-catalog-adapter.ts:130-138, 167-174`. A default runtime scans no provider and no CLI. A main runtime scans only its provider. A system lane scans only its own CLI. A Ptah lane projects only its registry entry. No-selection calls keep full discovery.
3. CLOSED (by the report, spec not re-run). The report lists fake-timer tests that hold at 7,999 ms and settle at 8,000 ms for default, main and lane selections.
4. CLOSED. `register-bots-composition.ts:38-39`. The Electron composition only binds the cached handler. See the trace below. `bots-rpc.handlers.ts:41-47` keeps the guard.
5. CLOSED (by the report). A spec pins an unknown main provider: `RUNTIME_UNRESOLVED` only, no model request, no CLI probe.

### Checks you requested

- Skill behavior change. Consistent with the plan ("missing installation/catalog yields visible diagnostics and allows edits"). `bot-application.service.ts:539-544, 554-570`:
  - When the catalog read throws, the service returns a `CATALOG_UNAVAILABLE` warning and saves.
  - When the catalog has `SKILLS_UNAVAILABLE` or `SKILLS_PARTIAL`, or its status is `unavailable`, the skills stay and the message says "could not be verified".
  - A healthy skill catalog (no such diagnostic) still throws for a missing new skill (`:554-566`, `INVALID_PARAMS`).
- Electron registration. Cannot leave `bots:*` unregistered. `wire-runtime.ts:341` calls `registerRpcSurface` with the Electron profile. `manifest.ts:127-130` has a `bots` entry with `requires: []`, so no capability can filter it out. The surface resolves `BotsRpcHandlers` from the factory that `register-bots-composition.ts:27-38` binds, then calls `register()`. CLI follows the same path (`cli-engine/register-bots-composition.ts:33`, `container.ts:1129`). The guard at `bots-rpc.handlers.ts:41` stays and is harmless. A container rebuild creates a new handler instance, so it registers again.
- Deadline timer and late results. The timer is cleared in `finally` (`bot-catalog-adapter.ts:~262-268`). `bounded` does not start an operation after expiry (`:58`). The race rejects before a late result can reach the code that writes `choices`, `lanes`, `skills` or `succeeded`. The race attaches handlers to the late promise, so there is no unhandled rejection. `Promise.all` waits for all tasks, so the snapshot is not changed after `read()` returns.

### Open defects

1. LOW. `bot-application.service.ts:556-566`. When the catalog status is `partial` for an unrelated reason (for example a main-provider model lookup timed out) and the skills lookup succeeded, a genuinely missing new skill throws `PERSISTENCE_UNAVAILABLE` ("could not be verified"). The skills were verified. The correct error is `INVALID_PARAMS`. Base the choice on `skillsUnknown`, not on `catalog.status === 'partial'`.
2. LOW. `bot-catalog-adapter.ts:53-63`. The timer starts before the `cliTypes` filter and task creation, and `clearTimeout` is in the later `finally`. A synchronous throw between them would leak the timer for 8 s. The code has no such throw today, so this is only a robustness note. Move the timer setup into the `try`.

### Notes

- The deadline stops waiting only. It cannot cancel the underlying SDK or file work, because the ports have no cancellation signal. The report states this.
- The coordinator must still rebuild and rerun the Electron capture to confirm that create saves in the real app.
