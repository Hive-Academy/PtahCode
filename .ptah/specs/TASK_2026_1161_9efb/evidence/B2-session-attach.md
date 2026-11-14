# B2 session delivery and attach

- `ptah_session_start` accepts a resolved phase contract, optional resolved skills, and `attachToSessionId`. The spawner adds discipline and skill content to the child prompt.
- Attach requires a task ID, an existing registered child with the same task ID and branch, the deterministic worktree path, a matching canonical filesystem path, and a matching checked-out Git branch.
- An attached worktree is marked non-owned. A failed host start removes only the new child link, policy, and MCP root; it retains the shared branch and worktree. A newly provisioned worktree still rolls back on failure.
- Two sessions can share a branch and worktree while retaining separate child IDs and parent links. Cwd-only event lookup refuses ambiguous live sessions.
- Focused specs cover same-task attach, different task and branch refusal, two live session identities, and attached versus owned rollback.

## Verification

- `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/cli-agent-runtime`: lint and typecheck passed (4/4); both full test projects failed at the shared Jest `marked` module mapper, which points through this worktree's `node_modules` path.
- Running the changed specs with a command-line mapper to the canonical `marked.umd.js` path passed: runtime 3 suites / 160 tests; MCP session tools 1 suite / 105 tests. The override also preserved each project's `vscode` and wasm stub mappings.
- `git diff --check` passed.
- Role census exited 0 with source 201, test 938, docs 116, skills 81 against ceilings 201, 938, 116, 119; these match the B1 recorded baseline.
