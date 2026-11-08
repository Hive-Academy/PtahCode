# Session validation path fix

## Root cause

`session:validate` encoded only separators and `:` when locating Claude's project directory. Claude encodes every non-ASCII-alphanumeric character. A dotted worktree therefore missed its exact directory, and the first basename guess could point at a decoy with no matching JSONL.

## Fix

- `libs/shared/src/lib/utils/claude-project-dir.ts:2`: one Claude-compatible project key helper. The installed SDK's `core-aydj4gn2.mjs` uses `/[^a-zA-Z0-9]/g`, truncates escaped keys over 200 characters, and appends the absolute value of a signed 32-bit Java-style hash of the original path in base 36.
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:1991`: probe the exact directory, then legacy and basename candidates for the specific JSONL before returning absent. The metadata reread and file lock in `session:validate` remain around staged recovery.
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:2050`: use the shared key for directory resolution; retain case/underscore and older punctuation-preserving fallback.

## Other call sites

Updated the session importer (`libs/backend/agent-sdk/src/lib/session-importer.service.ts:1052`), transcript reader (`libs/backend/agent-sdk/src/lib/helpers/history/jsonl-reader.service.ts:478`), hook subagent transcript probe (`libs/backend/rpc-handlers/src/lib/chat/ptah-cli/chat-ptah-cli.service.ts:410`), and gateway resumability check (`libs/backend/messaging-gateway/src/lib/session-resumability.ts:45`). No other production `replace(/[:\\/]/g, '-')` project-dir encoders remain; the one in session resolution is intentional compatibility fallback.

## Tests

`libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.spec.ts:2377`: dotted Windows path with earlier decoy, positive and missing IDs; a separate second-candidate test; existing metadata working-directory test now uses a dotted child path. `libs/shared/src/lib/utils/claude-project-dir.spec.ts:1`: POSIX, Windows, dots, spaces, underscores, long path.

## Verification

`npm run verify -- -t lint,typecheck,test -p rpc-handlers,agent-sdk,messaging-gateway,shared`: lint and typecheck passed (8/8 tasks); shared and messaging-gateway tests passed. The initial test phase failed in `session-rpc.handlers.spec.ts` (8 tests) because the first implementation read the projects directory twice. This was fixed, and `npm run verify -- -t test -p rpc-handlers -- --testPathPatterns=session-rpc.handlers.spec.ts` passed. `agent-sdk` failed only in the known Windows symlink suites `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts` (2 tests). `npm run verify -- -t typecheck -p ptah-electron` passed. The final `npm run verify -- -t lint,typecheck,test -p rpc-handlers` passed all 3 tasks. Scoped `ptah_get_diagnostics` was attempted after edits but timed out; the successful project typechecks provide the compiler result.

## Live check needed

Open an existing Claude session from a dotted worktree in Electron and verify `session:validate` returns `exists:true`, the tab stays attached, and a follow-up continues the same parent context. The research notes that earlier parent wording/replay behavior may need a separate trace if still observed.

## Decisions

- Shared helper in the existing `shared` utility barrel, rather than a new library: all four backend callers already depend on shared; reversible.
- Retain older punctuation-preserving keys as a compatibility fallback after the exact SDK key: preserves older local transcripts; reversible.

## Round 1 fixes

- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:2007-2036`: staged recovery now runs only in the listed exact Claude project directory, or the listed old-encoding directory when the exact one is absent. Other directories get read-only JSONL existence probes. Basename guesses are skipped below three characters, sorted, and limited so at most 20 candidate files are probed, with exact variants first.
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.spec.ts:2416-2480`: added short-name/drive-root, deterministic cap, and recovery-scope regressions.
- `apps/ptah-electron-e2e/src/support/session-seed.ts:5,64`, `libs/backend/agent-sdk/src/lib/helpers/history/jsonl-reader.account-context.spec.ts:16,28`, `libs/backend/agent-sdk/src/lib/helpers/history/jsonl-reader.service.spec.ts:33,391,417`: seed and fixture keys now use `claudeProjectDir`. The helper is exported from `libs/shared/src/lib/utils/index.ts:6` and re-exported through `libs/shared/src/index.ts:70`.
- Follow-up: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts` still lacks the Claude 200-character cap and hash. Another branch owns that file, so this round leaves it untouched.

### Round 1 verification

`npm run verify -- -t lint,typecheck,test -p shared,rpc-handlers,agent-sdk,messaging-gateway`: all eight lint/typecheck tasks passed. Shared, RPC handlers, and messaging gateway tests passed; agent SDK failed only in the known Windows symlink suites `plugin-loader.service.capabilities.spec.ts` and `plugin-loader.service.session-notice.spec.ts` (one test each, 223 other suites passed). `npm run verify -- -t lint,typecheck -p ptah-electron-e2e`: both tasks passed; no E2E tests were run. `npm run verify -- -t typecheck -p ptah-electron`: passed. Scoped `ptah_get_diagnostics` was attempted after edits but timed out; project typechecks provide the compiler result.

## Round 2 fixes

- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.ts:2013`: recovery uses the first exact/case-insensitive/normalized/older directory match. A case-variant Claude directory can therefore restore its staged transcript. Basename-only candidates remain read-only.
- `libs/backend/rpc-handlers/src/lib/handlers/session-rpc.handlers.spec.ts:2486`: a staged transcript in a case-variant exact directory is restored and `session:validate` returns `exists:true`.
- Accepted minor bound: the 20-candidate limit can omit a real directory beyond the first alphabetically sorted substring matches; exact matches are probed first.

### Round 2 verification

`npm run verify -- -t lint,typecheck,test -p rpc-handlers`: passed all three tasks (lint, typecheck, test). Scoped `ptah_get_diagnostics` timed out; the project typecheck passed.
