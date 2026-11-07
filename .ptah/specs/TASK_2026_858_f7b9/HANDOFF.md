# HANDOFF — TASK_2026_858_f7b9 (Ptah remote workers)

Written 2026-11-07 (late evening) on amun-PC. Supersedes every earlier HANDOFF.md. The next session
can run on **abdallah-pc** (Windows): see the GitHub issue "Set up abdallah-pc as the parent" for
the setup checklist.

## Goal

Control Ptah on LAN machines from an Electron "parent" desktop. Workers expose WS `/rpc` on
loopback 41873, reached through `ssh -W`. Libs: worker-protocol, worker-runtime, remote-machines,
machines-ui, worker-host. All user decisions: `decisions.md` rows 12–33. Do not ask again about
anything recorded there.

## State

- Branch `feat/remote-workers-phase-f`, draft **PR #982** against main. Phase F (Machines view)
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

## Next steps

1. If on abdallah-pc: do the setup checklist in the GitHub issue (SSH key + aliases, transport
   check, Ptah from the branch with the user's approval, pair the workers, smoke test).
2. Ask the user once: another fix round for open item 1 (and 2)? Electron visual review approval?
   Review-workflow scope for horus/anubis?
3. Watch PR #982 CI and CodeRabbit; fix task defects with new commits; keep it a draft until
   item 1 is resolved or accepted. No merge.
4. amun-PC as a worker (steps in the issue).
