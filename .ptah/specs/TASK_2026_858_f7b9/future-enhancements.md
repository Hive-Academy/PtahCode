# Future enhancements — Ptah remote workers (after Phase D)

Sources: `phase-d-fix-plan.md` "Deferred", `phase-d-fix-20-report.md` and `phase-d-fix-21-report.md` "Not
done", and the Phase D reviews. Priority: P1 = before the fleet rollout (Phase F), P2 = before
the mobile PWA, P3 = later.

## P1 — before the fleet rollout

| Item | Source |
| --- | --- |
| A turn whose `session:id-resolved` never arrives cannot be aborted (`chat:abort` needs a session ID); its slot stays held until restart. Needs an engine abort by tab ID. | batch 20 |
| Shutdown waits with no timeout on an admission stuck inside an in-process RPC. Add a bounded drain. | batch 20 |
| Admin key: no challenge-response and no rotation. A local process with a reused PID that answers `hello` with the host-derived machine ID passes the identity check. | batch 21, security 3 |
| Pairing window can be burned by a local process (the attempt counter is global, the backoff is per connection). Add a per-window backoff, or document the risk. | security 5 |
| systemd unit hardening (`NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`, `UMask=0077`). | security 11 |
| Verify owner and mode of `~/.ptah/worker` and its files at start. | security 12 |
| Jest "worker process has failed to exit gracefully" warning in worker-runtime and worker-host runs; find the open handle. | batch 21 |

## P2 — before the mobile PWA

| Item | Source |
| --- | --- |
| `session.continue` result `queued: true` is not reported (the driver does not expose it). | batch 19.2 |
| `session.stop` on a turn still in admission returns `{ stopped: false }`. | batch 20 |
| An end event before `session:id-resolved` during a start is not recognized (not expected from the engine). | batch 20 |
| No subscriber back-pressure in the fan-out. | logic review |
| All session logs open at start and are never evicted; one corrupt log stops the worker. Event logs grow without bound and are read in full on open. | logic review, security 14 |
| Session index keeps cached entries for a removed workspace (no access). Session index refresh on an unknown ID re-lists every granted workspace. | batch 21, security 13 |
| `admin.grants.remove` (remove one workspace from a grant). | batch 21 |

## P3 — later

| Item | Source |
| --- | --- |
| `redact.ts`: wire it at more log sites; mask bare 8-char pairing codes; handle `code` keys without hiding error codes. | security 9 |
| keytar fallback derives the master key from `username:hostname` (same as the CLI). | security 10 |
| Pre-auth `hello` discloses host name, machine ID and version. | security 16 |
| Unbounded bookkeeping maps; pairing grants every registered workspace by default. | security 17, 18 |
| `CODEX_UNAVAILABLE` maps to wire `INTERNAL` (W12 fallback). | batch 18 |
| worker-runtime imports the full `@ptah-extension/rpc-handlers` barrel; add a secondary entry point. | style M5 |
| `as unknown as RpcSpec<…>` casts over `IN_PROCESS_SPECS`; type the table. | style S3 |
| `build-worker-host` copies the banner and externals of sibling targets; `validate-deps` keeps a second hand list. | style S4 |
| `serve.ts` still 380 lines; extract the readiness probe. Style minors M1–M6. | batch 21, style |
| Batch 14 state-store specs are thin. | handoff |

## Phase E follow-ups (added 2026-11-06)

| Item | Source |
| --- | --- |
| Phase F: add an optional safe `reason` to the shared `machines:state` payload and show it. It covers a different worker on the alias, "re-pair this machine" and a dropped session re-attach. | fix round 1 clarification; re-review N4, N6 |
| Phase F: a rebind flow for a reinstalled worker. Today the user must remove the machine and add it again. | re-review N4 |
| Phase F: sanitize the worker-supplied strings in `machines:event` payloads, display names and versions when the Machines view renders them. | security S6 |
| Shared `RpcUserErrorCode` has no generic internal code. Unknown machine errors map to `MACHINE_UNREACHABLE` (logged). | round 2 N7 |
| Cross-process lock for `~/.ptah/remote-machines.json` (two Ptah processes can lose an update). | security S9, re-review |
| `phase-2-libraries.config-home.spec.ts` walks above its `mkdtemp` folder. A stray `/tmp/.ptah` makes it fail. Bound the walk-up in the spec. | batch-22-report.md |
| `MachineConnection`: serialize `retry()` with `pair()`/`exchange()`. A manual retry during an exchange can lose its transport (`machine-connection.ts:326-345`). | round 2 review, Minor 1 |
| `exchange()`: move `await client.connect()` inside the `try` so a failed connect closes the client and the transport (`machine-connection.ts:345`). | round 2 review, Minor 2 |
| A failed explicit re-attach drops the tracked cursor, so auto-reconnect no longer re-attaches that session (`machine-connection.ts:387-405`). Fold into the Phase F reason work. | round 2 review, Minor 3 |
| A re-pair over a legacy token without a worker ID does not revoke the old token on the worker. | round 2 review, Minor 4 |
| Map `MachineRegistryWriteError` (registry over the size or count cap) in `mapMachineError`. Today it falls back to `MACHINE_UNREACHABLE` with a log entry. | PR 962 CodeRabbit re-review, Moderate 1 |
| `pairViaSsh` holds the service mutation queue for the ssh command (up to 15 s), so `add`/`remove`/`list` wait behind it. Use a per-machine queue. | PR 962 CodeRabbit re-review, Moderate 2 |
| `pair()` returns the offline summary for any error while the state is offline, not only for a `WorkerClientError`. Narrow the check. | PR 962 CodeRabbit re-review, Moderate 3 |

