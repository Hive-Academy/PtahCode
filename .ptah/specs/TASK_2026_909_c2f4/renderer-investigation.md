# Renderer-side lag investigation (TASK_2026_909_c2f4)

Companion to `host-investigation.md` (host-side RPC timeouts). All paths below are
relative to the worktree root. The log window (2026-11-09 21:45-22:10 UTC) post-dates the
missing-root guards (`36e3def2a`, 2026-11-08 22:09 UTC; `ef19cf6bc`, 21:40 UTC;
`22668a980`, 2026-11-09 02:55 UTC), so the evidence shows the current code's behavior.

## Findings

### 1. `SessionGitStatsStore` re-reads a removed worktree every ~60 s — the root-flip loop

- Symptom: ~14 repeats of `Git read failed. This worktree folder no longer exists on disk.`
  in 25 minutes (~1 per 107 s), with an active session whose working root is a deleted
  worktree.
- Root cause: the store HAS a per-entry terminal state (`entry.unavailable = true`,
  `session-git-stats.store.ts:357`, blocking requests at `:291` and drain at `:330`), but
  the entry is destroyed and recreated every cycle by a cross-store signal flip:
  1. `read` gets `GIT_ROOT_MISSING_MESSAGE` → warns once per fresh entry (`:356`) →
     `unavailableRoots.mark(entry.root)` (`:358`).
  2. `UnavailableGitRootsStore.mark` always writes a new array
     (`unavailable-git-roots.store.ts:20`), so every consumer's `gitRoot` computed
     re-resolves. `resolveSessionWorkingRoot` skips roots in that set and takes the NEXT
     candidate (`session-working-root.ts:70`), so the card's root flips to a fallback root.
  3. The tracking effects re-run on the flip and re-`track`:
     `compact-session-card.component.ts:616-620`, `inspector-git-section.component.ts:149-155`
     (both read `unavailableRoots.roots()` in `gitRoot`,
     `compact-session-card.component.ts:486`, `inspector-git-section.component.ts:134`).
     The teardown of the previous run deletes the store entry when it held the last tab
     (`session-git-stats.store.ts:226-233`).
  4. After `UNAVAILABLE_GIT_ROOT_MS = 60_000` (`unavailable-git-roots.store.ts:4`) the
     expiry timer removes the mark (`:34-37`) → signal write → the root flips BACK to the
     missing worktree → the effect re-runs → a FRESH `RootEntry` with `unavailable: false`
     (`session-git-stats.store.ts:204-217`) → debounced `read` 1 s later (`:300-310`) →
     MISSING again → warn again. Loop closed.
- What triggers `read`: `track()` on entry creation (`:217`); forced request on
  `session:turnEnded`/`turnFailed` (`:268-288`, blocked while `unavailable`); a
  `git:status-update` push for the same root resets `unavailable` and `backoffUntil`
  (`:252-253`) — pushes never come for a deleted root, so this reset is not the driver.
  No timer polls; everything is event-driven.
- Negative cache / backoff present: `unavailable` is terminal per entry but does not
  survive entry recreation; `backoffUntil` (30 s) exists only for probe-failure and RPC
  timeouts (`:372-374`, `:385-387`), not for MISSING.
- Signal writes per failure: `mark()` invalidates every card/inspector/composer `gitRoot`
  computed chain and re-renders the flipped card; `setState` writes a new Map but is
  equality-guarded (`:408`), so it writes only on a real state change. The warn itself is
  once per fresh entry (guard `:356`).
- Where the terminal state belongs: a per-root negative cache in `SessionGitStatsStore`
  that survives entry teardown (e.g. `missingRoots: Map<string, number>`), consulted by
  `track()` and `request()`, cleared only by an authoritative event for that root (a
  matching `git:status-update`, a session re-home, a manual retry) — not by a 60 s TTL.
- Side cost of the loop: each fresh read makes the host re-probe the root, because a
  confirmed refusal is cached host-side for only `READ_PROBE_NEGATIVE_TTL_MS = 2_000`
  (`git-root-resolver.ts:80`, `:340-343`, worktree-list probe `:385-399`); each flip also
  triggers a real `git:info` (full `git status`) of the fallback root — the main repo.
