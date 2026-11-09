# Machines page — capability inventory

Scope: `libs/frontend/machines-ui`, the `machines:*` RPC contract, the Electron-side handler, and the page's mount points. All paths are repo-relative; `file:line` cites the worktree copy.

## 1. Entry point and navigation

- Route `machines`: `apps/ptah-extension-webview/src/app/app.routes.ts:194-203` — `canMatch: [electronOnlySurface]`, `SURFACE_ACTIVE` for `'machines'`, lazy `loadComponent` → `MachinesViewComponent` from `@ptah-extension/machines-ui` (comment at `app.routes.ts:75-77`).
- Electron-only guard: `apps/ptah-extension-webview/src/app/electron-only-surface.guard.ts:19-20` refuses the match on non-Electron hosts before the chunk loads; `**` then falls back to chat (`app.routes.ts:207-208`).
- Surface id `'machines'` is part of the shared id list: `libs/shared/src/lib/types/webview-surface.types.ts:66,87`.
- Titlebar tab (Electron shell): `libs/frontend/chat/src/lib/components/templates/electron-shell.component.ts:301-322` — `role="tab"` button `data-testid="machines-tab"`, Server icon, label "Machines", pending-approval badge (`badge-warning badge-xs`, `aria-hidden`). Click → `openMachines()` → `appState.setCurrentView('machines')` (`electron-shell.component.ts:744-746`).
- Tab accessible label carries the pending count: "Machines" / "Machines, N approval(s) waiting" (`electron-shell.component.ts:713-717`); count from `MachinesStore.pendingApprovalCount` (`electron-shell.component.ts:59,710-712`).
- Welcome screen (no workspace folder): button `data-testid="welcome-open-machines"` → `openMachines()` (`libs/frontend/chat/src/lib/components/templates/electron-welcome.component.ts:127-139,351-353`); its label is "Machines" or "Machines (N connected)" from `MachinesStore.connectedCount` (`electron-welcome.component.ts:328-334`).
- "Back to welcome" button appears when no folder is open and the current view is `machines` (`electron-shell.component.ts:399-417`).
- Mount: with workspace folders the App Shell's outlet renders the routed component (`libs/frontend/chat/src/lib/components/templates/app-shell.component.html:84-86`, hidden unless `isStandaloneView()`); without folders the Electron shell renders `<router-outlet />` directly (`electron-shell.component.ts:489-493`).
- `MachinesFeed` is registered as a root message handler on every host (`apps/ptah-extension-webview/src/app/app.config.ts:366-368`); only Electron main ever sends the pushes (comment `app.config.ts:366-367`).
- Capability gating is backend-side only: the `host.remoteMachines` manifest entry owns all `machines:*` methods and `requires: ['remoteMachines']` (`libs/backend/rpc-handlers/src/lib/host-profile/manifest.ts:589-597`); VS Code and CLI leave the capability off (comment `manifest.ts:590-593`, `libs/backend/cli-engine/src/lib/rpc/expected-absent.ts:39`). The UI has no license/permission gate of its own.

## 2. Component tree

All components are standalone, `OnPush`, defined inline in `libs/frontend/machines-ui/src/lib`.

- **MachinesViewComponent** (`components/machines-view/machines-view.component.ts:64-476`), selector `ptah-machines-view`. Root layout: left `<ptah-machine-list>` (fixed 300px ≥760px) + right `<section aria-label="Machine details">` (`:81-99`). Right pane modes `MachinesPaneMode` = `detail|add|repair|readiness|session` (`:40-45`). Signals: `paneMode`, `selectedId`, `confirmingRemove`, `busy`, `actionError`, `now`, `openSession` (`:331-342`); computed `selected` (falls back to first machine, `:351-355`) and `banners` (`:357-361`). Loads machines on init (`:377-379`); runs a 1s clock only while the selected machine is `offline`/`reconnecting` (`:48,364-375,467-475`). Machine name = displayName || alias (`:381-383`).
  - **MachinesIntroComponent** (`machines-intro.component.ts:19-72`) — empty state: "Control Ptah on your other machines", explanation of SSH reach, Add machine button, `<details>` "What is checked?" with 7 worker checks (`:5-13,49-63`).
