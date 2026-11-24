# Batch 4 report: TASK_2026_2322_4ba4 (the retired MCP slot sweep now removes the lane shape)

**Executor**: backend-developer subagent. No git commits were made.
**Worktree**: `D:\projects\PtahCode\.claude-worktrees\agy-acp-only`

## Tasks completed

### Task 4.1: Extend the matcher, return the shape and log it. Done.

All changes are in `retired-ptah-mcp-slots.ts`:

- **New regex.** `PTAH_LANE_URL` is added next to `PTAH_PERSISTENT_URL`, with the exact pattern from the contract:
  `^http:\/\/localhost:\d+(?:\/auth\/[A-Za-z0-9_-]{43})?\/agent\/[^/]+(?:\/workspace\/[^/]+)?\/?$`
  - Its comment cites where the grammar comes from: `ptahMcpServerUrl` in `cli-adapters/ptah-mcp-url.ts` and `laneMcpAuthUrl` in `cli-adapters/lane-mcp-credentials.ts`, both in `@ptah-extension/cli-agent-runtime`.
  - The grammar is copied, not imported.
- **New predicate.** `isPtahLaneEntry(entry)` is exported and sits beside `isPtahPersistentEntry`.
  - Both predicates now share one private guard, `remoteEntryUrl`. It accepts only an object with no `command` and no `headers`, and reads `serverUrl`, falling back to `url`.
  - The guards are unchanged for both shapes.
- **New type.** `RetiredPtahEntryShape = 'lane' | 'persistent'` is exported.
- **Return type changed.** `removeRetiredPtahEntry(configPath): Promise<RetiredPtahEntryShape | false>`.
  - The check still runs inside `withMcpConfigLock` and still touches only `PTAH_SPAWN_MCP_KEY`.
  - All other early `false` returns, and the throw on a file that does not parse, are unchanged.
- **Log line (R3).** The sweep now logs `[CodeExecutionMCP] Removed retired ptah entry from ${configPath} (${removed})`, where `removed` is `lane` or `persistent`.
- **Header rewritten.**
  - The ACP lane writes no config file.
  - It lists both URL families and which log label each one gets.
  - It states that no Ptah writer produces either shape anymore.
  - It says a lane entry is crash debris that the next stream-json spawn used to clean up.
  - It states the D5 accepted risk: an older build's live stream-json lane loses its entry during the upgrade window. It says why that is acceptable and that the shape is logged as the mitigation.
- **Stale comments fixed.**
  - `ptah-mcp-slots.ts` (Antigravity section): "or the stream-json lane's own entry" is removed. The comment now says no config file is written, and that the sweep removes persistent and lane-shaped entries.
  - `http-mcp-server.service.ts`:
    - The `removeRetiredEntries` doc covers the persistent slots and leftovers from an older build's lane.
    - The `writeViaFacet` doc no longer points to `AntigravityCliAdapter`. It now gives the facet's own reason: a second writer racing the facet's read-modify-write outside its lock means lost updates.
  - `grep "AntigravityCliAdapter|stream-json"` finds nothing in `ptah-mcp-slots.ts`. In `http-mcp-server.service.ts` it finds one line, the "older build" mention.

### Task 4.2: Update the sweep specs. Done.

Changes in `retired-ptah-mcp-slots.spec.ts`:

- The two "removes a Ptah-owned entry" cases now assert `'persistent'` instead of `true`.
- The old case "keeps the stream-json lane entry of a running agy lane" becomes **"removes a leftover lane entry"**. It asserts `'lane'` and that a user's `github` server survives.
- New cases:
  - **"removes a leftover lane entry without an `/auth/` segment"**: asserts `'lane'`.
  - **"keeps a lane-shaped entry that carries headers, byte-identical"**: asserts `false` and that the file bytes are unchanged.
- New `describe('isPtahLaneEntry')`. It covers four accepted shapes, each with both `serverUrl` and `url`. It rejects:
  - a persistent URL
  - a remote host
  - `127.0.0.1`
  - a short auth token
  - an extra path segment
  - headers
  - a command
  - a non-object
- The sweep tests:
  - The existing case now asserts the exact info text, ending `(persistent)`.
  - New case: **"names the lane shape in the log when it removes a leftover lane entry"** asserts the exact text ending `(lane)` (R3).
