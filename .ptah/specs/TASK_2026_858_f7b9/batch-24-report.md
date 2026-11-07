# Batch 24 report — C10b machine list, pairing, readiness (Task 24.1, revised Round 6)

Worktree: `.claude-worktrees/remote-workers-phase-f` (branch `feat/remote-workers-phase-f`). Nothing committed.

## Files

All under `libs/frontend/machines-ui/src/`.

- CREATED `lib/utils/display-text.ts` (+ spec): `displayText(value, max = 80)`, the one S6 helper, plus `DisplayTextPipe`. It strips C0/C1 controls, bidi embeddings, overrides, isolates and marks (U+061C, U+200E/F, U+202A-E, U+2066-9) and zero-width characters. It turns separating controls into spaces, collapses whitespace, trims, and caps at `max` code points with `…`, never splitting a surrogate pair.
- CREATED `lib/utils/machine-copy.ts` (+ spec): `PAIRING_COMMAND` = `WORKER_REMOTE_COMMAND + ' pair'`, `READINESS_COMMAND` = `WORKER_REMOTE_COMMAND + ' status'`, state labels, `MACHINE_REASON_COPY`, `reasonNeedsRepair`, `noWorkerModeCopy`, `versionMismatchCopy`, `durationText`.
- CREATED `lib/components/machine-status/machine-status.component.ts` (+ spec): the `ptah-machine-status` atom.
- CREATED `lib/components/machine-list/machine-list.component.ts` (+ spec): `ptah-machine-list`.
- CREATED `lib/components/add-machine-pane/add-machine-pane.component.ts` (+ spec): `ptah-add-machine-pane`.
- CREATED `lib/components/readiness-panel/readiness-panel.component.ts` (+ spec): `ptah-readiness-panel`.
- CREATED `lib/components/machines-view/machines-view.component.ts` (+ spec): `ptah-machines-view` (container) and the pure `machineBanners()`.
- CREATED `lib/components/copy-command/copy-command.component.ts`: `ptah-copy-command`, a mono command with a Copy button (CDK `Clipboard`). The pairing panel and the readiness rows both use it. See Decisions.
- MODIFIED `index.ts`: exports the six components, `machineBanners`, `MachinesPaneMode`, `displayText`, `DisplayTextPipe` and `DISPLAY_TEXT_MAX_LENGTH`.
- MODIFIED (additive) `lib/services/machines-store.ts`: `sshAliases()` and `readiness(machineId)`. Each passes one call through `MachinesApi` and returns a `MachinesOutcome`, with no state. The add form needs the first and the readiness panel the second. Nothing else changed.

## Component specs per state

| Component | States / behaviour pinned |
| --- | --- |
| `machine-status` | 5 states, each with a shape, a label and an ink (`text-state-done/idle/need/err`). The marker is `aria-hidden`. Offline (solid ring) and Not paired (dashed ring) look different. The marker spins only while reconnecting, with `motion-reduce:animate-none`. A label override is accepted. The atom has no button. |
| `machine-list` | Empty: "No machines yet.", ghost Add (D6). Loading: `role=status`, `aria-busy`. Error: `role=alert` with the sanitised message and Try again. Rows sit in a `<ul>` and show name, mono alias, status and a meta line ("Last seen 12 s ago", "Not connected", `ptah <ver>`). The selected row has `aria-current`. The list has one Tab stop (roving tabindex). ArrowUp/Down/Home/End move focus; click or Enter selects. Names are sanitised and capped. The footer says "This machine stays in Chat." |
| `add-machine-pane` | The alias datalist comes from `sshAliases()` and drops entries that fail `MACHINE_SSH_ALIAS_PATTERN`. Any alias can still be typed, and the form works when the alias list fails. The pairing command is `WORKER_REMOTE_COMMAND pair`. The form has 8 cells labelled "Character n". Pasting a whole code into any cell fills all 8 cells. Typing moves to the next cell, and Backspace moves back. An incomplete code or an invalid alias is refused before any RPC. On success the pane adds the alias, pairs with the normalised code and emits `paired`. A registered unpaired alias is reused, and an alias that is already connected is refused. While pairing, the button reads "Pairing..." and is disabled; Cancel stays enabled. A rejected code shows the 4.3 alert: no cause, no attempts count, cells `aria-invalid`, focus back on the first cell, and "Nothing was stored…". Pair automatically via SSH calls `pairViaSsh`, and its banner shows the SSH-path message, which may contain the attempts count. Also covered: Cannot reach host, version mismatch falling back to the "no worker mode" copy, sanitised error text, re-pair mode (alias read-only, reason copy, no `add`), and Esc/Cancel. |
| `readiness-panel` | Loading: status, Check again disabled. Seven checks, each with a Pass/Fail/Warning text and a mark. Not ready: "2 of 7 checks need your attention…". Ready. Not connected: `remote: null`, local checks still listed. A copyable fix appears only on fail and warn rows. Error: an alert, then Check again recovers. Worker label, detail and fix are sanitised. An unknown status shows as Warning, never Pass. Copy report produces plain text. The footer names `WORKER_REMOTE_COMMAND status`. An older answer is ignored after Check again. |
| `machines-view` | Loads machines on init. Empty 4.1: one primary in the pane, a ghost Add in the list, "What is checked?" with 7 items. The first machine is selected by default. The header shows "via SSH alias horus · ptah 0.1.70 · protocol 3". Clicking a row selects it. Reconnecting shows a `role=status` banner: "Lost contact 12 s ago… unknown, not failed… Next attempt in 5 s". The banner counts down, and Retry now calls `retry`. The clock runs only while the selected machine is offline or reconnecting, and stops on destroy. Version mismatch shows an alert with both versions, or the "no worker mode" copy when no remote version exists. Reasons `worker-identity-changed` and `re-pair-required` show their fixed copy and a Re-pair button. Re-pair opens the pair flow for that machine (alias read-only, no `add`) and then the readiness check. `session-reattach-failed` shows its copy and Retry now. Unpaired with no reason offers Pair. Remove confirms with an `alertdialog` ("Deletes the stored token and stops the tunnel"), moves focus to Cancel, then removes; a failed remove shows a sanitised alert. The pane also opens the readiness check and goes back, and opens and cancels Add. `machineBanners`: offline never says the sessions failed, and names are sanitised. |

