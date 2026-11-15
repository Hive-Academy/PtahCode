# Batch 1 C result

## Files changed or deleted

- Removed the three roles from the setup catalog, recommendation catalog, and subagent tool policy. Updated their focused specs.
- Deleted `backend-developer.template.md`, `frontend-developer.template.md`, and `devops-engineer.template.md`. Shared partials remain.
- Updated the UI designer handoff, template storage examples, orchestrator example, and core prompt example to name active roles or the `implement` phase.
- Removed three entries from `agent-pack-manifest.json`. Regenerated `content-manifest.json` with `npm run manifest:generate`.
- Stopped retired built-in user-layer reseeding. Harness sync skips Ptah-origin retired clones, allows user-authored files with the same slug, and keeps existing retired agent copies. Added regression specs for all three slugs and Claude, Codex, and OpenCode paths.

## Checks and exit codes

- Agent-generation focused Jest (four specs): first run exit 1 due obsolete orchestrator expectation; corrected orchestrator spec rerun exit 0 (98 tests). The other three specs passed in the first run (67 tests).
- User-layer mirror Jest: exit 0 (38 tests).
- Harness-sync target Jest: exit 0 (5 tests).
- RPC-handlers setup Jest: exit 1 before tests. Jest could not resolve the local `marked.umd.js` mapper target.
- `tsc --noEmit` for agent-generation, harness-sync, rpc-handlers, and agent-sdk: each exit 0. Harness-sync was rerun after the final guard edit.
- ESLint on changed TypeScript files: exit 0 (0 errors, 111 warnings).
- `npm run manifest:check`: exit 0 (234 files).
- `git diff --check`: exit 0. Tracked `.claude/agents`, `.codex/agents`, and `.opencode/agent` files show no edits.

No DI service or RPC method was added or removed. DI guard specs did not need edits.

## Open issues

- The setup RPC Jest suite is blocked by the local Jest `marked` mapper resolution. The source type check passes; this suite still needs a runnable environment.