- **MachineListComponent** (`components/machine-list/machine-list.component.ts:37-248`) — inputs `machines, selectedId, loading, error, now` (`:162-167`); outputs `selected, add, retryLoad` (`:169-171`). Header "Machines" + "Add machine" button (`:44-59`); `<ul>` of rows with name, mono alias, status marker, meta line (`:105-150`); roving-tabindex keyboard nav Up/Down/Home/End, Enter/click select, `aria-current` on selection (`:113-125,200-223`). Footer "This machine stays in Chat." (`:154-158`).
- **MachineStatusComponent** (`components/machine-status/machine-status.component.ts:26-97`) — input `state`, optional `label` override (`:89-91`); per-state SVG marker + ink + label (`:10-16,38-84`): connected=filled circle, offline=hollow circle, reconnecting=spinning open ring, version-mismatch=filled triangle, unpaired=dashed circle.
- **AddMachinePaneComponent** (`components/add-machine-pane/add-machine-pane.component.ts:59-559`) — input `machine` (set ⇒ re-pair), outputs `paired`, `cancelled` (`:250-253`). SSH alias input + `datalist` suggestions from `machines:sshAliases` (`:102-139,502-506`); 8-cell pairing-code input with paste/autofill/arrow/backspace handling (`:156-204,322-365,508-542`); "Pair automatically via SSH" button (`:205-222`); Pair and connect / Cancel (`:225-241`); Escape cancels (`:72`). `PAIRING_CODE_LENGTH` = 8, TTL 300s → "expires in 5 minutes" (`libs/worker-protocol/src/lib/pairing-code.ts:18,24`; `add-machine-pane.component.ts:45,255-257`).
- **ReadinessPanelComponent** (`components/readiness-panel/readiness-panel.component.ts:67-334`) — input `machine` (`:193`). Local signals `loading/error/result/reportCopied` (`:196-199`); runs `machines:readiness` on machine change and on "Check again" (`:260-273,299-316`); summary banner + ordered check rows with ✓/✗/! marks and per-row "Copy fix" (`:110-159`); "Check again" / "Copy report" buttons (`:161-180`).
- **CopyCommandComponent** (`components/copy-command/copy-command.component.ts:18-72`) — mono command box + Copy button with 2s "Copied" feedback.
- **RemoteSessionListComponent** (`components/remote-session-list/remote-session-list.component.ts:39-419`) — input `machine`, output `opened` (`:262-263`); local signals `loading/error/composing/workspaceId/prompt/starting/startError` (`:265-271`); reloads workspaces + all session lists on connect and on Reload (`:298-307,390-418`); "New session" form (workspace select, first message, Start/Cancel) (`:90-156`); rows grouped under workspace paths with state label, title, `Driver:` badge, provider, Open button (`:195-250`).
- **RemoteSessionViewComponent** (`components/remote-session-view/remote-session-view.component.ts:69-547`) — inputs `machineId, sessionId, title, workspacePath` (`:306-311`). Header: title, "on <machine> · <path>", owner chip ("Not available" / "Driver: <holder>" / "Idle"), sync chip, Refresh (watch-only only), Stop (`:97-177`); sr-only polite live region for announcements (`:88-95`); watch-only/stale/reconnect/error/link-notice/snapshot banners (`:180-276`); hosts the pane + composer. Attaches on open, detaches on leave (`:427-437`). Provides `FILE_LINK_OPENER`: remote paths are never opened locally, a notice names the machine instead (`:79-81,484-501`); window focus re-checks a watch-only session (`:83-86,503-506`).
- **RemoteSessionPaneComponent** (`components/remote-session-view/remote-session-pane.component.ts:48-258`) — inputs `view, transcript, machineName, sessionTitle, connected, streaming, savedAt`, output `linkActivated` (`:113-131`); opening/empty lines, "Saved up to <time>" divider, approval blocks with per-request answer state and session-switch tokens (`:61-107,133-167,215-257`).
- **RemoteTranscriptComponent** (`components/remote-session-view/remote-transcript.component.ts:52-150+`) — renders user bubbles and assistant messages labelled "Claude on <machine>" with shared pieces from `@ptah-extension/chat-ui` (ThinkingBlock, ToolCallHeader, ToolInputDisplay, ToolOutputDisplay) and `ptah-markdown-block` (`:9-15,55-62,86-150`); streaming caret (`:98-105`); all links inert, click intercepted and reported as `linkActivated` (`:64-67`).
- **RemoteApprovalBlockComponent** (`components/remote-approval-block/remote-approval-block.component.ts:51-336`) — inputs `request, machineName, sessionTitle, mode, timedOut, busy, unavailableReason, error`, output `answered` (`:193-208`); modes `answerable|watch-only|cached` (`:26-30`); badge/title/detail grid (Machine, Session, Tool, Arguments, "If unanswered"), scrollable `<pre>` for arguments + Copy arguments, Allow once / Deny (`:82-177`); countdown to the worker deadline on the shared clock (`:288-292,311-317`).
- **RemoteComposerComponent** (`components/remote-composer/remote-composer.component.ts:31-193`) — inputs `machineId, sessionId, view, machineName, connected`, two-way `error` model (`:82-90`); textarea + Send (Enter sends, Shift+Enter newline) (`:42-65,159-165`); disabled reason line and last send/stop error (`:66-75,117-130`).
- **ReconnectBannerComponent** (`components/reconnect-banner/reconnect-banner.component.ts:16-61`) — "Reconnected" + replay numbers + Close.
- **SessionSyncChipComponent** (`components/reconnect-banner/session-sync-chip.component.ts:14-38`) — badge: "Caught up" / "Catching up..." / "Fetching missing events".