No template uses `[innerHTML]`. Worker-supplied strings reach templates only through `displayText` (in code or through the pipe) and interpolation.

## Verification

`npm run verify -- -p @ptah-extension/machines-ui` exited 0. Lint and typecheck: 2 tasks succeeded. Test: 1 task succeeded, **12 suites, 143 tests passed**.

The first run failed with 5 spec bugs (void outputs were pushed with no argument, and a timer-count assertion was brittle) and 3 lint errors. The fixes are listed below, and the second run passed.

The lint errors came from the file-writing tool, which turned the `\u202E`-style escapes into literal bidi characters, including inside the sanitiser's regex. Every file was converted back to `\uXXXX` escapes, and a grep confirms no literal bidi characters remain in `libs/frontend/machines-ui/src`. The coordinator should check for this in other lanes' files.

No screenshots: the visual review in Electron is after Batch 26.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| `WORKER_REMOTE_COMMAND`, `PAIRING_CODE_LENGTH`, `PAIRING_TTL_DEFAULT_SEC` and `normalizePairingCode` are imported from `@ptah-extension/worker-protocol` | restate them in the renderer; import them | worker-protocol is `scope:shared, type:util`, which `scope:webview`/`type:feature` may depend on (`eslint.config.mjs`). Lint passes. The lib has no Node imports (only zod and `@ptah-extension/shared`). | Yes |
| The "no worker mode" copy is restated in `noWorkerModeCopy()`, with a spec pinning the exact wording | import it; restate it | It lives in `libs/backend/remote-machines/src/lib/ssh-worker-commands.ts:142`, which a webview lib may not import. Main's own message is shown when it arrives, and the restated copy is only the fallback when the machine reports no remote version. | Yes (moving the string to `libs/shared` would remove the duplicate; out of scope) |
| No attempts count in the manual-code banner. Over SSH, main's message is shown as is, so it carries a count if main supplies one | invent a count; leave it out | The renderer contract has no `attemptsLeft` field: `MachineResult` and `RpcUserErrorCode` in `rpc-machines.types.ts`, and `machines-service.ts` `pairViaSsh` returns none. Plan W3 forbids the count on the unauthenticated path. | Yes |
| Fixes are shown as a copyable command | split into a command and a sentence | `MachineReadinessCheck` has one `fix` string. | Yes |
| Caps: names 80, versions 24, detail, fix and error text 200 | one cap everywhere | 80 would cut real fix commands and SSH errors. The helper takes `max`. | Yes |
| `copy-command` atom added in its own directory | inline twice; new directory | Two users (the pairing panel and readiness rows). It is a lib-local component, not a shared primitive or token. | Yes |
| The list footer says "This machine stays in Chat." | show the local host name | The renderer has no local host name source in this lib. | Yes |
| Version-mismatch copy says which side to update: this app when the remote side's min protocol is above the local max, otherwise the machine | always name the machine | Design 4.5 says "states both versions"; either side can be older. No update command is offered because the source verifies none. | Yes |
| A one-second clock runs only for the selected machine while it is offline or reconnecting, and is cleared on change and on destroy | a ticker per row; absolute times | Design 4.5 "Lost contact 12 s ago… Next attempt in 5 s". Runtime rule: no timer per list item. | Yes |
| Re-pair reuses `AddMachinePaneComponent` with `[machine]` (alias read-only, `pair`/`pairViaSsh` on that machineId, no `add`) | a separate rebind component | The task asks for "the existing pair flow". The backend `pairLocked` accepts an unpaired machine. | Yes |

## Not done (out of scope or for later batches)

- Remote session list, "New session" and the session view belong to Batch 25. `machines-view` renders no session area yet, and the header has no primary "New session".
- Shell tab, routes, the welcome "Machines (N connected)" button and the approval badge belong to Batch 26.
- "Too many attempts" has no distinct error code (`machines-service.ts` uses `MACHINE_PAIRING_REJECTED` for every pair failure). It shows as the generic rejected banner.
- `MACHINE_PAIRING_REJECTED` also covers main's own refusals ("Pairing already in progress", "Disconnect before pairing again", "Pairing returned a different worker"). Over the manual-code path these show the fixed "code was not accepted" copy. A distinct code from main would let the UI tell them apart. This is a backend follow-up.
- The version-mismatch "Copy update command" from the prototype is not offered, because the source defines no update command.
- The contrast and the `--edge-ui` input border are not measured. That is left to the Batch 26 visual review.
