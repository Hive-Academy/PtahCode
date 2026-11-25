# Live image-only check - TASK_2026_2325_lvrf

Build: head e61bf22aa. `nx build-dev ptah-electron`, `copy-wasm.js`, `nx copy-renderer-dev ptah-electron` ran one at a time under the verify lock (MIN_FREE_GB=4), all exit 0, no OOM (logs `.ptah/tmp/img-build1..3.log`). Electron with CDP 9333, real "Ptah Dev" profile, maximized by ShowWindow (1920x983), DevTools target closed. Log `.ptah/tmp/live-electron-img.log`. Screenshots `screenshots/img-*.png`.

Models: main chat Haiku 4.5; one new Claude lane, policy tier `haiku` (shown Haiku 5.5). No claude-opus in any lane policy or init. One lane started, one stopped lane resumed. No old Opus lane touched.
Spend: session cost $1.22 -> $1.27 (about $0.05; lane turns $0.003 and $0.001).

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Image-only to RUNNING Claude lane | PASS | Pasted red image, no text: Send enabled (`img-03-pasted.png`), clicked. Log: `Message routed ... queue-next-turn pending 1`, then `continue() pushing follow-up turn ... imageCount:2` and `Delivered queued message remaining 0`. Queued card shown while the turn ran (`img-04-sent.png`); after the turn the echo shows the red thumbnails (`img-05-after.png`). Note: the lane replied only about its ack of the message (it did not describe the image), but the image reached it. |
| 2 | Image-only to STOPPED Claude lane | PASS | Stopped lane "claude stopped 44s", placeholder "Resume claude with a message...", Send enabled. Sent: echo shows the red thumbnail; lane reply: "The attached image is a solid red square" (`img-08-stopped-sent.png`). |
| 3 | No text and no image stays disabled | PASS | `lane-send-btn` isEnabled false for empty and for whitespace-only (`img-06-empty-disabled.png`). |
| 4 | Inspector models used | PASS | Popover: "Haiku 4.5 - current" ($0.61), "Fable 5.2 - earlier in this session" ($0.64), "Haiku 5.5 - earlier in this session" ($0.02), SDK subtotal $1.26 (`img-10-full.png`). Tile reads "3, Haiku 4.5 +2 earlier". Sensible (current = the pill model). |
| 5 | Regression glance | PASS | Nothing under the composer (bottom edge 930 of 983, state chip inside the toolbar); one scroller only (single `overflow-y-auto` container); the "Parent <-> lane communication" notice rows (Read by lane / Unverified) readable (`img-05`, `img-08`). |

## Observation (not a FAIL)
On the running lane, one scripted paste event produced 2 thumbnail chips and `imageCount:2` (`img-03-pasted.png`); the same script on the stopped lane produced 1 chip, 1 image. Not root-caused; possibly a double paste handling while a lane runs, or leftover state from a earlier paste attempt in the first failed run. Worth a manual check with a real clipboard paste.

## Process
Theme remained ptah-glass (never changed). Electron PID 12460 tree killed, 0 electron processes. No source edited. `nm_cache_bak/` untouched. Helper scripts only in `.ptah/tmp/` (`launch-img.js`, `imgonly.js`, `max.js`); `launch.js` log name was edited.
