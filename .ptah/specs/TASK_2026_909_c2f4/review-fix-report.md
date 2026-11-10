## Changes
- 1: session-organization-cache.store.ts:124 uses release; unavailable-git-roots.store.ts:57 retains strikes until a successful read calls clear.
- 2: unavailable-git-roots.store.ts:38 counts an entry as live only before its deadline.
- B: unavailable-git-roots.store.ts:6,44 caps strike keys at 200 and evicts the oldest.
- 3: change-set.store.ts:295,666,727 tracks freshness without changing snapshot identity.
- 4: change-set.store.ts:195 compares untracked directories by membership.
- 5: renderer-frame-monitor.service.ts:28 removes query and fragment, then selects the last slash or backslash segment.

## Tests added
- unavailable-git-roots.store.spec.ts: release escalation, expired entry before timer, and oldest strike eviction.
- session-organization-cache.store.spec.ts: organization notice retains strike and permits retry.
- change-set.store.spec.ts: equal push refreshes freshness and reordered directories keep marks identity.
- renderer-frame-monitor.service.spec.ts: backslash source URL logs only the file name.

## Decisions
- Kept clear for confirmed successful Git reads; release removes only the exclusion entry. Reversible.
- Used a non-signal freshness map so equal status leaves marks identity untouched. Reversible.

## Not done
- Tests were not run by this lane; coordinator owns verification.
- Scoped Ptah diagnostics timed out after 45 seconds; changed files remain unchecked by that tool.
