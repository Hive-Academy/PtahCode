# Phase F visual review (Electron)

## Second pass (head 11262af8a)

**Verdict: PASS WITH NOTES, session half still NOT REVIEWED.** The two first-pass visual fixes are confirmed. The tabId blocker is fixed (the worker no longer rejects the start), but starting a session on horus is now refused by a different, worker-side cause, so the stream, approval, replay, watch-only and no-folder states were again not reachable.

### First-pass findings re-checked

- Finding 1 (session start fails): **partly fixed, still blocked.** The worker log on horus (read-only) showed the old `tabId must be a UUID v4` rejection at 21:30/21:31 and none after the new deb was installed, so the tabId fix works. The new attempt (one start, "Reply with the word ok.") fails in about 16 ms with `MACHINE_UNREACHABLE`. The worker log for that attempt reads "The session account could not be verified. The conversation was preserved." That text is the provider-account admission refusal (`mainSessionAccountFailure` in `chat-slash-command-router.service.ts:72-80`): horus has no admitted provider account for the session. Fixing it means giving the worker a Claude account, which I did not do (no credentials were copied or changed). anubis still runs the old deb and was not used.
- Finding 2 (selected row invisible in light): **fixed.** `05f-selected-light.png` shows horus with a clear 1px inset outline; the computed inset shadow is the base-content colour at 60% (dark navy on a near-white panel, well above 3:1). `05f-selected-dark.png` shows the same outline in light grey on the dark panel. `aria-current="true"` is still set.

### New findings (second pass)

1. **Serious (functional and copy): the start failure message is wrong.** The user sees "The machine is unreachable." while the header says Connected and readiness passed (`06-start-refused-dark.png`, `06-start-refused-light.png`). The real cause is an account refusal on the worker. `mapMachineError` (`machines-rpc.handlers.ts:30-62`) maps any unmapped `WorkerClientError` to `MACHINE_UNREACHABLE`. Suggested fix: add a distinct code and text for an account refusal, for example "horus has no Claude account set up for sessions".
2. **Serious (readiness gap): the readiness check reports "Sessions can start" while a session start is refused for lack of a provider account.** Add an account-admission check to the readiness list on the worker.
3. **Moderate: the start error is plain body text.** `<p role="alert">` uses `text-sm text-base-content`, with no error colour or icon, so it reads like a label. The prototype uses the error treatment on failures. The text itself contrasts well (dark text on the light panel, light text on the dark panel). Fix: use `text-state-err` with an icon.
4. **Minor: after a failed start the form keeps its content and Start stays enabled.** That is the right behaviour, and the layout moves by 28px when the alert appears (the buttons shift down). A reserved line would stop the shift.

### Second-pass state rows

| State | Dark | Light | Prototype | Result |
|---|---|---|---|---|
| Selected machine row | 05f-selected-dark | 05f-selected-light | proto-05-list-* | Matches. Fix confirmed. |
| Start refused (account) | 06-start-refused-dark | 06-start-refused-light | none | Renders cleanly; wrong message (new finding 1). |
| Focus on Start | 07-focus-start-dark | 07-focus-start-light | none | Pass. |
| Focus on Cancel | 07-focus-cancel-dark | 07-focus-cancel-light | none | Pass: 2px ring in the base-content colour, visible in both themes. |
| 5b Reconnecting | not reachable | not reachable | proto-05b-* | Not covered: it needs a dropped connection and I did not disturb the workers. |
| 6 Stream | not reachable | not reachable | proto-06-stream-* | Blocked by new finding 1 (no account on horus). |
| 7 Approval | not reachable | not reachable | proto-07-approval-* | Blocked, same cause. Nothing was written under the workspace. |
| 8 Replay | not reachable | not reachable | proto-08-replay-* | No session exists to replay. |
| 9 Watch-only | not reachable | not reachable | proto-09-owner-* | Needs a second client holding the driver lock on a live session. |
| 10 No local folder | not reachable | not reachable | proto-10-nofolders-* | Needs a profile without a workspace folder; the Ptah Dev profile has folders and was not changed. |

The prototype captures for these states already exist in `visual-review/` (`proto-05b` to `proto-10`), so no new `proto-*` files were needed. Sessions started: 2 attempts in total (one per theme), both refused, so nothing is running on horus. The Electron instance was closed.

### Second-pass checks