## Fleet setup findings (added 2026-11-07)

| Item | Source |
| --- | --- |
| P1: `rebuild-native.js` source-builds better-sqlite3 on the build host and copies it over `prebuilds/linux-x64.node`, so the deb needs the build host's glibc (2.38 from amun-PC 2.39). Ubuntu 22.04 / Mint 21 (glibc 2.35) workers fail with "Worker requires working better-sqlite3". Build the Linux addon in an older-glibc container, or declare `libc6 (>= 2.38)` in the deb Depends. | Gatsby install, decisions row 30 |
| `ptah-worker status` says "worker service is not running" while the unit is active but blocked on readiness; name the readiness gate instead. | Horus install |
| O1 copy carries the desktop `autopilot` setting; the worker refuses `yolo`/`auto-edit` at start. Document it in worker.md or offer a worker-only override. | Horus install |
| P1: amun-PC `~/.ptah/settings.json` has global `authMethod: "some-value"` (the fixture value of `file-settings-store.spec.ts` / `electron-workspace.spec.ts`). A spec probably wrote to the real settings home. Bound those specs to a temp home and validate `authMethod` on read. | Worker readiness, decisions row 31 |
| Worker readiness shows only check names in the journal ("Worker is not ready: provider"); log each failing check's detail (e.g. the auth-route blockers). | Worker readiness |
| Codex-only workers cannot serve: the worker host refuses `thirdParty`/openai-codex ("native Codex runtime"). | Anubis |
| Remote transcript links keep their real `href`; only click/auxclick are stopped (`remote-transcript.component.ts`). Not reachable in Electron (its context menu has no open-link item, `main-window.ts:74-98`; `will-navigate`/window-open go through `openExternalSafely`). Defence in depth: render remote links with an inert `href` and the target in a data attribute, incl. tool content; check drag-to-window too. | Phase F logic review r2, defect 2 (disputed) |

## Phase F Electron visual review (added 2026-11-07)

| Item | Source |
| --- | --- |
| "Remove machine" and "New session" use a different button style than the prototype; align them with the design-spec action styles. | visual-review.md finding 3 |
| The navbar Machines tab has no machine count badge (prototype shows one). | visual-review.md finding 3 |
| Pairing code cells do not show the error border after a rejected code. | visual-review.md finding 4 |
| The pairing failure copy has no "(N attempts left)" count; the worker would have to report the remaining attempts. | visual-review.md finding 5 |
| Escape closes the Add machine pane even while the theme popover is open; a global Escape handler should yield to an open popover. | visual-review.md finding 6 |
| A wrong pairing code takes about 7–10 s to fail; consider an earlier client-side or worker-side rejection signal. | visual-review.md finding 7 |
| The parent maps several worker errors to "The machine is unreachable." (`machines-rpc.handlers.ts:36-62`); the tabId defect was found only from the worker journal. Log the worker error code on the parent and consider a more specific user message for worker-side validation failures. | visual-review.md finding 1 |
| Readiness reports "Provider ready" while the Claude CLI login on the worker is expired, so a session starts and fails on its first turn. Add an authentication check to readiness, or label the check "CLI installed". | visual-review.md third pass finding A |
| A failed turn (for example a 401 from the provider) renders as plain assistant text, with no error styling, retry hint or pointer to log in again on the worker. | visual-review.md third pass finding C |
| The session title differs between the live view (first prompt) and the replay or list ("Session <date>"). Use one title source. | visual-review.md third pass finding D |
| In the light theme, the user's message in a remote session has no bubble; in dark it has one. | visual-review.md third pass finding E |
| The driver chip in the session list shows the worker's machine name and a process ID. Show a friendly label instead. | visual-review.md third pass finding F |

## Worker main database fix (added 2026-11-07)

