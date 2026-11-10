# Fix round 5

- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:540`: Committed receipt polling now counts consecutive missing or failed lookups. Three settle through the existing uncertain retry outcome, preserving the client message ID, restoring the composer text once, showing "it could not be confirmed", and logging through the injected logger. Any returned receipt resets the count.
- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.ts:550`: The first committed receipt starts a tracked 10-minute deadline timer. Later committed pending receipts do not extend it. `cancelReceiptCheck` clears both timers on settlement, tab close or reset, and destruction.
- `libs/frontend/chat/src/lib/services/chat-store/follow-up-queue.service.spec.ts:395`: Added fake-timer tests: `restores a committed admission after three missing receipts and reuses its client id`, `restores a committed admission after ten minutes of pending receipts`, and `delivers once after a missing committed receipt without restoring text`.

Checks: `npx ngc --noEmit --project libs/frontend/chat/tsconfig.lib.json` passed (three existing NG8107 warnings in other files). `git diff --check` passed. Jest was not run, as requested.

Skill discovery: `angular-frontend-patterns` was unavailable through the connected skill search; repository guidance was applied.