## 3. Data model (as shown in the UI)

Contract: `libs/shared/src/lib/types/rpc/rpc-machines.types.ts` (merged into `RpcMethodRegistry` via `extends`, `libs/shared/src/lib/types/rpc.types.ts:71-73,1056-1065`).

- `MachineConnectionState` = `connected | offline | reconnecting | version-mismatch | unpaired` (`rpc-machines.types.ts:91-99`). Visible labels: Connected, Offline, Reconnecting, Version mismatch, Not paired (`libs/frontend/machines-ui/src/lib/utils/machine-copy.ts:15-23`).
- `MachineStateReason` = `worker-identity-changed | re-pair-required | session-reattach-failed` (`rpc-machines.types.ts:518-523`); renderer copy per reason (`machine-copy.ts:29-35`); first two ⇒ repair banner, third ⇒ retry banner (`utils/machine-banners.ts:28-37,38-42`).
- `MachineSummary`: `machineId`, `alias` (SSH `Host` alias), `displayName` (falls back to alias in main, `libs/backend/remote-machines/src/lib/machines-service.ts:126-139`), `state`, `nextRetryAt?` (epoch ms), `versions?`, `lastSeenAt?` (epoch ms) (`rpc-machines.types.ts:121-133`).
- `MachineVersions` / `MachineVersionInfo`: `{ ptahVersion, protocol: { min, max } }`, `local` + optional `remote` (`rpc-machines.types.ts:102-118`); shown as "ptah <v> · protocol <max>" and in mismatch copy (`machines-view.component.ts:190-193`; `machine-copy.ts:58-79`).
- `MachineSessionDriver`: `{ kind: 'desktop'|'worker'|'cli', label }` (`rpc-machines.types.ts:136-139`); label suffixes "(not responding)" / "(release pending)" pick the banner variant (`utils/remote-session-copy.ts:76-89`).
- `RemoteMachineSessionState` = `running | idle | interrupted` (`rpc-machines.types.ts:141-148`); shown as Running/Idle/Interrupted, or "Unknown" while the machine is not connected (`remote-session-copy.ts:58-71`).
- `RemoteMachineSessionSummary`: `sessionId, title, state, driver?, updatedAt (epoch ms), provider, logged` (`rpc-machines.types.ts:151-161`).
- `RemoteMachineWorkspace`: `workspaceId, name, path` (`rpc-machines.types.ts:164-168`).
- `MachineReadinessCheck`: `id, label, status: 'pass'|'warn'|'fail', detail?, fix?`; `MachineReadinessReport`: `ready, checks[]` (`rpc-machines.types.ts:171-183`). Remote report comes from the worker's `machine.info` (`machines-service.ts:406-416`); local report is main's driver-lock self-test (`machines-service.ts:447-489`).
- `MachinesSessionAttachResult` = `{ mode:'log', epoch, fromSeq, headSeq }` | `{ mode:'snapshot', events: FlatStreamEventUnion[], live:false, drivenBy? }` (`rpc-machines.types.ts:365-378`).
- View-only types in the store: `RemoteMachine` = `MachineSummary` + `reason?` (`services/machines-store.ts:32-35`); `RemoteSessionView` adds `machineId, machineState, stale, watchOnly, lockUnavailable, catchingUp, error` over reducer state (`machines-store.ts:50-70`); reducer `SessionEventState`: `mode: 'attaching'|'log'|'snapshot'|'detached'`, `epoch, last, target, held[], events, turnId, pendingPermissions[], timedOutPermissions[], drivenBy, recovery: 'none'|'requested'|'streaming'` (`services/session-event-reducer.ts:58-93`).
- Errors: `MachinesError { message, code?: RpcUserErrorCode }` (`machines-store.ts:38-41`); refusals `watch-only | not-connected | not-open` (`machines-store.ts:73`). Codes surfaced in copy: `MACHINE_PAIRING_REJECTED`, `MACHINE_UNREACHABLE`, `MACHINE_VERSION_MISMATCH` (`add-machine-pane.component.ts:459-499`); `SESSION_DRIVER_LOCK_UNAVAILABLE` (`machines-store.ts:87-89,543-556`); `SESSION_DRIVEN_ELSEWHERE` (`machines-store.ts:565-569`); `MACHINE_NOT_FOUND_OR_FORBIDDEN` (`remote-approval-block.component.ts:237-239`).
- Worker strings are sanitized before display: `displayText` (cap 80 by default), `displayBlockText`, `displayBlockValue` (`utils/display-text.ts:30-104`); remote markdown is made inert (`utils/remote-markdown.ts:24-42`).