- Confidence: high (code path and cadence; ~60-65 s predicted vs ~107 s observed, the
  gap is the 30 s backoff after the 2 RPC-timeout reads seen in the log).

### 2. `ChangeSetStore.reconcile` — bounded repeat, not a loop

- Symptom: one `Reconcile read failed. RPC timeout: git:info` line.
- Triggers of `reconcile`: session view opens (`change-set.store.ts:318-321`), a
  `git:turnChangeSet` push (`:453`), `session:turnEnded` forced (`:466`), a
  `git:status-update` push for the session's tree forced (`:534`), plus a rerun queued
  while a run is in flight (`:692`).
- Negative cache: yes. `MISSING`/`UNAVAILABLE` errors put the session's root into
  `unavailableRoots` for `UNAVAILABLE_ROOT_BACKOFF_MS = 60_000` (`:304`, `:667-668`),
  checked in both `requestReconcile` (`:601-602`) and `reconcile` (`:617-618`); other
  failures back off 30 s via `failedUntil` (`:628`, `:665`, `:670`, `:676`).
- Does it re-ask a root the host reported missing? Yes, but only after the 60 s window
  lapses and only on the next trigger (a turn end or a session re-open) — one retry per
  backoff window per session, not a loop. The single logged line was an RPC timeout
  (host-side slowness, see `host-investigation.md` finding 4), not a MISSING repeat.
- Confidence: high.

### 3. `GitRootWatchLeaseService` re-leases a rejected root after 60 s

- Symptom: one `git:watchRoots failed Object` line (the `Object` is the text-only
  renderer→host console bridge stringifying `{error}`; the monitor notes text-only
  forwarding at `renderer-frame-monitor.service.ts:20-21`).
- Rejected roots are excluded from `flush`/`renew` for
  `REJECTED_ROOT_BACKOFF_MS = 60_000` (`git-root-watch-lease.service.ts:36`, filter
  `:86-88`, `:102-104`, set `:141`). `RENEW_INTERVAL_MS = 60_000` (`:35`): once the
  rejection backoff lapses, the next renewal re-includes the missing root and the host
  rejects it again — a steady ~60-120 s re-lease rhythm, one cheap probe each time. This
  is the documented intent ("the next `update` asks for it again", `:23-25`).
- The 60 s churn of finding 1 feeds it: the dock scope rebuilds `leaseRoots` from the
  unavailable set (`git-dock-scope.store.ts:458-463`), and the `leasedKey` guard
  (`:465-466`) passes on every flip, so `leases.update` fires per flip (`:468`).
- The logged failure is a different branch: `result.success === false` (`:146-148`) with
  exponential retry backoff 5→60 s (`:167-175`) — a transient RPC failure, once in the
  log. No lease is "renewed for a root the host reported missing" beyond the bounded
  re-include above.
- Confidence: high for the code paths; medium that the re-lease rhythm matters (cheap).

### 4. `RendererFrame` reporter drops script attribution

- Threshold 200 ms and one log per 10 s (`renderer-frame-monitor.service.ts:18`);
  payload is only `{durationMs, entryType}` (`:22`). The `long-animation-frame` entry's
  `scripts` array (`sourceURL`, `invoker`, `invokerType`, `duration`, `sourceFunctionName`)
  and `blockingDuration`/`styleAndLayoutStart` are available and discarded. So the log
  cannot attribute any of the 25 long frames. Adding attribution is a one-line-diagnostic
  gain; provided at `apps/ptah-extension-webview/src/app/app.config.ts:252-253`.
- Confidence: high.

### 5. Source of the 200-740 ms frames (candidate verdicts)

- (a) Git result re-renders a long list without `track` — **rejected**. The transcript
  tracks (`chat-transcript.component.html:41`, `@for (slot of vm().slots; track slot.id)`)
  and keeps per-turn snapshot identity stable
  (`chat-transcript.component.ts:683-685`); canvas rail lists track too
  (`canvas-rail-card.component.ts:199,207`). No missing-`track` list found on a git path.
