# PR #1522 round 1 report

## CI failures

| Job / failing step | Exact reported error | Cause and fix | Reproduced locally |
|---|---|---|---|
| `checks` (`140243735130`); coordinator identified the home-path privacy guard in the checks sequence. | Coordinator evidence: home-path guard matched a user path in `.ptah/specs/.../measure/baseline.md`. The coordinator fixed this; the raw `gh` log was unavailable in this lane. | Already fixed by coordinator. No source change made here. | No. |
| `test (shard 2/4)`; `mcp-core/tool-description.builder.spec.ts`, `mcp-core/agent-wait.tool.spec.ts`, `vendor-roster-drift.spec.ts`. | `buildAgentReadTool().description` lacked `starting or running`, `the newest lines are kept`, and `saved to a file the result names`; `buildAgentWaitTool().description` lacked `status (or starting)` and `PARTIAL`; `ptah_agent_status` lacked exact `CLI Session ID` and `resume_session_id`. | This branch shortened lifecycle tool descriptions. Restored the four tools' descriptions to main in `tool-description.builder.ts`, `agent-wait.tool.ts`, and `session-handoff-ack.tool.ts`; preserved four eager tools. Updated snapshots. Eager budget changed from 26,792 (25,516 measured) to 27,334 (26,032 measured; measured total +5%). | No pre-fix reproduction. After the fix, all relevant focused suites passed. |

The coordinator supplied the `checks` diagnosis and directed this lane to stop using `gh`; the CI raw log and latest `main` run could not be independently checked here.

## Review comments

| Comment | Valid | Fix | Regression test |
|---|---|---|---|
| B1 `nav/inspect.ts:46` | Yes | `nav/inspect.ts:48-73,88-103,165-169`: resolve and contain the static base, then filter walked results by real path containment. | `rejects a static list base symlink that resolves outside the workspace` (Windows skip guard). |
| B2 `nav/inspect.ts:52` | Yes | `nav/inspect.ts:75-85,170-177`: retain partial matches, report unreadable directory count, and return an error if none matched. | `reports partial and empty list results when directories cannot be read` (Windows/root permission skip guard). |
| B3 `nav/inspect.ts:127` | Yes | `nav/inspect.ts` git argument construction: status, diff stat, and log use root pathspec `-- .`; status and diff stat use relative paths. Inputs remain fixed argument arrays, with validated base and clamped limit only. | `keeps git status, diff stat, and log within a nested workspace root`. |
| B4 `tool-description.builder.ts:507` | Yes | `tool-description.builder.ts` read-symbol schema and `nav/inspect.ts:29-32`: removed schema maxima for values clamped by handlers; canonical grep `maxMatches` retains its strict maximum. | `omits schema maxima for limits that the handlers clamp`; inspect regression coverage is in `nav/inspect.spec.ts`. |
| B5 `tool-guidance.render.ts:171-187` | Yes | `libs/shared/src/lib/tool-guidance/tool-guidance.render.ts:178-187`: both rules now prefer `ptah_run_check` for supported targets and native commands for writes and unsupported targets. Existing byte/token caps unchanged. | Tool-guidance render suite: `lists every row that has a core wording, once, and stays inside its budget`. |

## Verification

- Focused `vscode-lm-tools` run: 10 suites passed; 763 tests passed, 26 skipped, 0 failed; 4 snapshots passed. The three pre-existing symlink cases now skip on Windows and remain enabled on Linux; the new symlink containment test likewise uses a Windows skip guard.
- Focused shared tool-guidance run: 76 tests passed. Tool-description builder focused run: 80 tests passed. Effective tool-list snapshot update: 3 snapshots updated; suite passed.
- Full `vscode-lm-tools` run was attempted once as requested: 132 suites passed and 5 failed; 4,050 tests passed, 26 skipped, 11 failed; 3 snapshots failed. Local run encountered worker OOM and Windows `EPERM` failures in cleanup/symlink tests. The inspect tests and snapshot suite subsequently passed in focused runs; the full suite was not rerun.
- TypeScript checks passed for `vscode-lm-tools` lib and spec tsconfigs, and shared lib and spec tsconfigs.
- ESLint completed with 0 errors and 2 warnings; warnings were pre-existing (`protocol-dispatcher.spec.ts` unused assignment and the existing builder file-size warning), with no warning on added lines.
- `ptah_get_diagnostics` remained running after its 45-second window and did not return diagnostics; explicit TypeScript checks above passed.
- No pre-fix local reproduction of the CI failures. Linux-only behavior was reasoned from the coordinator's CI summary and guarded tests; not reproduced locally.

## Not done

- The full library run did not finish cleanly on this Windows environment because of OOM and `EPERM`; no second full run was made. Linux-only symlink and unreadable-directory paths were not run locally.
- The exact raw CI error lines and a comparison against the latest `main` run were unavailable after the coordinator instructed this lane to stop using `gh`.