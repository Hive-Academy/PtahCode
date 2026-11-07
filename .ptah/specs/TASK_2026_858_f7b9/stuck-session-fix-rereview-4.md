# Stuck remote session fix final re-review

**Verdict: APPROVED — 9/10.**

## Blocking findings

None. The queued attach now receives a deadline at arrival; its wait for the preceding refresh and its own history read use that same deadline (`libs/backend/worker-runtime/src/lib/transcript.ts:76-95,174-185,281-290`). An expired queued attach fails before acquiring a lock, while `Promise.allSettled([previous, current])` keeps later refreshes serial (`transcript.ts:182-198`). The new concurrent hung-read spec covers both attaches failing within their own bound and confirms the queued one takes no lock (`libs/backend/worker-runtime/src/lib/transcript.spec.ts:369-397`). This closes the `CALL_TIMEOUT` path identified in re-review 3 for queued hung reads.

## Follow-ups

- **LOW — Test fake fidelity:** The serve-sessions fake still resolves acquire immediately, so it does not model the kernel's shared pending acquire (`libs/backend/worker-host/src/lib/commands/serve-sessions.spec.ts:87-97`; `libs/backend/platform-core/src/session-driver-lock/kernel-session-driver-lock.ts:90-98`). The transcript race spec covers the ownership case; this is not a shipped behavior defect.
- **LOW — Scope of deadline:** Lock acquisition, lock release, and baseline enqueue remain outside the deadline (`libs/backend/worker-runtime/src/lib/transcript.ts:233-275,290-293`). The fix addresses the reported queued hung-history-read case; a wider end-to-end attach deadline can be considered separately.

**Checks:** Read-only diff and source review. The caller reports scoped verify passed for worker-host, worker-runtime, and remote-machines. No tests or builds were run in this review; no source files were edited.
