Verdict: **changes needed**

## Findings

- **High — stale reply survives A → B → A with a cache hit.** `libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts:774-787,863-867`: `switchWorkspace` resets `listAppliedSequence` to 0, but an A read started before leaving A can still be pending. Returning to A through the cache-hit branch starts no new read; that old reply passes the path and query checks, claims its sequence, and replaces the restored A rows/cache. Capture a workspace activation epoch with each read and reject replies from an earlier activation, including when the path matches again. Keep the reset after the unchanged-path early return; resetting on a no-op switch would make ordering worse. Add an A → B → A cache-hit regression with the first A reply held until after return.

- **Medium — the new guard does not order page or local writes.** `libs/frontend/chat/src/lib/services/chat-store/session-loader.service.ts:610-618,665-672,734-753`: `loadMoreSessions` and `upsertSessionSummary` update rows without advancing or checking the full-list sequence. A full-list read that began before either write can still finish afterward and replace those rows (and pagination state); a pending page can likewise append to a freshly replaced list. If the intended guarantee is that the newest list mutation remains visible, give these writes a compatible revision or invalidate in-flight reads/pages, and cover each interleaving. This is a remaining gap in the stated stale-reply protection, not a regression caused by the new comparison.

## Checks

- The new spec at `session-loader.service.spec.ts:4241-4286` does fail without `claimListReply`: the held empty switch reply would overwrite the child row after the second read. The gate fixes reply order; the final zero-delay timer allows the released async continuation to finish. Awaiting an explicit completion signal would make that assertion more direct.
- A query change already invalidates prior replies through `listQueryGeneration`; failed RPC results never claim the sequence. A successful newer full-list reply is therefore not wrongly dropped in those cases. The unchanged-path early return is correctly before the reset.
- Sequence names and comments match the local conventions. The comment at line 775 should describe a workspace **activation** if an epoch is added, since path identity alone does not prevent the revisit race.
- Reviewed the committed service and spec with `git show a9d91216d` and `git show a9d91216d:<path>`. No tests or checks were run.
