# P2 lane rules (common)

Worktree: /home/amun/ptah-extension/.claude-worktrees/feat-coop-handoff-p2-watchdog-b3e084de911f (branch
feat/coop-handoff-p2-watchdog). Work ONLY there. Never stash, revert, commit, push, merge, or remove anything.
The coordinator commits. Do not edit files outside your write set. Do not touch `.ptah/specs/**` except the
status file named in your brief.

Program: TASK_2026_2297_920a "Replace automatic agent stops with cooperative handoff". Decision "Pause, never
kill". Read in this task folder: context.md, implementation-plan.md (sections "Watchdog and first-turn
recovery", "Sessions, successors and runtime caps", batches 8-13, 22, 25; the exact message table), parity-inventory.md,
inventory-sdk-cancel-text.md, inventory-sessions-lanes.md. P1 (#1464) and P3 (#1463) are merged on main.
OUT OF SCOPE (user did not approve): "handoff keeps predecessor". `ptah_session_handoff_ack` keeps calling
endSession(..., 'parent-stop'). Do NOT change ack behaviour, the batch 24 source closer, or session-handoff.service ack paths.

Already committed for you (commit c6467e3cd): `SessionEndCause` in libs/shared/src/lib/types/ai-provider.types.ts has
the new values `provider-no-response` and `provider-input-closed` (old `no-activity-timeout` stays decodable).
libs/shared/src/lib/types/agent-action.types.ts has Ptah-labeled builders: formatProviderHang, formatWatchdogRetry,
formatWatchdogFinalFailure, formatWatchdogNoSafeRetry, formatActivityOverdue, formatProviderInputClosed,
formatChildRuntimeAsk, formatChildPauseNotice, and formatAgentActionNotice (context.childSession, context.operation).
Use them; never write "the user" for a Ptah decision. Do not edit the shared lib unless the brief says so; if you need a
shared change, write it in your status file and keep going with a local workaround.

CONTRACT between lanes (both lanes code against it):
- When the 180 s provider guard fires inside a confirmed open turn, the session ends with cause `provider-no-response`.
- `SessionEndPayload` (agent-sdk session-end-callback-registry) gains optional `zeroOutwardEvents?: boolean`:
  true when the stream produced zero outward SDK events and no turn settled before the end. Lane A produces it, lane B consumes it.
- Legacy `no-activity-timeout` is treated like `provider-no-response` by consumers (historical data).

Verification rules (STRICT, repository memory limits):
- Do NOT run `npm run verify`, `nx`, build, serve, e2e, or any workspace-wide check.
- Run only focused checks, scoped to your write set and project:
  `npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
  `npx tsc --noEmit --project <tsconfig>` (the project's tsconfig.lib.json and tsconfig.spec.json)
  `npx eslint <changed files>`
- Write long output to .ptah/tmp/<name>.log and filter it with tail/grep. Do not re-run only to re-read output.
- Do not run any check of a project while another lane could edit it; stay in your projects.
Style: follow neighboring code; keep TypeScript precise (no `any`); no behavior that kills or aborts an agent
except a real provider hang abort that already exists. Add or update specs for every behavior change.
When done, write a status file (named in your brief) with: files changed, behavior, check results, open issues.
End with a short summary.