- (b) Markdown re-render of the full transcript — **rejected as the periodic source**.
  No code path re-parses markdown on a git event; markdown is untouched by status pushes
  (the snapshots the bubbles read are identity-stable). Not disproven for the one
  PostCompact reload moment.
- (c) A computed that maps over all sessions/messages on each git event — **confirmed as
  code path; most probable source; magnitude not measured (see finding 4).**
  `ChangeSetStore.setSnapshot` always writes a new Map and a new snapshot object with no
  equality check (`change-set.store.ts:700-712`), so EVERY applied `git:status-update`
  push (`:532`, `:621-627`) and every successful reconcile (`:687-691`) invalidates the
  `marks` computed, which iterates all sessions' snapshots × change sets and builds fresh
  `Set` objects (`:277-292`). The new marks identities defeat `sameInputs`
  (`transcript-turn-summaries.ts:85-87`, marks compared by reference `:193`), so
  `TranscriptTurnSummaries` re-collects all slots (`:118-127`) and re-runs
  `buildTurnSummaryModel` for EVERY turn of the session (`:133-143`) — un-windowed, in
  one synchronous message dispatch. The push payload itself carries the full file list
  (`git status --porcelain=v2 -z --untracked-files=all`, `git-info.service.ts:111-112`;
  no file cap found), and `isGitInfo` + `toSnapshot` validate every file entry in the same
  task (`session-git-stats.store.ts:75-98`, `change-set.store.ts:152-178`). Cadence = git
  events in the watched main tree = 10-60 s during active work; cost scales with
  transcript length and dirty-file count.
- (d) An effect that writes signals in a loop — **confirmed as a periodic cross-store
  cycle**, not an unbounded same-tick loop: the finding-1 chain (mark → 60 s expiry →
  root flip → re-track → read → mark) writes `UnavailableGitRootsStore`, the store's
  `states` Map, and re-renders the flipped card/inspector on every cycle. No
  effect-writes-signal-it-reads loop found anywhere in the traced stores.
- (e) PostCompact targeted reload — **confirmed to exist, not the periodic source.** One
  occurrence in the log: 250 ms after the advisory (`compaction-advisory-correlator.service.ts:60`,
  `:199-225`) it reloads the session through `handleCompactionComplete` with
  `advisoryFallback: true` (`compaction-lifecycle.service.ts:683-688`) — a full transcript
  rebuild, plausibly one of the larger frames, but its cadence (compactions) does not fit
  10-60 s.
- Confidence: (c) high for the path, medium that it is THE source — the discarded
  attribution (finding 4) is what would settle it.

### 6. Are the failing reads and the long frames one defect?

Two defects, one shared trigger family:

- Defect A (finding 1): the 60 s root-flip loop — repeated dead-root reads, host re-probes,
  card re-renders, and a fallback-root `git status` per cycle. It emits the warn lines.
- Defect B (finding 5c): unconditional signal identity churn per git push — the
  transcript-wide marks/summary rebuilds. It emits the long frames.
