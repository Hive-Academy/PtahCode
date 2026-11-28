# CodeRabbit R2 Fix Review

**Verdict: CHANGES**

## Findings

1. **Low — the non-exited refresh failure and approval cancellation lack regression coverage.**
   `libs/backend/agent-sdk/src/lib/provider-session/provider-session-session-controls.ts:249-256`,
   `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.spec.ts:904-960`.
   The new cases cover a `process-exited` refresh failure and a replacement-attach failure. They do not cover a retained process whose refresh fails with another error. Add a case where the first resume rejects without a prompt or release, an open approval settles as `cancel` with reason `superseded`, and a second resume reuses the pooled process and applies the saved level before prompting. This protects the recoverability and cancellation behavior introduced here.

## Verified behavior

- **First open:** `provider-session-chat-adapter.ts:314-320` passes the explicit or prepared level to `acquire`. `attach` reapplies it at `:401-415` before the prompt. The specs cover both values.
- **Fail closed:** refresh records the level before application at `provider-session-session-controls.ts:243-248`. Every application failure stops the current turn before `live.prompt`. A `process-exited` failure clears `session.live`, releases the old process, and forces a replacement attach with the new level.
- **Non-exited recovery:** clearing `session.live` without release is sound. The next attach has `previous === undefined`, so even an unchanged saved level is reapplied to the pooled process at `provider-session-chat-adapter.ts:384-415`.
- **Queue and release:** no deadlock found. Refresh releases before `attach` starts; attach and toggles share the permission queue, and `waitForPermissionChanges` settles queued toggles before the prompt. Host release uses the pool mutex and does not call back into that queue. A failure on the replacement causes a second release for that replacement, not a duplicate release of the exited process.
- **Approvals:** `cancelAll('superseded')` routes cancellation and settles each request as `cancel` through `provider-session-approval-sink.ts:107-125`. The later attach publishes a new context ID.

## Checks

- Focused Jest passed: 1 suite, 61 tests. Node emitted the existing ES module configuration warning.
- Ptah diagnostics reported zero errors for the three changed TypeScript files.