- axe-core (wcag2a, wcag2aa, wcag21aa, wcag22aa) on `ptah-machines-view` with the start form and error open, dark and light: 0 violations. `color-contrast` was reported as incomplete for 28 nodes (translucent glass), so contrast was checked by hand where stated above. axe was not run on stream or approval states because they were not reachable.
- Keyboard: Tab from the message box goes to Start, then Cancel, with a visible ring on each (`07-focus-*`). The approval buttons could not be checked.
- The Escape and renderer-reload replay checks were not run, since no session exists.

---

## First pass (head 73dca4808)

## Verdict

**PASS WITH NOTES** for the states that could be reached. One functional blocker stopped the review of the whole session half of the view: starting a session on a paired, ready machine fails with "The machine is unreachable." (Finding 1). Stream, approval, replay and watch-only states were not captured from the app (see Not covered). The reachable states match the prototype in layout and tokens, with the deviations below.

## Environment

- Launched: `NODE_ENV=development node_modules/.bin/electron dist/apps/ptah-electron/main.mjs --remote-debugging-port=9333`, driven with `playwright-core` over CDP. The existing dist build was used and no rebuild was done.
- Profile: the existing `Ptah Dev` profile (`~/.config/Ptah Dev`). It had no machines. Nothing was reset.
- Head: 73dca4808 on `feat/remote-workers-phase-f` (first pass). Second pass head: 11262af8a. The dist build (main.mjs 21:53:56) is newer than the last code commit (0604520e8, 21:50:42) and contains the tabId fix.
- Viewport: Electron window size cannot be set over CDP, so the renderer viewport was emulated at 1280x760 (same as the prototype captures). Narrow captures at 700x760.
- Themes: switched through the app's own theme popover (`ptah-glass`, `ptah-glass-light`).
- Real data: `horus` and `anubis` were paired through the app's Add machine flow, using "Pair automatically via SSH". A deliberately wrong code (8 x `Z`) exercised the pairing failure. No tokens, codes or addresses are recorded here. Both machines are still paired in the Ptah Dev profile. The Electron instance started for this review was closed.
- Prototype: `prototype/index.html` captures (`proto-*`), rendered in headless Chromium at 1280x760.

## States

Screenshots are in `visual-review/`.

| State | Dark | Light | Prototype | Match |
|---|---|---|---|---|
| 1 Empty | 01-empty-dark | 01-empty-light | proto-01-empty-* | Matches. Copy and "What is checked?" disclosure present. |
| 2 Add | 02-add-dark | 02-add-light | proto-02-add-* | Matches. 8 code cells, copy command, SSH pairing button. |
| 3 Pairing failed | 03-pairfail-dark | 03-pairfail-light | proto-03-pairfail-* | Deviates, minor (Findings 4, 5). |
| 4 Readiness | 04-readiness-dark | 04-readiness-light | proto-04-readiness-* | Matches. All 8 checks pass, and the Ready banner shows in both themes. |
| 5 List (one machine) | 05-list-dark | 05-list-light | proto-05-list-* | Deviates (Findings 2, 3, 6). Only the empty-sessions state was reachable. |
| 5 List (two machines) | 05e-list-two-machines-dark | 05e-list-two-machines-light | proto-05-list-* | Deviates: selection invisible in light (Finding 2). |
| New session form | 05c-newsession-* | 05c-newsession-* | none in prototype | Form renders cleanly in both themes. |
| New session error | 05d-newsession-error-* | 05d-newsession-error-* | none | Error text is shown, but the cause is generic (Finding 1). |
| Remove confirmation | seen, not saved | not captured | none | Renders as a bordered inline card. |
| Not paired | seen, not saved | 03 (accidental) | none | Renders as a warning card with a Pair button. |
| 5b Reconnecting | not reachable | not reachable | proto-05b-* | Not covered. |
| 6 Stream, 7 Approval, 8 Replay, 9 Watch-only | not reachable | not reachable | proto-06..09-* | Not covered (Finding 1). |
| 10 No local folder | not reachable | not reachable | proto-10-* | Not covered. |
| Narrow list and add (700px) | 11-narrow-700-list-dark, 11b-narrow-700-add-dark | 11-narrow-700-list-light, 11b-narrow-700-add-light | narrow.html not captured | Stacked layout. No horizontal overflow (scrollWidth equals clientWidth, 700). |
| Keyboard focus | 12-focus-a-dark, 12-focus-b-dark, 12-focus-addmachine-dark | the same names with `-light` | none | Pass (see Checks run). |

## Findings

