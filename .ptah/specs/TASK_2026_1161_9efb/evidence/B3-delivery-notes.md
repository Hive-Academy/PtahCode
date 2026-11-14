# B3 lane and SDK delivery

`ptah_agent_spawn` accepts the B1 phase dispatch and host-resolved skills alongside the legacy `role` field. The namespace preserves role resolution, appends the phase discipline and skill content to lane tasks, and returns `skillDelivery: unavailable` when a skill was requested. This status is deliberate for system CLI and Ptah CLI lanes: B1 found no proven per-spawn skill loader for those paths. A path-only skill is read by the host and its contents are inserted into the prompt; unreadable paths refuse spawn.

The SDK options builder accepts the same dispatch and skills and appends their text to the session system prompt. It leaves legacy sessions untouched when neither field is supplied. SDK skill paths are read and their contents appended to the prompt; this change does not claim a verified SDK skill load. The separate B4 adapter work owns executable tool filtering.

Channel evidence is in [B1-discovery-notes.md](B1-discovery-notes.md): Claude SDK exposes `Options.skills`; Kimi has a skills directory flag; other installed CLI channels have no verified per-spawn skill loading. The returned unavailable status therefore does not imply the discipline was omitted: it is carried inline.

## Verification

Role census before and after: identical counts, 1700 lines in 292 files. `npm run verify -- -p @ptah-extension/vscode-lm-tools,@ptah-extension/agent-sdk`: all four lint/typecheck tasks passed; both full test targets failed because Jest mapped `marked` to a missing worktree-local `node_modules/marked/lib/marked.umd.js`. The package exists at the repository root. A local ignored junction enabled focused checks: SDK options builder 108/108, spawn schema 80/80, and agent namespace 112/112 tests passed. After the parser import and legacy prompt fix, `npx nx typecheck @ptah-extension/vscode-lm-tools --parallel=1` passed. The junction is a local test environment artifact and is not committed.