## 4. Service/store state, signals, polling, subscriptions

- **MachinesApi** (`services/machines-api.ts:28-139`) — stateless typed wrapper over `ClaudeRpcService`; one method per RPC, no retries; `errorCode` passes through (`:21-27`).
- **MachinesFeed** (`services/machines-feed.ts:36-75`) — handles `MESSAGE_TYPES.MACHINES_EVENT` (`'machines:event'`) and `MACHINES_STATE` (`'machines:state'`) (`libs/shared/src/lib/types/messages/message-constants.ts:405,410`); listener sets, not signals, so a burst reaches the reducer one by one (`:24-35`); malformed pushes are dropped by `parseMachinesEvent`/`parseMachinesState` (`:95-113,148-172`).
- **MachinesStore** (`services/machines-store.ts:120-644`, root singleton) — signals `_machines, _loading, _error, _workspaces, _sessions, _views` (`:125-139`); computed `connectedCount` (`:149-151`), `pendingApprovalsByMachine`, `pendingApprovalCount` (`:154-169`), per-machine `machine()/workspaces()/sessionsByWorkspace()/sessionView()` (`:181-218`). `loadMachines` preserves a previous `reason` (`:233-239`). `onState` ignores pushes for unknown machines, merges fields, and on reconnect re-attaches detached views once and dispatches `connected` (`:453-496`). `dispatch` runs the reducer and sends `machines:session.replay` with `afterSeq` on gaps (`:505-537`); request tokens drop stale attach/replay answers (`:140-142,344-347`); `SESSION_DRIVEN_ELSEWHERE` on send/stop triggers a re-attach (`:558-576`). Watch-only (`snapshot` attach or lock-unavailable) refuses send/stop/answers locally (`:578-589,598-615`).
- **Timers**: the view's 1s clock runs only while the selected machine is `offline`/`reconnecting` (`machines-view.component.ts:48,367-375`); `CountdownClock` is one shared 1s interval for all approval countdowns (`services/countdown-clock.ts:15-49`).
- **No polling anywhere**: loads happen on init (`machines-view.component.ts:377-379`), on connect/reload (`remote-session-list.component.ts:298-307`), on readiness mount/Check again (`readiness-panel.component.ts:260-273`), on session open/Refresh (`remote-session-view.component.ts:427-437,503-511`) and on window focus for watch-only sessions (`remote-session-view.component.ts:503-506`). Live data arrives as `machines:event` pushes.

