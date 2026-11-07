# HANDOFF — TASK_2026_858_f7b9 (Ptah remote workers)

Written 2026-11-07 (late evening) on amun-PC. Supersedes every earlier HANDOFF.md. The next session
can run on **abdallah-pc** (Windows): see the GitHub issue "Set up abdallah-pc as the parent" for
the setup checklist.

## Goal

Control Ptah on LAN machines from an Electron "parent" desktop. Workers expose WS `/rpc` on
loopback 41873, reached through `ssh -W`. Libs: worker-protocol, worker-runtime, remote-machines,
machines-ui, worker-host. All user decisions: `decisions.md` rows 12–34. Do not ask again about
anything recorded there.

## State

- Branch `feat/remote-workers-phase-f`, draft **PR #982** (https://github.com/Hive-Academy/PtahCode/pull/982) against main; setup issue #988 for abdallah-pc. Phase F (Machines view)
  is implemented, verified (scoped) and reviewed for 2 rounds + 1 bounded correction.
- CI on `c336bcc03`: every job passed except the degradation audit (`libs/frontend/chat` 12 vs
  baseline 11). Fixed in `bf73d834d` (`degradation-audit: reported` marker in
  `electron-welcome.component.ts`). CI on the new head was running when this was written.
- Review results (codex, implementer claude): logic 5 → 6, style 6 → 7, correction review
  REVISE 7/10 (`phase-f-correction-review.md`).

## Open items

1. **Serious, open (cap reached, needs the user's go):** `parseFlatStreamEvent`
   (`libs/frontend/machines-ui/src/lib/services/transcript-events.ts`, `default` branch) admits
   some union variants (e.g. `message_delta` needs `tokenUsage`, `compaction_start`) without their
   required fields. Fix: per-variant required-field checks for every admitted type + malformed
   specs. The user has not yet authorized another fix round.
2. **S3 residual:** `remote-session-view.component.ts` (~630 lines) still holds the
   transcript/approval pane template. Follow-up: extract a pane component.
3. **Disputed, recorded:** remote links via context menu — not reachable in Electron
   (`main-window.ts:74-98`); inert-`href` follow-up in `future-enhancements.md`.
4. **Not run:** Electron visual review (dark + light vs `prototype/`) — needs build/dev approval.
   Windows controller never tested.
5. **Parent move + roles (user request, discussed, not built):** abdallah-pc = parent;
   amun-PC + gatsby = workers; horus + anubis = review workflows (scope open: manual review lanes
   vs automatic routing = new work); chappie = decision-model router. Setup checklist in the
   GitHub issue.

## Fleet (2026-11-07)

- Workers horus, anubis, chappie, gatsby: worker deb (built before Phase F code), `ptah-worker`
  user unit, linger, `~/projects` registered, `authMethod: "claudeCli"`, readiness `ready: true`
  on all four. `d3:4b` reachable through the 11435 tunnel (chappie serves it on 11434).
- Gatsby moved to a new DHCP address (decision 32); amun-PC `~/.ssh/config` updated.
- OpenClaw removed on all workers (decisions 32–33); backups of configs in
  `~/ptah-cleanup-backup-20261107` on each machine (mode 0700). Kept: Docker Desktop, Timeshift,
  Ollama, `chappie-ptah-bridge.service`, project folders.
- amun-PC is not a worker yet; it still has `authMethod: "some-value"` (spec fixture, P1 in
  `future-enhancements.md`).

## Key files

- `.ptah/specs/TASK_2026_858_f7b9/decisions.md`, `context.md`, `future-enhancements.md`.
- `phase-f-code-{logic,style}-review{,-r2}.md`, `phase-f-correction-review.md`.
- `design-spec.md`, `prototype/` (Gate 1.7 approved, decisions 7 and 17).
- `libs/backend/worker-host/docs/worker.md` — worker operator guide.

## Background work

None. No lanes, subagents or child sessions running. CI on PR #982 head `56388f54e` was partly
done at handoff (pass=10, skipping=4, pending=6, no failure; `checks` audit job passed).
Note: `jq` is NOT installed on amun-PC — use `gh ... --jq` in watch scripts (two earlier
monitors silently failed because of this).

## Next steps (user decision 34: fix round, then Electron review, continue normally)

amun-PC stays the parent for now; the abdallah-pc move (issue #988) comes later.

1. Check PR #982 CI: `gh pr checks 982 --json name,bucket --jq '.[]|"\(.bucket) \(.name)"'`.
   Fix any task failure with a new commit.
2. **Fix round (authorized beyond the cap, decision 34)** in the worktree
   `/home/amun/ptah-extension/.claude-worktrees/remote-workers-phase-f`:
   a. Open item 1: per-variant required-field validation in `parseFlatStreamEvent`
      (`libs/frontend/machines-ui/src/lib/services/transcript-events.ts`) for every admitted type
      (read `libs/shared/src/lib/types/execution/stream.ts` for each event's required fields,
      incl. nested shapes like `tokenUsage`); malformed-event specs per variant.
   b. Open item 2 (S3): extract the transcript/approval pane from
      `remote-session-view.component.ts` into a focused component with typed `input()`/`output()`.
   Use a frontend-developer subagent (Claude) so the codex reviewers stay a different family.
   Verify: `npm run verify -- -p @ptah-extension/machines-ui` (TMPDIR=/home/amun/.cache/ptah-phase-e-tmp;
   foreground or background with timeout ≥ 3600000 — tests take > 10 min). Run
   `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` (CI audit).
   Grep new files for literal bidi chars. Commit (scope `machines-ui`).
3. Independent codex review of the fix (one lane, role code-logic-reviewer or code-style-reviewer,
   deliverable `phase-f-fix-round-3-review.md`, read-only, scoped verify only).
4. **Electron visual review (authorized, decision 34):** Machines view in dark + light vs
   `.ptah/specs/TASK_2026_858_f7b9/prototype/` (states listed in `prototype/README.md`). Run the
   Electron build/dev under the verify lock: `node scripts/verify.mjs --exec --task <name> -- <cmd>`.
   Use the visual-reviewer agent; deliverable `visual-review.md`; show screenshots to the user.
   Real worker data is available (horus, anubis, chappie, gatsby are ready and pairable:
   `ssh <alias> /opt/Ptah/resources/bin/ptah-worker pair --json`).
5. Push in the background; update the PR body test plan; when all items pass, mark PR #982
   ready (`gh pr ready 982`). Watch CI + CodeRabbit. No merge.
6. Later (user's call): abdallah-pc parent setup per issue #988; amun-PC as a worker.
