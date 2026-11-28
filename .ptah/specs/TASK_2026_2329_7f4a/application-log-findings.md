# Application log findings

Evidence comes from the installed Electron app's November 26, 2026 log and main-loop watchdog. Times below are Cairo local time (UTC+02:00).

## Setup wizard and project guidance

- At 20:16:24 the Kimi Code authentication watcher and isolated translation proxy started. At 20:17:16 skill recommendations logged a pre-dispatch error after approximately 10 seconds.
- At 20:17:40 the guidance wizard selected `k3.1-pro`. `SdkQueryRunner.verifyHealth()` threw `SDK not available (status: error)` before opening a model stream. The service generated template fallback guidance, wrote a 991-character trace, and logged completion. Subsequent chat starts loaded that same 991-character guidance.
- At 20:27:36 all four Kimi-backed analysis phases failed with the same SDK health error. This points to a shared pre-dispatch health gate. The logs do not record a separate guidance file installation error.
- The bundled SDK module had loaded at startup. The health flag is set by legacy SDK initialization, which can fail when the workspace's main provider owns auth in a native runtime. The one-shot query checks that shared flag before it can use the wizard's selected route. This is a plausible wiring cause for the mismatch. The historical health error had no message, so the logs alone do not establish which initialization branch failed.

## Live streaming and responsiveness

- At 20:52:24 Antigravity chat startup began. Stream forwarding started about 40 seconds later, with 40.28 seconds recorded in SDK start. An older ACP process exceeded its five-second close bound, and memory search timed out during startup.
- The main-loop watchdog measured an 8.011-second stall while chat start was in flight, then a 16.185-second stall while chat abort and plan-limit lookups were in flight. The renderer separately logged a 6.027-second long frame.
- SQLite also showed a roughly 4-second synchronous `job_runs` insert during an earlier hang, with a 203 MB WAL measurement. The embedder worker later crashed. These are relevant symptoms. The logs identify real event-loop stalls but do not isolate the exact blocking call during the 16-second incident.

## Source excerpts

- `Ptah Electron-2026-11-26.log`, lines 4108–4128, 4177–4194 and 4395–4439.
- `ptah-hang.log`, recoveries at 18:53:04.993Z and 18:53:29.302Z.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts`, `runOneShot` and `verifyHealth`.
- `libs/backend/auth-providers/src/lib/auth/auth-manager.ts`, native runtime handling in `doConfigureAuthentication`.