## 5. RPC methods and push events

Names: `MACHINES_RPC_METHOD_NAMES` (`rpc-machines.types.ts:53-71`). Params are strict zod schemas (`:196-252`); Electron handler validates and dispatches to `MachinesService` (`libs/backend/remote-machines/src/lib/machines-rpc.handlers.ts:75-181`); errors are mapped to fixed user codes/messages (`machines-rpc.handlers.ts:16-67`). `machines:workspaces|sessions|session.start|continue|stop|permission.respond` proxy worker methods (`machines-rpc.handlers.ts:125-180`).

| Method | Params → Result (shape) |
|---|---|
| `machines:list` | `{}` → `{ machines: MachineSummary[] }` (`rpc-machines.types.ts:321-323`) |
| `machines:sshAliases` | `{}` → `{ aliases: string[] }` (`:325-328`) |
| `machines:add` | `{ alias }` → `{ machine: MachineSummary }` (`:199-201,330-333`) |
| `machines:pair` | `{ machineId, code }` → `{ machine }` (`:203-207`) |
| `machines:pairViaSsh` | `{ machineId }` → `{ machine }` (`:209`) |
| `machines:remove` | `{ machineId }` → `{ removed: true, revokedOnWorker: boolean }` (`:335-339`) |
| `machines:retry` | `{ machineId }` → `{ machine }` (`:211`) |
| `machines:readiness` | `{ machineId }` → `{ machineId, remote: MachineReadinessReport|null, local: MachineReadinessReport }` (`:341-347`) |
| `machines:workspaces` | `{ machineId }` → `{ workspaces: RemoteMachineWorkspace[] }` (`:349-351`) |
| `machines:sessions` | `{ machineId, workspaceId }` → `{ sessions: RemoteMachineSessionSummary[] }` (`:353-355`) |
| `machines:session.attach` | `{ machineId, sessionId }` → `MachinesSessionAttachResult` (`:365-378`) |
| `machines:session.detach` | `{ machineId, sessionId }` → `{ detached: true }` (`:380-382`) |
| `machines:session.replay` | `{ machineId, sessionId, afterSeq }` → attach result (`:223-228,444-448`) |
| `machines:session.start` | `{ machineId, workspaceId, prompt, name? }` → `{ sessionId, turnId }` (`:230-235,384-387`) |
| `machines:session.continue` | `{ machineId, sessionId, prompt }` → `{ turnId, queued? }` (`:237-241,389-393`) |
| `machines:session.stop` | `{ machineId, sessionId }` → `{ stopped: boolean }` (`:243,395-397`) |
| `machines:permission.respond` | `{ machineId, sessionId, requestId, decision: 'allow'|'deny', reason? }` → `{ applied: true }` (`:245-252,399-401`) |

Push events consumed: `machines:event` = `{ machineId, sessionId, epoch, seq, type, payload }` (one logged session event, worker type, validated per type by the reducer; `rpc-machines.types.ts:490-503`); `machines:state` = `{ machineId, state, nextRetryAt?, versions?, lastSeenAt?, reason? }` (`:525-534`).

## 6. User actions available today

