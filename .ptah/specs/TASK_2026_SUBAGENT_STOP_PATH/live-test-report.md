## Setup

- Worktree `D:\projects\ptah-extension\.claude-worktrees\compaction-dev-defaults`, branch `feat/compaction-dev-defaults`. Node v24.15.0, Electron 44.4.3, Nx 23.2.1. Dev build, WASM copy, and renderer copy succeeded through the requested `scripts/verify.mjs --exec` targets.
- Production Ptah PID 26500 stayed running. There was no existing Ptah Dev instance. CDP port 9341 was free and connected to this worktree's renderer. Started Dev PIDs: seed 15200, scenario 1 28636, scenario 2 22288; all stopped. The unrelated isolated Electron process was untouched.
- Scratch workspace `.ptah/live-test-ws`: 15 text files, 64,440 bytes total. Active first-party key `provider.claudeCli.selectedModel` follows `active-provider-auth-key.ts:22-37`; the stored legacy auth method normalizes to `claudeCli`. Only `~/.ptah-dev/settings.json` was edited. Main UI displayed Haiku 5.5; both subagent traces identify `claude-haiku-5-5`. Launch env included `CLAUDE_CODE_SUBAGENT_MODEL=haiku` and `PTAH_NO_DEVTOOLS=1`.
- Scenario 1 settings: handoff 25,000, weighted stop 100,000,000. Scenario 2: handoff 2,000,000, weighted stop 60,000. Final restored budgets: 150,000 / 3,000,000, with Haiku retained. No secret values were recorded.

## Seed check

- `~/.ptah-dev/settings.json` did not exist before first launch and was created. The dev file has `gateway.enabled=false` and `cron.enabled=false`.
- After boot, additional key-path differences from production were `provider.some-value.selectedModel` and `__migrations.v4`. Thus the post-boot file was not production plus only the two disabled flags. Startup migration appears to have changed the seeded copy. Secret-bearing values were not printed.

## Scenario 1 handoff

| Expected | Observed |
| --- | --- |
| Haiku main and subagent | UI Haiku 5.5; JSONL model `claude-haiku-5-5`. |
| Near warning at 21,250 context tokens | No `Near-budget warning queued` log line or visible notice. The context measurement jumped to 31,079, so the warning path is unproven. |
| Handoff stop at 25,000 context tokens | `reason=handoff` at 31,079 context, 64,554 weighted; crossing occurred between measurements. |
| Record and usable follow-up | Record created `pending`, later `consumed`. Follow-up read it and summarized all 15 files in the main chat. No crash, stuck spinner, or error toast. |

- Log `C:\Users\abdal\AppData\Roaming\Ptah Dev\logs\Ptah Electron-2026-11-07.log:2198`, time 16:53:18.217Z: `[SubagentBudgetMonitor] Subagent stopped`, `reason=handoff`, `contextTokens=31079`, `weightedUsed=64554`.
- Record `.ptah/live-test-ws/.ptah/subagent-handoffs/20261107T165318190Z-5ad515209d19bc15-toolu_017urhepmx6NnVX7nr2K8NqY-3a9c5e1f.handoff.md`. It says the stopped agent cannot resume and its progress notes file was missing. Trace `~/.claude/projects/D--projects-ptah-extension--claude-worktrees-compaction-dev-defaults--ptah-live-test-ws/0f1b158a-6ceb-4c39-8006-37260514f3d2/subagents/agent-a533f3c84e1f60492.jsonl`; last usage context 2 input + 7,567 cache creation + 23,510 cache read = 31,079.
- Screenshots: [Haiku model](live-test/scenario1-model.png), [stop](live-test/scenario1-stop.png), [follow-up](live-test/scenario1-followup.png). No near-notice screenshot because none was observed.
- Initial main-thread response said handoff-file reads were declined and asked for guidance. The explicit follow-up `Continue the task from the handoff notes.` succeeded and marked the record consumed.

## Scenario 2 safety

| Expected | Observed |
| --- | --- |
| Haiku main and subagent | UI Haiku 5.5; JSONL model `claude-haiku-5-5`. |
| Safety stop at 60,000 weighted tokens | `reason=safety` at 63,828 weighted, 30,737 context; crossing occurred between measurements. |
| Record and usable follow-up | Record created `pending`, later `consumed`. Follow-up read it and summarized all 15 files in the main chat. No crash, stuck spinner, or error toast. |

- Same log, line 3768, time 16:56:03.581Z: `[SubagentBudgetMonitor] Subagent stopped`, `reason=safety`, `contextTokens=30737`, `weightedUsed=63828`.
- Record `.ptah/live-test-ws/.ptah/subagent-handoffs/20261107T165603560Z-b788425c01f97bf6-toolu_01JHMzVY1WFTrwtx3S55C1y5-5aae7046.handoff.md`; progress notes missing, original subagent cannot resume. Trace `~/.claude/projects/D--projects-ptah-extension--claude-worktrees-compaction-dev-defaults--ptah-live-test-ws/1c572bb5-b123-4af0-8bd2-bee561bb06c9/subagents/agent-a484f548f19020dc7.jsonl`; last usage context 2 input + 7,550 cache creation + 23,185 cache read = 30,737.
- Screenshots: [Haiku model](live-test/scenario2-model.png), [stop](live-test/scenario2-stop.png), [follow-up](live-test/scenario2-followup.png).
- Initial main-thread response again said handoff-file reads were declined and asked for guidance. The explicit follow-up read the handoff and completed the task.

## Production settings unchanged

- Before SHA-256: `3B77A44A544E315FAB6EA64E66ACF6A418A2FB94D1AE5D6EC028FEC36215132B`.
- After SHA-256: `3B77A44A544E315FAB6EA64E66ACF6A418A2FB94D1AE5D6EC028FEC36215132B`.

## Defects found

- Seed comparison differs after boot: `apps/ptah-electron/src/main.ts:66-73` seeds the file, then migration adds `provider.some-value.selectedModel` and `__migrations.v4` to the dev copy. The migration marker is expected startup behavior; whether the extra provider key is intended needs review. Evidence is the key-level diff above.
- Handoff creates user-visible interruption: `libs/backend/agent-sdk/src/lib/helpers/compaction/subagent-budget-monitor.ts:474-481` stops the agent, then the first main-thread response in both runs reports declined handoff-file reads and asks the user what to do. The next prompt succeeds. The cause of the declined reads was not established; see stop and follow-up screenshots.
- Near notice unconfirmed: `subagent-budget-monitor.ts:519-538` contains the warning path, but scenario 1 produced no matching log line. The coarse token measurement prevents a firm defect attribution.

## Verdict

Both threshold stops fired in a real Ptah Dev Electron instance using Haiku. Neither crashed or wedged the chat. A production user would see the stopped subagent and an initial request for guidance; a follow-up prompt let the main chat finish the work. The 85% near-budget warning was not observed, so that path remains unproven.