- The `toBe(false)` cases are unchanged. The `isPtahPersistentEntry` rejection label was renamed from "a running lane entry" to "a lane entry". That predicate still rejects lane URLs.

Change in `http-mcp-server.service.concurrency.spec.ts`:

- The case became "removes a leftover stream-json lane entry and keeps a user's own `ptah` server". The home file now ends `{}`, and the user's `https://mcp.example.com/ptah` in the workspace file stays.

## Edge cases

| Edge case | How it is handled | Evidence |
| --- | --- | --- |
| Lane URL without `/auth/` | The `(?:/auth/...)?` group is optional in `PTAH_LANE_URL` | spec: "removes a leftover lane entry without an `/auth/` segment" plus `isPtahLaneEntry` cases |
| Lane URL with `headers` | `remoteEntryUrl` returns null, so the entry is kept and the file is unchanged | spec: "keeps a lane-shaped entry that carries headers, byte-identical" |
| A user's own `ptah` server | A non-localhost URL, headers or a command never match | spec: "keeps a user's own `ptah` server…" (unchanged) plus the concurrency spec |

## Verification

Logs are in `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\.ptah\tmp\`.

- `npm run verify -- --related -p @ptah-extension/vscode-lm-tools` passed: exit 0, `1 task: 1 succeeded`, `lock released after 142.1s, exit code 0`. Log: `b4-related.log`.
  - The Nx output does not show which suites ran, so I also ran the two required specs directly with `node scripts/verify.mjs --exec --task b4-jest -- npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath <retired-ptah-mcp-slots.spec.ts> <http-mcp-server.service.concurrency.spec.ts>`.
  - Result: `Test Suites: 2 passed, 2 total`, `Tests: 52 passed, 52 total`. Log: `b4-jest.log`.
- `npm run verify -- -t lint,typecheck -p @ptah-extension/vscode-lm-tools` passed: exit 0, `2 tasks: 2 succeeded`, `lock released after 101.3s, exit code 0`. Log: `b4-lint-typecheck.log`.
- The only warnings are Node's "Failed to load the ES module … jest.config.ts" noise, which appears for every project config.
- **Late comment edit.** One comment-only edit to `retired-ptah-mcp-slots.ts` (the regex provenance wording) landed while the `--related` run was in progress. The focused jest run and the lint/typecheck run both started after it.

## Files modified

All files are in `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\vscode-lm-tools\src\lib\code-execution\mcp-http\`. None were created.

- `retired-ptah-mcp-slots.ts`: lane predicate, shape return, log, header.
- `retired-ptah-mcp-slots.spec.ts`: shape assertions, lane cases, R3 log assertion.
- `http-mcp-server.service.concurrency.spec.ts`: the lane entry is removed and the user's server is kept.
- `ptah-mcp-slots.ts`: comment only.
- `http-mcp-server.service.ts`: comments only (`removeRetiredEntries` and `writeViaFacet` docs).

## Risks and deviations

- **The "does not import cli-agent-runtime" acceptance item.**
  - `retired-ptah-mcp-slots.ts` imports only `fs`, `path`, `@ptah-extension/shared`, `@ptah-extension/vscode-core` and `@ptah-extension/harness-sync`.
  - The project as a whole already imports `@ptah-extension/cli-agent-runtime` in many files. It is declared in `libs/backend/vscode-lm-tools/package.json:16`, and `http-mcp-server.service.ts:52` imports it. So the premise in the plan that "vscode-lm-tools must not import cli-agent-runtime" is false, and the project-wide grep cannot come back empty.
  - I kept the copied grammar as the plan specifies. The comment gives the real reasons instead of a boundary rule that does not exist:
    - neither builder is exported from that library's barrel (`cli-agent-runtime/src/index.ts`);
    - the matcher must keep recognising the retired shape even if those builders change.
  - This is reversible.
- **D5 accepted risk.** It is documented in the header, and the logged shape is the mitigation.
- **Formatting.** I ran Prettier on the two `retired-ptah-mcp-slots*` files. Those reformats are within my write set, and some of them change older lines in those files.
  - I did not reformat `http-mcp-server.service.ts` or the concurrency spec. Both were already non-Prettier-clean at HEAD outside my edits, and lint-staged will format them at commit.
- **Other batches.** I did not touch Batches 1 and 5 (`cli-agent-runtime`, `acp-runtime`) or `batches.md`.