- Both fire on the same cadence: git events in the busy main tree plus the 60 s loop, so
  the warns cluster next to the long frames in the log. They are not one mechanism: a
  dead root never receives pushes, so defect B needs live roots, and defect A alone
  produces no 700 ms frame. The `git:info` RPC timeouts are host-side (queue wait up to
  60 s vs the renderer's 75 s budget; `host-investigation.md` findings 3-4).
- Confidence: medium-high.

## Proposed fixes

1. **Cheapest diagnostic first — log script attribution.**
   `RendererFrameMonitorService` (`libs/frontend/core/src/lib/services/renderer-frame-monitor.service.ts:15-26`):
   include the top `entry.scripts` entry (`sourceURL`, `invoker`, `duration`) and
   `blockingDuration` when present, keeping the trailing-JSON format and the 10 s throttle.
   Spec: `renderer-frame-monitor.service.spec.ts`. This also verifies fix 3's effect.
2. **Terminal missing-root state in `SessionGitStatsStore`.**
   `libs/frontend/chat/src/lib/services/session-git-stats/session-git-stats.store.ts`:
   add a per-root negative cache (e.g. `missingRoots: Set<string>` filled in the MISSING
   branch at `:355-362` and the catch at `:379-390` when the host confirms absence);
   consult it in `track()` (`:201`) and `request()` (`:290`); clear it in the
   `GIT_STATUS_UPDATE` handler (`:252-257`) and on a root change. Stops the flip loop's
   warn+RPC every ~60 s and the fallback-root `git status` per flip. Spec:
   `session-git-stats.store.spec.ts`.
3. **Stop the per-push identity churn in `ChangeSetStore`.**
   `libs/frontend/chat/src/lib/services/change-set/change-set.store.ts`: make
   `setSnapshot` (`:700-712`) reuse the previous snapshot object when the content is
   equal (same root, `present`, `conflicted`, `untrackedDirs`) and skip the signal write;
   that alone stops the `marks` computed (`:277-292`) and the
   `TranscriptTurnSummaries` rebuild (`transcript-turn-summaries.ts:85-143`) on
   no-change pushes. Specs: `change-set.store.spec.ts` (an identity-stability case exists
   at `:297`), `compaction-lifecycle.service.spec.ts` untouched.
4. **Optional hardening — watch lease.**
   `libs/frontend/git-ui/src/lib/services/git-root-watch-lease.service.ts`: treat a
   confirmed-missing rejection as terminal (no 60 s re-include), or filter roots already
   in `UnavailableGitRootsStore` at the dock scope (`git-dock-scope.store.ts:458-464`) so
   the flip churn stops re-sending the lease set. Spec:
   `git-root-watch-lease.service.spec.ts`.
5. **Optional — `ChangeSetStore` missing-root window.**
   `change-set.store.ts:667-668`: keep the per-session `unavailableRoots` entry until the
   session's newest change set's root changes instead of the fixed 60 s. Only worth doing
   after fix 2; the current repeat is bounded to once per backoff window.

## Decisions

- Treat a host-confirmed MISSING root as terminal renderer-side state, not a 60 s TTL
  record (fix 2). Evidence: the host answers MISSING only after a confirmed directory
  absence (`git-root-resolver.ts:232-266`), so the fact is authoritative until the user
  re-creates the folder. Matches the host lane's decision to treat confirmed missing
  worktrees as terminal. Options: store-local cache (chosen) vs raising
  `UnavailableGitRootsStore` TTL (rejected: the TTL also keeps cards on the fallback
  root, and the store is the owner of the read decision). Reversible: yes.
- Attribute the `git:info` RPC timeouts to host-side slowness, not to renderer repeat
  volume; do not raise `RPC_TIMEOUT_MS` (`session-git-stats.store.ts:31`). Evidence:
  `host-investigation.md` findings 3-4. Reversible: yes.
- No change proposed to the status payload size (`--untracked-files=all`,
  `git-info.service.ts:111-112`): capping it changes product behavior (per-file untracked
  display) and belongs to a separate decision; only the identity churn (fix 3) is in
  scope here.

## Not found

- No renderer timer that polls git: all `read`/`reconcile` triggers are events (track,
  turn ends, pushes); the only intervals are the 60 s lease renewal and the 60 s
  unavailable-roots expiry.
- No unbounded same-tick effect→signal loop in the traced stores; the only cycle is the
  60 s flip loop (finding 1).
- No missing `track` in the transcript or the traced card lists; candidate (a) rejected
  on that evidence.
- No file-count cap on the git status payload in `git-info.service.ts` (searched
  `MAX_FILES|maxFiles|files.slice`) — payload size on a dirty tree is inferred, not
  measured.
- No frame attribution data in the evidence (the monitor discards `scripts`), so the
  magnitude of finding 5c is a code-path confirmation, not a profile; fix 1 exists to
  close this gap.
- Could not pin the evidence session's exact build commit; the log window post-dates all
  three guard commits by ~19 h, so the current-code interpretation stands, and finding 1's
  loop does not depend on the guard either way (fresh entries always re-read).