- Add machine: list header (`machine-list.component.ts:48-58`) and intro/empty state (`machines-intro.component.ts:36-48`).
- Select machine: click or Enter; Up/Down/Home/End move focus in the list (`machine-list.component.ts:200-223`).
- Retry the machine list load: "Try again" (`machine-list.component.ts:87-94`).
- Add/pair: type SSH alias (with suggestions), enter 8-character code, "Pair and connect"; or "Pair automatically via SSH"; Cancel / Escape (`add-machine-pane.component.ts:205-241`).
- Re-pair from a banner: "Re-pair"/"Pair" button opens the repair pane (`machines-view.component.ts:288-297`).
- "Retry now" from offline/reconnecting/mismatch banners (`machines-view.component.ts:299-308`).
- "Readiness check" from the detail header (`machines-view.component.ts:197-204`); "Check again"; "Copy report" (`readiness-panel.component.ts:161-180`).
- Remove machine: header button → inline confirm ("Remove <name>?", Cancel focused) → confirm/remove (`machines-view.component.ts:205-258,425-438`); Escape closes the confirm.
- Copy: pairing command (`add-machine-pane.component.ts:152-155`), readiness fix per row (`readiness-panel.component.ts:149-154`), readiness report, tool-approval arguments (`remote-approval-block.component.ts:101-115`).
- Sessions: "Reload" list, "New session" (pick workspace, first message, Start), "Open" a session, Cancel (`remote-session-list.component.ts:58-156`).
- Opened session: send a prompt (Send / Enter), Stop a running turn, Refresh (watch-only only), Allow once / Deny a permission request, dismiss banners (Reconnected close, Available close), Back to machine (`remote-session-view.component.ts:141-176,196-204`; `remote-composer.component.ts:42-65`; `remote-approval-block.component.ts:156-177`).
- No search, filter, sort or rename action exists anywhere on the page.

## 7. States handled today (with copy)

- **Loading**: list "Loading machines…" with spinner (`machine-list.component.ts:62-74`); readiness "Checking <name>…" (`readiness-panel.component.ts:86-97`); sessions "Loading sessions…" (`remote-session-list.component.ts:158-166`); transcript "Opening session…" (`remote-session-pane.component.ts:61-71`).
- **Error**: list "Machines could not be loaded" + message + Try again (`machine-list.component.ts:75-95`); action errors "Remove failed"/"Retry failed" + sentence (`machines-view.component.ts:260-271,432-465`); pairing failures per code — "Pairing failed" (wrong/expired/used, "Nothing was stored"), "Cannot reach host", "Version mismatch", "Already connected" (`add-machine-pane.component.ts:427-499`); readiness "Check failed … Check again when <name> is reachable." (`readiness-panel.component.ts:98-109`); session list error + Try again (`remote-session-list.component.ts:167-182`); send/stop/approval error lines (`remote-composer.component.ts:71-75`; `remote-approval-block.component.ts:147-155`); "Cannot check who has this session" (DRIVER_LOCK_UNAVAILABLE) and driven-elsewhere banners (`remote-session-copy.ts:114-198`).
- **Empty**: "No machines yet." (`machine-list.component.ts:96-103`); intro shown only when nothing is selected and the list is empty (`machines-view.component.ts:318-320`); "<name> has no registered workspaces." / "Sessions show once <name> is connected." / "No sessions yet." (`remote-session-list.component.ts:183-204`); transcript "No messages yet." / "Nothing was saved in this session yet." / "The session could not be opened." / lock-unavailable variant (`remote-session-pane.component.ts:179-188`).
- **Offline / partial (stale, never "failed")**: offline/reconnecting banner "Lost contact <dur> ago. Sessions on <name> keep running; they are shown as unknown, not failed. Next attempt in <dur>." (`machine-banners.ts:51-68`); stale session notice "… is not connected. This is the last known state; the session keeps running there." (`remote-session-view.component.ts:231-240`); session states read "Unknown" while disconnected (`remote-session-copy.ts:58-63`); composer disabled with reason (`remote-composer.component.ts:117-130`); version-mismatch banner names both builds and which to update (`machine-copy.ts:58-73`); unpaired banner "… has no pairing token on this machine. Pair it to connect." (`machine-banners.ts:40-49`).
- **Watch-only / driven**: snapshot label "Showing the last saved state", "Saved up to <time>. Newer activity is not shown.", driver badge, driven-elsewhere banner with release command for stuck holders, "Available" freed banner (`remote-session-view.component.ts:124-141,196-204,269-276`; `remote-session-copy.ts:114-198`).
- **Sync**: chip "Caught up"/"Catching up..."/"Fetching missing events" (`session-sync.ts:13-30`); "Reconnected" replay banner after a reconnect (`reconnect-banner.component.ts:51-60`).
- **Timed-out approvals**: "No answer within 60 s — the worker denied this request." (`remote-session-copy.ts:21-30`); "The session continues without this tool." (`remote-approval-block.component.ts:302-308`).
- **Gating**: Electron-only route; `remoteMachines` capability gates the handler manifest (see §1). No other license/permission gate in the UI.

