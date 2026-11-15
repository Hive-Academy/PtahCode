## Changes
- Added monotonic, capped chat admission stage timing with one redacted summary per chat:start and chat:resume. Failures retain their original error.
- Timed account, registration, preparation, SDK start, metadata, folder, JSONL, CLI restore, recovered output, and explicit activation stages.
- Started JSONL and CLI restore reads concurrently after account/folder checks; joined before registry restoration and reply. Cold resume remains lazy.
- Added timing and read-overlap regression tests.

## Checks
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json`: pass (0 errors).
- `npx eslint <changed files>`: pass (0 errors, 1 existing max-lines warning for chat-session.service.ts; Nx graph cache warning).
- Focused Jest, standard command: blocked before tests in two session suites because preset points `marked` to missing worktree `node_modules`; timing suite passes 1/1 separately.
- Focused Jest with CLI mapper to installed parent `marked`: 2 suites pass, 28 tests pass.
- All existing chat-session specs, standard command: 18 suites blocked before tests by same mapping.
- All existing chat-session specs with CLI mapper: 18 suites passed, 350 tests passed.

## Decisions
- Keep CLI read failure degraded to an empty card list, matching existing behavior; join it with the JSONL read before registry restoration. Reversible.
- Preserve nonactivating resume without SDK work and retain existing recovered-output fence. Reversible.
- Use an internal timing collector with a fixed stage union and 600,000 ms cap; no DI/RPC contract changes. Reversible.

## Open issues
- This worktree lacks `node_modules/marked`; standard Jest mapping in the preset resolves there. The package is installed in the parent checkout. The mapper workaround uses only command-line configuration and changes no source.

