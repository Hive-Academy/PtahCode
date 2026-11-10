# Code Logic Re-review — TASK_2026_902 (fix round)

Verdict: REVISE

Defects 1, 2, 4 and 5 are closed in structure, but fix 1 introduces a new Serious defect: the title match runs against escaped text.

1. Serious — `libs/backend/rpc-handlers/src/lib/handlers/review-rpc.handlers.ts:478`
   - Failure: `thread.body.includes(params.title)` compares the raw title with the published body. The renderer writes the title as `safe(finding.title)` (`libs/backend/review-core/src/lib/publication/review-markdown.renderer.ts:34-36`). `escapeText` (`:11-15`) backslash-escapes `\ ` * _ { } ( ) # + . ! | ~ -`, `[ ]`, and rewrites `& < >` as entities. `redact` can also replace parts of the title.
   - Effect: a title such as `Missing null check in save.ts` is published as `Missing null check in save\.ts`, so it never matches. Most real titles contain `.`, `-`, `_`, `(` or `` ` ``. They all return `no-thread` and cannot be accepted, dismissed or replied to. The failure is safe but the feature is broken for most findings. The specs use the plain title `Lost update` (`review-rpc.handlers.spec.ts:122`), so they cannot show it.
   - Fix: compare like with like. Export `escapeText` and `redact` from review-core, or move them to a shared module that rpc-handlers can import. Match on `escapeText(redact(params.title))`. Alternatively compare against a normalised body with `\\(.)` collapsed and entities decoded. Better still, match on the `<!-- ptah-review:finding:ID -->` marker. Add a spec with a title containing `.` and `-`.

2. Moderate — `review-rpc.handlers.ts:478`
   - Failure: substring matching lets a short title match a longer one. Finding A "Lost update" matches a thread for B "Lost update on retry" at the same path and line. If B is the only thread there, A's accept or dismiss is posted to B's thread.
   - Fix: after escaping (item 1), anchor the match on the heading line. Use a regex like `^### .* · <escaped title>$` with the `m` flag, or compare the whole heading text.

3. Moderate — `review-rpc.handlers.ts:480-482`
   - Failure: `resolved` is hard-coded `false` by the adapter (`libs/backend/review-github/src/lib/github-review.adapter.ts:223`). The unresolved filter therefore never narrows anything, and the "prefers the unresolved thread" spec (`review-rpc.handlers.spec.ts:174`) tests a state production cannot produce.
   - Effect: two titled threads at the same path and line always return `ambiguous-thread`. This is safe, but the narrowing is dead code. Say so in a comment, or drop it.

4. Minor — `review-rpc.handlers.ts:466,476`
   - The 5-page cap now fails closed with `ambiguous-thread`, which is correct. The code is misleading, because the failure is a truncated scan, not an ambiguity. The user message is accurate, so this is only a naming nit.

Checked and OK:
- Defect 1, thread selection: it posts only after path, line and title match exactly one thread. Typed codes `no-thread` and `ambiguous-thread` are returned.
- Defect 1, `reply` body: it posts `params.body ?? ''`. Schema min-length for reply bodies was not checked. The store already rejects an empty reply (`review-findings.store.ts:42`), but the RPC itself could post an empty body from another caller. Verify that the schema requires a non-empty body when `action === 'reply'`.
- Defect 1, catch block: it logs a sanitised `Error` and returns `github-error`.
- Defect 4: `respond` returns early when `current.pending` is true, and for accept or dismiss when state is not `open` (`review-findings.store.ts:38-40`). The buttons are disabled for the same states (`review-finding-card.component.ts:38-39`). Duplicate accept or dismiss is closed.
- Defect 4, second reply: it works after a first success. `replied: false` is reset at the start (`:43`), the state stays `open` or `accepted`, and the Reply button is disabled only while pending.
- Defect 5, effects: the effect writes signals, which Angular 22 allows (the `allowSignalWrites` restriction was removed). The effect reads only `triage()`, and the writes cannot loop because they are idempotent.
- Defect 5, draft retention: the draft is kept on failure, because the effect resets it only on `replied` or on a non-`open` state. The spec `review-finding-card.component.spec.ts:45-60` covers this.
- The dismiss form: it closes with the draft cleared when state becomes `dismissed` or `accepted`. It cannot stay open with stale text after a success.
- Stale text is possible only across a different finding: `reason` and `reply` are per component instance, and the parent presumably tracks by `view.key`. This was not verified.