## 8. Layout, styling, and UX problems

- Layout: two columns ≥760px — list `min-[760px]:w-[300px]`, stacked below with list `max-h-[45%]` (`machines-view.component.ts:81-95`); detail `p-5` column; session header `px-5 py-3`, body `overflow-y-auto px-5 py-4`, composer pinned bottom (`remote-session-view.component.ts:98,180,292-299`).
- DaisyUI: `btn/-primary/-ghost/-sm/-xs/-square`, `badge/-outline/-sm/-warning/-xs`, `input`, `select`, `textarea` (`-bordered/-sm`), `loading loading-spinner`, `rounded-box`, `sr-only`, `tab` (shell). Tailwind tokens: `text-xs/sm/base`, `font-mono`, `truncate`, `min-w-0`, `border-surface-border`, `text-base-content(-muted)`, state inks `text-state-done/err/need/run/idle`, `focus-visible:outline` pattern, `motion-reduce:animate-none` on all spinners.
- Shared components used: `@ptah-extension/chat-ui` (thinking block, tool call header/input/output), `@ptah-extension/markdown` (MarkdownBlockComponent), `@ptah-extension/chat-execution-tree` (AgentStatsService) (`remote-transcript.component.ts:9-15`; `remote-session-view.component.ts:11`). **No component from `libs/frontend/ui` is used** (grep: no `@ptah-extension/ui` import in machines-ui).
- Accessibility present: roving tabindex list, `aria-current`, labelled alerts (`role=alert/status/alertdialog` with `labelledby/describedby`), aria labels on icon buttons, polite live region in the session view, reduced-motion handling, inert remote links.
- **UX problems (factual)**:
  1. First-load blank pane: while `machines:list` is in flight with no machines, the right pane renders nothing (the intro requires `!loading`, the detail requires a selected machine) (`machines-view.component.ts:167-321`).
  2. "No machines yet." (list) and the intro (pane) duplicate the empty guidance; the intro is the richer of the two (`machine-list.component.ts:96-103`; `machines-intro.component.ts:24-64`).
  3. No list search/filter/sort — a plain scroll list; with several machines there is no way to find one quickly (`machine-list.component.ts:105-150`).
  4. Refresh of a populated list has no visible indicator: the loading row shows only when `rows().length === 0` (`machine-list.component.ts:62`).
  5. `now` ticks only for the selected machine, so "Last seen …" in other rows goes stale while the selection is connected (`machines-view.component.ts:364-375`; `machine-list.component.ts:225-246`).
  6. Destructive "Remove machine" sits next to "Readiness check" in the same ghost style; only the error ink differs, and it is reachable in the header before any confirmation (`machines-view.component.ts:196-214`).
  7. Remove confirm is inline, not modal: Escape works only while focus is inside the banner (`machines-view.component.ts:217-258`).
  8. Dense small type: most meta/hints/status copy is `text-xs` (12px) in muted ink; status labels, aliases, providers, banners' secondary lines all compete at 12px (`machine-list.component.ts:64,98,134`; `remote-session-list.component.ts:198,212,237`).
  9. Nonstandard breakpoints `min-[760px]` / `max-[759px]` used ad hoc; the session row hides the provider below 760px while the machine detail keeps versions, so the same width shows different detail levels (`machines-view.component.ts:82,86`; `remote-session-list.component.ts:237`).
  10. Session rows are not keyboard reachable as a group (no roving pattern like the machine list; only the Open button is a button) (`remote-session-list.component.ts:206-250`).
  11. The machines list footer "This machine stays in Chat." is a static caption that carries no action (`machine-list.component.ts:154-158`).
  12. The approval "Arguments" `<pre>` is `tabindex=0` inside a block that is also `tabindex=0` when read-only — two stops for one card (`remote-approval-block.component.ts:56-100`).

Out of scope for this inventory: Electron main's SSH transport and worker protocol details beyond the shapes above.
