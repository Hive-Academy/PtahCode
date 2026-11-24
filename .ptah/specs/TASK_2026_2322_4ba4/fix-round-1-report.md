# Fix round 1 — `TASK_2026_2322_4ba4`

Source: `code-logic-review.md` (S1, M1, M2, M3). Worktree `D:\projects\PtahCode\.claude-worktrees\agy-acp-only`, base HEAD c273a8e68. No git commits made.

## Findings

- **S1 (fixed)**: the `acpFloorByBinary` Map is now `acpFloorPassed: Set<string>`, and only a passing verdict is cached. A `false` or `undefined` result re-reads `agy --version` on the next detect or lane, and the in-flight probe map still de-duplicates concurrent probes. `detect()` reports the version it just read, and the re-probe refreshes `versionByBinary`, so the upgrade message also names the new version. Two new specs: a lane rejected at `1.5.0` runs on the next attempt at `1.5.2`, and that pass is cached (2 version reads after 3 lanes). Two detects report `1.5.0` and then `1.5.2`. The existing spec that asserted a cached `false` (one version read) now asserts a re-read (two reads).
- **M1 (fixed)**: the current behaviour is pinned in a spec. `request authorization: Bearer abc.def 401 Unauthorized` redacts to `request authorization: [REDACTED]` because the field rule masks the rest of the line, and classifying that redacted text gives `info`, so the error was lost. I added `laneStderrLine(line, mcpToken)` in `lane-stderr-redaction.ts`. It takes the severity from the original line and the text from the redacted line. The severity is only a label, so no secret leaks through it. The lane handle's `diagnostic` branch now uses it, and the spec asserts `{ severity: 'error', text: 'request authorization: [REDACTED]' }`. This changes Grok lanes too, in the same direction: their severity is now also taken from the unredacted line.
- **M2 (fixed)**: the first unreadable version for each binary in a process logs at warn. Every later occurrence logs the same message at debug (`unreadableVersionWarned` set). The existing unreadable-version spec now asserts exactly 1 warn and 1 debug across two lanes.
- **M3 (restored)**: I added `withAgyConptyNoiseFilter(factory = spawnAcpProcess)` in `antigravity-acp-lane.ts`. It wraps the transport factory's `onStderrLine` for each child and uses the old rules: drop a `conpty_console_list_agent` line plus the next 5 lines, and an `AttachConsole failed` line plus the next 3. It is applied only in `AntigravityCliAdapter.runAcp`, so Grok is unaffected. If there is no spawner and no seam factory, the adapter passes `undefined` as before, so the lane handle still reports the missing spawner. I did not treat this as moot because the old stream-json path set `NODE_PTY_USE_CONPTY=0` and also kept this filter (both came from the Gemini CLI fix in 0773d763b). New spec: a held lane is fed 12 lines, and only `kept one` and `kept two` reach the segments. Inventory row added at `parity-inventory.md:51`.

## Focused checks (no nx / npm run verify, per the low-memory instruction)

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath antigravity-cli.adapter.acp.spec.ts provider-session/lane-stderr-redaction.spec.ts`: 2 suites, 63 tests passed (`.ptah/tmp/fix1-jest.log`).
- Same runner on `grok-cli.adapter.spec.ts`, `antigravity-cli.adapter.spec.ts`, `antigravity-cli.adapter.sign-in.spec.ts` and the three `provider-session-lane-handle*.spec.ts`: 6 suites, 132 tests passed (`.ptah/tmp/fix1-jest-related.log`).
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: exit 0. `tsconfig.spec.json`: exit 0, no errors.
- `npx eslint` on the 6 changed source and spec files: exit 0, no output.
- Not run: the full project test target and the gate (the coordinator owns these). `antigravity-cli.adapter.acp.live.spec.ts` is a live spec and was not run.

## Files changed

- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.ts`: caches only a passing floor verdict, warns once per binary for an unreadable version, and wires the ConPTY filter.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-acp-lane.ts`: adds `withAgyConptyNoiseFilter`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\antigravity-cli.adapter.acp.spec.ts`: upgrade, detect-version, warn-once and ConPTY specs, plus the re-read assertion.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\lane-stderr-redaction.ts`: adds `laneStderrLine` (original-line severity, redacted text).
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\lane-stderr-redaction.spec.ts`: specs for a secret field and a status on the same line.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\libs\backend\cli-agent-runtime\src\lib\cli-agents\cli-adapters\provider-session\provider-session-lane-handle.ts`: the `diagnostic` branch uses `laneStderrLine`.
- MODIFIED `D:\projects\PtahCode\.claude-worktrees\agy-acp-only\.ptah\specs\TASK_2026_2322_4ba4\parity-inventory.md`: ConPTY filter row.

## Decisions

- M1: I classify on the original line and emit only the redacted text, instead of narrowing the redaction regex. Narrowing the regex could leak a secret that sits before a status word, while the severity label leaks nothing. This is reversible.
- M3: I restored the filter through an adapter-local transport-factory wrapper, not a new option on the shared lane handle. That keeps Grok unaffected and adds no option for a single user. This is reversible.
