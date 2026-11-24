# Batch 8 report: retired sweep skips linked worktrees (#1469)

## Backend implementation — `TASK_2026_979_9e1f`, batch 8

**Tasks completed**: Task 8.1 (linked-worktree skip in the sweep) and its regression spec.

**Files**:

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-http\retired-ptah-mcp-slots.ts`
  - `sweepRetiredPtahMcpEntries` returns early when there are no retired paths (agy is not detected), so it does no disk I/O at all, as before.
  - It then works out the `.agents/mcp_config.json` path of every workspace root where `isLinkedWorktreeRoot` (from `@ptah-extension/harness-sync`, Decision D1) is true. For those paths the credential is still revoked (this is in memory and touches no file), but `removeRetiredPtahEntry` is skipped. No lock file is created and no write happens.
  - The home file and main-checkout workspace files are swept unchanged.
  - New private helper: `linkedWorktreeWorkspaceFiles`.
  - The doc comment is updated.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\mcp-connector-parity\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-http\retired-ptah-mcp-slots.spec.ts`, two new tests:
  - **Regression #1469:** `.git` is a FILE. The workspace file stays byte-identical (Buffer compare), and `.agents/` contains only `mcp_config.json`, so no lock file or backup was made. The home file is still swept, and both credentials are revoked.
  - **Main checkout:** `.git` is a directory. The workspace `ptah` entry is still removed, and user servers are kept.

**Stack observed**: tsyringe and harness-sync barrel imports, already present in the file. `isLinkedWorktreeRoot` is exported at `libs/backend/harness-sync/src/index.ts:105`. Its sync form was not needed.

**Verification** (focused commands, as the brief requires; `npm run verify` was not run, by instruction):

- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath` on these three suites passed 3 suites and 118 tests:
  - `retired-ptah-mcp-slots.spec.ts`
  - `http-mcp-server.service.spec.ts`
  - `http-mcp-server.service.concurrency.spec.ts`
- I re-ran `retired-ptah-mcp-slots.spec.ts` after prettier: 22 out of 22 passed.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json` exited 0.
- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.spec.json` exited 0.
- `npx eslint` on the 2 changed files exited 0.
- Prettier has been applied to both files.

**Plan deviations / decisions**:

- **Credential still revoked for skipped worktree files.** I picked "revoke, skip the file write" over "skip both":
  - Revoking is in memory only and leaves the file untouched, so the byte-identical acceptance still holds.
  - Keeping a retired long-lived credential live would be worse.
  - Easy to reverse.
- **Early return when the path list is empty.** My first version ran `lstat` on every root even when agy was not detected. That real fs/promises I/O changed microtask timing and failed 2 timing-sensitive tests in `http-mcp-server.service.spec.ts` ("re-pointing queue"). I confirmed this against the HEAD version: 79 out of 79 passed there. With the early return, all of them pass.
- **No real `git worktree` test.** The `git status --porcelain` part of the acceptance is covered by proxy: the regression test proves the file is byte-identical and that nothing new appears in `.agents/`. It does not create a real git worktree.

**Out-of-scope observations**: `batches.md` changed on disk during the run. That was not me; I did not touch it.
