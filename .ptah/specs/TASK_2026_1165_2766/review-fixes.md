# Review fixes

- B1: Exact `chat:abort` assertions now include the caller source. Changed `provider-carry-over.service.spec.ts`, `provider-carry-over.relink.integration.spec.ts`, `message-sender.service.spec.ts`, `session-driver.spec.ts`, and `apps-session.service.spec.ts`.
- B2: The Ptah CLI Stop spec sends `stop-button`. A new case checks that a missing source ends with `internal-abort`. Changed `chat-ptah-cli.service.spec.ts`.
- M1: `command-center` now maps to `user-stop`. Changed `abort-end-cause.ts` and `abort-end-cause.spec.ts`.
- M2: Added checks for the `tab-reset` signal and abort payload, a plain `tab-close` payload, `workspace-remove`, `apps-stop`, and `apps-reset`. Changed `message-sender.service.spec.ts`, `tab-manager.service.spec.ts`, `electron-layout.service.spec.ts`, and `apps-session.service.spec.ts`.
- m2: The abort schema comment now names `source`. Changed `chat-rpc.schema.ts`.

`git diff --check` passed. Scoped TypeScript diagnostics did not finish within 45 seconds, so no type result is available. I did not run tests or Nx, as instructed. The coordinator will run scoped verification. The race, formatting follow-up, and queued follow-up behavior remain outside this lane's scope.

No invocable skill mechanism was available in this CLI lane.