| Item | Source |
| --- | --- |
| The worker's in-process RPC (`in-process-rpc.ts` `chatSpec.nested`) drops `accountRefusal`, so an account refusal reaches the parent as `INTERNAL` and then as "The machine is unreachable." Carry the refusal code to a dedicated worker error code and map `INTERNAL` to a "the worker could not start the session" message on the parent. | session-start root cause, visual-review.md second pass |
| The worker opens the default profile database (`~/.ptah/state/ptah.sqlite` when `NODE_ENV` is unset). A desktop app on the same machine and profile shares that file; WAL and a 5 s busy timeout allow normal concurrent use, but concurrent migrations can wait or return busy. Document this for operators, and test desktop + worker on one machine if that becomes a supported deployment. | worker-db-fix-review.md finding 3 |

## Stuck remote session fix (added 2026-11-08)

| Item | Source |
| --- | --- |
| Session ownership after a turn: the worker engine keeps its SDK record, and so the session's drive lock, while the session idles between turns (`session-driver-lock-coordinator.ts` releases only on record removal). `sessions.list` now shows such a session as Idle, but another process (the desktop app on the worker machine, or another client's local engine) still cannot drive it until the worker ends the record or restarts. Decide whether an idle worker session is transferable; if so, add an explicit handoff (end the idle record on request, or release it after an idle timeout) and a cross-process continuation test. Remote clients of the same worker can already continue it. Stop stays disabled for an idle session because no turn runs. | stuck-session-fix-review.md finding 3 |
| Test fidelity: the fake drive lock in `serve-sessions.spec.ts` resolves every acquire at once and has no pending-acquire model, so it cannot exercise the kernel's shared pending promise. `transcript.spec.ts` covers the foreign pending case; give the serve fake the same model when that spec grows. | stuck-session-fix-rereview-3.md finding 2 |
| Attach refresh bound: the 20 s deadline covers the wait for a previous refresh and the history read, but not the in-process lock acquire and release, the baseline enqueue, or the snapshot read for a session another process drives. Consider one end-to-end attach deadline if a slow kernel lock or log write is ever observed. | stuck-session-fix-rereview-4.md follow-up 2 |

## Fourth visual pass (added 2026-11-08, decision 40)

| Item | Source |
| --- | --- |
| After a remote Deny, "[Request interrupted by user for tool use]" renders as a user bubble. Render it as a muted system line. | visual-review.md fourth pass finding I |
| "No messages yet." shows for 1–2 s after Start and the user's prompt is not echoed until the worker answers. Echo the prompt at once. | visual-review.md fourth pass finding J |
| The approval block differs from the prototype: Deny is a plain text button (prototype: outlined), and the prototype text "Stays pending" is out of date (the 60 s auto-deny is decision 27). Update the prototype and align the Deny style. | visual-review.md fourth pass finding L |
| Allow once is the primary action and comes first in the focus order. Consider Deny first or equal weight for a remote approval. | visual-review.md fourth pass finding M |
| A denied tool reads "Failed": the shared `chat-ui` tool status vocabulary has no "Denied" state. Add one if the distinction matters. | frontend-developer report, finding H fix |
| The Tailwind base reset removes `ol` numerals app-wide (`styles.css` `.prose ol` styles only `::marker`). The Machines transcript restores them locally; local chat markdown probably has the same defect. Fix `.prose ol` once in `apps/ptah-extension-webview/src/styles.css`. | frontend-developer report, finding G fix |
| The local main transcript uses the same `buildToolNode`, which sets `complete` for an error result; local error tools may also read "Completed". | frontend-developer report, finding H fix |
| Sessions created before the title fix keep their stored "Session <date>" name; `session:list` has no first-prompt field. | backend-developer report, finding D fix |
| Ordered-list numerals in the remote transcript use the accent at 35% alpha (the app's `.prose ol > li::marker` rule) and read faint, more so in light. | visual-review.md fifth pass |
| A resolved approval block keeps Allow once and Deny on screen, disabled. Hide them or replace them with the outcome. | visual-review.md fifth pass |
| A screen-reader-only live region still announces "Claude is responding" after the turn ends. | visual-review.md fifth pass |
| The fifth pass saw K and H on the 60 s auto-deny path (the manual Deny click came too late). Both paths send the same hard deny and are covered by `remote-sessions.spec.ts`; capture a manual Deny in the next visual pass. | visual-review.md fifth pass |

## PR #982 CodeRabbit round 1 (added 2026-11-08)

| Item | Source |
| --- | --- |
| Add a store test where a reconnect arrives during an explicit attach. The `attaching` state suppresses a second attach; a failed in-flight attach stays detached until Refresh or the next reconnect. Document that recovery. | pr982-coderabbit-round-1-review.md |
| Add reference-image, table, setext and entity cases to `remote-markdown.spec.ts` (a direct marked probe found no bypass). | pr982-coderabbit-round-1-review.md |
