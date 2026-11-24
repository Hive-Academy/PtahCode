# Context — CLAUDE.md dedup on Windows and macOS

## Background
TASK_2026_2323_9838 (PR #1497) added a CLAUDE.md dedup:
`libs/backend/agent-sdk/src/lib/helpers/claude-md-dedup.ts`. When the same CLAUDE.md
content loads more than once (for example from a nested `git init`), the walk adds
`claudeMdExcludes` patterns so the child CLI loads one copy only. One extra copy cost
about +4.6k tokens per turn in the benchmark.

The walk excludes nothing when a managed (policy) settings source may apply, because a
policy `claudeMdExcludes` could drop the copy that the walk keeps. See
`machinePolicyPaths()` and `machinePolicyMayApply()`:

- Linux: the walk checks files (`/etc/claude-code/managed-settings.json`,
  `managed-settings.d`, the WSL `reg.exe`, `~/.claude/remote-settings.json`). If none
  exists, dedup runs.
- macOS and Windows: `machinePolicyPaths()` returns `undefined`, so dedup is always off.
  Reason: on macOS the policy can come from an MDM profile, and on Windows from a
  registry key. A file check cannot prove these are absent.

## Goal
Turn dedup on for Windows (first) and macOS when the code can prove that no policy
source applies. Keep it off when a source exists or cannot be checked.

## Work to do (start on a Windows machine)
1. Find every policy source that the Claude CLI reads on Windows. Confirm from the CLI
   docs or its behavior, not from memory. Expected candidates:
   - `C:\Program Files\ClaudeCode\managed-settings.json` and `managed-settings.d\`
     (confirm the exact path)
   - a registry key under `HKLM\SOFTWARE\Policies\...` and possibly `HKCU` (confirm names)
   - `%USERPROFILE%\.claude\remote-settings.json`
2. Design a check for the registry source. Options: run `reg.exe query <key>` with a
   short timeout (exit code 1 = key absent), or a native module. Any error other than
   "key absent" must keep dedup off. The check must stay inside
   `CLAUDE_MD_DEDUP_DEADLINE_MS` (1.5 s).
3. Do the same research for macOS (`/Library/Managed Preferences/...` plist, the
   `com.anthropic.claudecode` domain, `/Library/Application Support/ClaudeCode/`).
   macOS can be a second phase if no Mac is available.
4. Extend `machinePolicyPaths()` / `machinePolicyMayApply()` with a per-platform probe.
   Keep the `machinePolicyPaths` test hook working.
5. Add unit tests for: no source (dedup on), file present, registry key present,
   probe error, probe timeout (all dedup off). Windows path spelling uses
   `toClaudeMdExcludePattern(p, 'win32')`.
6. Manual test on Windows in the Electron app: open a workspace with a nested repo
   that has a second CLAUDE.md copy. Confirm in the session prompt that the copy loads
   one time. Then add a test policy key and confirm dedup turns off.

## Verification
- Inner loop: `npm run verify -- --related -p agent-sdk`, then
  `npm run verify -- -t lint,typecheck -p agent-sdk`.
- Full gate before push: `npm run verify -- -p agent-sdk` plus the Electron projects
  that depend on agent-sdk.

## Key files
- `libs/backend/agent-sdk/src/lib/helpers/claude-md-dedup.ts`
- `.ptah/specs/TASK_2026_2323_9838/prompt-context-report.md`

## Branch
`feat/claude-md-dedup-windows` (made from main `b9805106c`). On the Windows machine run
`git fetch origin` and check out this branch in a new worktree.
