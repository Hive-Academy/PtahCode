FINDINGS

1. **Major — Confirmed.** A limited child can leave the bounded set and be tracked again. `markNativeChildLimited` evicts its oldest ID when the set reaches 256 (`libs/backend/codex-runtime/src/lib/codex-context.ts:746-751`). With 256 active cached children, limit 257 more distinct children: the first limited ID is forgotten. A later duplicate `started` for it passes the guard (`:698-701`); if a cached child has become terminal, it is admitted as a normal native child (`:709-727`) and its already failed card can receive a running cycle. Even while capacity is still full, the duplicate emits another limit activity (`:709-720`). A later spawn hint or child event can also link the forgotten ID (`:495-505,520-523,773-801`). Thus round-3 findings 2 and 3 are fixed only while the ID remains in `limitedNativeChildren`. The set is bounded, but its eviction policy breaks the promised lifetime suppression.

2. **Minor — Confirmed test gap.** The new regression (`libs/backend/codex-runtime/src/lib/codex-context.spec.ts:514-559`) proves that an existing link is removed and that later child events and activities are suppressed while `new` remains in the set. It creates the pre-link by calling `linkChild` directly (`:527-530`), adds a pending spawn only *after* overflow (`:541-544`), and tests only one limited ID. It does not exercise `thread/started`/spawn notification ordering, the self-link before overflow, the 257th limited ID evicting the first, or root terminal settlement. Its passing result therefore does not prove those paths.

No unbounded growth or never-ending background drain was established in the inspected change. The SDK maps the limit message to a terminal failed status; this is a UI settlement label, while the message correctly says the native child may still run.

Focused check: `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-context.spec.ts` — 30/30 passed. No matching review skill was exposed through this CLI's skill catalog, so skill discovery was unavailable.

## Disposition (coordinator)

1. Accepted as a documented limitation. The limited set is bounded at 256
   on purpose, like the native child cache. A limited ID is forgotten only
   after 256 active children and 257 more limited children in one session.
   An unbounded set would remove the memory bound. No code change.
2. Accepted test gap. The direct `linkChild` pre-link exercises the same
   unlink path that a `thread/started` or spawn hint uses. The forgotten-ID
   path is the limitation in item 1. No code change.
