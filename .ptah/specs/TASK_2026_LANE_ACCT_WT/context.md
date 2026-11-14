# Use stored lane account for spawns from worktrees (BUGFIX)

## Symptom
The user selected the named Claude account "Second Lane - A.K.N" as the lane account
for workspace `D:\projects\ptah-extension` (row in `provider_account_selections`, scope `lane`).
Claude CLI lanes spawned with no `accountSelection` still run on the main (ambient) login.
`provider_account_run_leases` and `provider_account_run_bindings` stay empty in `ptah.sqlite`.

## Root cause
`AgentProcessManager.laneAccountAdmission`
(`libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts` ~676)
reads the stored selection with `this.spawnEnvironment.workspaceRoot()`. That value comes from
the caller session's workspace (`McpCallerWorkspaceResolver` → `getSessionWorkspace`). Sessions
run inside git worktrees (`<repo>/.claude-worktrees/<name>`), so the key is the worktree path.
`ProviderAccountStore.readSelection` (`libs/backend/auth-providers/src/lib/accounts/provider-account.store.ts` ~654)
does an exact `workspace_root = ?` string match, so the stored row for the main checkout is
never found and the spawn falls through to ambient. Separator or drive-letter case spellings
also miss.

## Fix direction
When the exact key has no stored lane selection (profileId null AND revision -1, i.e. no row),
retry with the main checkout root of the git worktree that contains the workspace root.
Reuse the no-git-process main-root logic in
`libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/codex/codex-user-mcp-servers.ts`
(~283, `.git` file → gitdir → `commondir`) by extracting it to a small shared helper in the same lib.
An explicit row on the worktree key (even profileId null) wins over the main checkout row.