1. **Blocking (functional, found while capturing visuals): a session cannot be started on a ready machine.**
   - On both paired workers (horus, anubis) the readiness check passes with all 8 checks ("Sessions can start on ..."). The header shows Connected, and the workspace and session list calls succeed.
   - "Start" in the New session form then fails every time with "The machine is unreachable." (`machines:session.start` returns `MACHINE_UNREACHABLE`). Evidence: `05d-newsession-error-dark.png` and `05d-newsession-error-light.png`.
   - The user sees a generic reachability message while the machine shows Connected. `libs/backend/remote-machines/src/lib/machines-rpc.handlers.ts:36-62` collapses several causes into `MACHINE_UNREACHABLE`, so the real cause is hidden. I did not find the root cause; it may be worker or tunnel side rather than renderer.
   - Suggested fix: find why start fails after a passing readiness check, and map distinct causes to distinct messages.
2. **Serious: the selected machine row is not visible in the light theme.**
   - `machine-list` marks the selected row with `bg-base-300`, which computes to about 78% of a near-white colour over a near-white panel. The row has `aria-current="true"`, but nothing visible marks it.
   - Evidence: `05e-list-two-machines-light.png` (anubis is selected, no highlight) against `proto-05-list-light.png`, which shows a tinted row with a border. In dark the highlight shows (`05e-list-two-machines-dark.png`).
   - This fails the 3:1 non-text contrast expectation for a state indicator (WCAG 1.4.11).
   - Suggested fix: add a border or an inset accent to the selected row, as in the prototype. Component: `libs/frontend/machines-ui/src/lib/components/machine-list/`.
3. **Minor: action styling differs from the prototype.**
   - "Remove machine" is a plain text button, where the prototype uses an outlined red button (`proto-05-list-*`).
   - "New session" is an `xs` primary button, smaller than the prototype's.
   - The navbar Machines tab has no count badge (the prototype shows one for attention items). This may be intentional while there is nothing pending.
4. **Minor: pairing code cells do not show the error border.**
   - After a failed pairing the cells use the neutral border (`border-state-err` is present in the class list, but the computed border is neutral), where the prototype shows red cell borders. Evidence: `03-pairfail-*` against `proto-03-pairfail-*`.
   - Suggested fix: make the error border win over the DaisyUI `input-bordered` border. Component: `add-machine-pane.component.ts` around lines 167-180.
5. **Minor: the prototype's failure copy includes "(N attempts left)", the app's does not.** The app shows no attempt count, and the heading reads "Re-pair horus" after the first failure because the machine was already registered. The failure card and the "Nothing was stored" line match.
6. **Minor, observation: Escape closes the Add machine pane.** It also closes the pane while the theme popover is open. My first captures lost the Add pane this way. Not a defect on its own, but a global Escape handler should not also close the pane while a popover is handling the key.
7. **Minor: the pairing attempt with a wrong code takes about 7 to 10 seconds to fail.** The button shows "Pairing..." and the SSH button is disabled during that time, which is acceptable feedback. The pane stays put and does not shift.

## Not covered

- Stream, approval, replay and watch-only (owner) states and "answered elsewhere": blocked by Finding 1, since no session could be started.
- Reconnecting (5b): it needs a dropped worker connection, and I did not disturb the workers.
- No local folder (10): it needs a profile with no workspace folder. The Ptah Dev profile has folders, and I did not change it.
- Prototype `narrow.html` was not captured, so the narrow check compares only against the narrow rules in the design spec.
- A wide (>1600px) capture was not taken.

## Checks run

- axe-core 4.x (wcag2a, wcag2aa, wcag21aa, wcag22aa) on `ptah-machines-view`, dark and light: 0 violations in the states open at the time. Colour contrast over the translucent glass panel may be reported as "incomplete" and was checked by hand instead.
- Manual contrast (text colour against the blended background): the lowest text pair in the list state is 6.63:1 in light (Connected status) and 8.03:1 in dark. Muted secondary text is 8.6:1 in light and 9.9:1 in dark or higher. All pass AA 4.5:1.
- Keyboard: Tab order is Add machine, the machine list (roving tabindex, one stop for the list), Readiness check, Remove machine, Reload, New session, then the Git panel and the navbar. Every stop shows a visible ring (2px outline in the theme's base-content colour; the primary buttons also have a glow). Screenshots: `12-focus-*`.
- Narrow (700px): the layout stacks with no horizontal overflow in the list and add states, in both themes.
- Layout shift: none observed while pairing, switching theme or opening forms.
