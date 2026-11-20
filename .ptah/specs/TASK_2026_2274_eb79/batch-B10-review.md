# B10 review: Electron composition

Verdict: APPROVED
Score: 8/10

## Summary

The wiring matches the plan. Phase 2 reuses the existing persistence helper, so BOT_REPOSITORY shares one connection and uses the default clock. Phase 4 calls `registerBotsComposition` right after `registerHarnessServices`. The helper registers adapters, then services, then a cached handler factory. The handler gets a typed lazy callback and the host logger as the fourth argument. The callback resolves `BOTS_TOKENS.APPLICATION` only at request time. All eleven methods register. No execution registration exists. `expected-resolvable.ts` lists the handler and all five bot tokens.

## Defects

1. Low - `apps/ptah-electron/src/di/register-bots-composition.ts:21-24`. The guard `isRegistered(RPC_HANDLER) && isRegistered(WORKSPACE_PROVIDER)` skips method registration silently. This exists for stripped smoke containers. In production a missing port would leave all eleven bot methods unserved with no log. Phases 0-1 bind both ports, so this cannot happen today. Suggestion: log a warning in the else branch.
2. Low - `apps/ptah-electron/src/di/phase-2-libraries.ts:523`. B10 adds only a comment here. The "phase 2 calls the helper" criterion is met by existing code. A source-text assertion in the spec guards the ordering. That test is fragile to refactors but acceptable.
3. Info - `apps/ptah-electron/src/di/register-bots-composition.ts:2` mixes a long import line and a long `useFactory` expression. Prettier or lint did not flag it. Style only.

## Carry-forward

- Default `Date.now` clock: the spec asserts `SqliteBotRepository.configure` is never called. Met.
- Resolve proof: the spec resolves SDK_PROVIDER_MODELS, SOURCE_RESOLVER, WORKSPACE_PROVIDER, CONFIG_MANAGER, AUTH_SECRETS_SERVICE and every BOTS_TOKENS entry. Met.
- Host logger is the fourth argument. Met (`register-bots-composition.ts:16`).

## Smoke spec exit 1

I did not re-run `container.smoke.spec.ts` because it is heavy. The cause given is credible: `SqliteSessionUsageSink` leads to `SessionStatsRepository`, `SessionStoreDatabase` and an async `require('better-sqlite3')` after teardown. That path does not involve bots. B10 does not make it worse:

- The new bot code opens no database and loads no native module.
- The handler and the application resolve lazily.
- The smoke test that runs `registerPhase4Handlers` reaches the bot helper. That helper registers method handlers only when `RPC_HANDLER` exists.
- The new spec exits 0 alone.
  Recommendation: track the smoke teardown issue as a separate task.

## Other bundle configs

Only `apps/ptah-electron/tsconfig.build.json` maps `@ptah-extension/rpc-handlers` and `persistence-sqlite`. It is the only file that needs `@ptah-extension/bots`. The coordinator added it. Every other `tsconfig.*.json` (worker, preload, app, spec) has no `rpc-handlers` path. They resolve through `tsconfig.base.json`, which already has the `bots` path (line 36). No other change is needed. The worker bundles do not import `rpc-handlers`.

## Checks run

- `npx jest --config apps/ptah-electron/jest.config.ts --runInBand --coverage=false --runTestsByPath apps/ptah-electron/src/di/bots-composition.spec.ts`: 8 of 8 passed, exit 0.
- `npx tsc --noEmit --project apps/ptah-electron/tsconfig.app.json`: no errors.
- `npx eslint` on the four changed files plus the helper: no output (clean).
- Manual reading of the diff, the helper, the handler constructor and the tsconfig files.

## Coordinator actions

- Low 1 fixed: `register-bots-composition.ts:46-50` logs a warning when it skips the method
  registration.
- Low 2 kept: the phase 2 comment documents that the existing persistence helper binds
  `BOT_REPOSITORY`. No other phase 2 change is needed.
- Build fix: `apps/ptah-electron/tsconfig.build.json` gets the `@ptah-extension/bots` path.
  `npm run verify -- --related -p ptah-electron` passed (11 tasks), and
  `nx run ptah-electron:validate-deps` passed (3 tasks).
- `phase-2-libraries.ts` keeps its committed CRLF form. It already failed the Prettier check
  before B10, so only the one comment line changes.
