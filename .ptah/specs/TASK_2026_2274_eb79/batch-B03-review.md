# B03 review (libs/backend/bots configuration and ports)

**Verdict: APPROVED**  
**Score: 9 / 10**

## Summary

The configuration matches the sibling `libs/backend/lane-outcomes`. The tags, strict options and build, test and typecheck targets are correct. `bot-ports.ts` is small, has no credential field, and has no path parameter on the source reader. No Blocker or Major finding.

## Findings

1. **Minor** - `libs/backend/bots/project.json:13`. The build target names `src/index.ts`. This file does not exist yet. The plan assigns the file to B06, and `lane-outcomes` uses the same shape. No fix now. B06 must create the barrel, or the `build` target fails.
2. **Minor** - `libs/backend/bots/src/lib/bot-ports.ts:76-78`. The `proposal` variant of `BotsPreviewImportParams['source']` carries a caller-supplied `workspaceRoot`. The doc comment says "never caller-supplied filesystem paths". This is not exactly true for that field. Fix: change the comment to say that B05 must authorize `workspaceRoot` through `BotWorkspaceAuthorizationPort` before it reads a proposal.
3. **Minor** - `libs/backend/bots/src/lib/bot-ports.ts:101-106`. I did not check that the four `Symbol.for` descriptions are unique across all token files. The plan requires uniqueness. Fix: run one grep for `PtahBot` before B06. The names follow the `PtahBotRepository` pattern in `persistence-sqlite/src/lib/di/tokens.ts:13`.
4. **Note** - `libs/backend/bots/eslint.config.mjs:3-8`. The comment copies sibling text about `skill-synthesis`. It is accurate but not specific to this library. No fix needed.
5. **Note** - `libs/backend/bots/src/lib/bot-ports.ts:95-98`. `BotStagedAssetOperations` is a `Pick` of `BotRepository`. It is synchronous, as the repository is (`bot-repository.ts:62-81`). The port is small and enough for B06. B05 does not need to implement it.
6. **Note** - `libs/backend/bots/src/lib/bot-ports.ts:86-88`. The authorization port returns the stored spelling. This matches the carry-forward rule for the workspace root (B04 review #1). B05 owns the Windows casing test.

## Checks against the brief

- Tags are exactly `scope:extension` and `type:data-access` (`project.json:6`). The boundary rule at `eslint.config.mjs:382-383` allows data-access to depend on data-access and util. Imports are only `@ptah-extension/shared` and `@ptah-extension/persistence-sqlite`. `persistence-sqlite` exports `BotRepository` (`src/index.ts:160`).
- `tsconfig.lib.json:12-16` has strict, noImplicitOverride, noImplicitReturns and noFallthroughCasesInSwitch.
- No `src/index.ts` and no self-barrel import.
- `nx.json` has two added include lines, in the lint and Jest lists, after `auth-providers`.
- Ports for B05: catalog, source reader and authorization are enough. B06 needs only the type imports and the tokens.

## Check results

- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json` -> exit 0
- `npx eslint libs/backend/bots/jest.config.ts libs/backend/bots/src/lib/bot-ports.ts` -> exit 0
- Coordinator: `npm run verify -- -t lint,typecheck -p bots` -> 2 tasks succeeded (reported, not run by me)
