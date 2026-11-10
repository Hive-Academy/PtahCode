Reviewed head: 8aaff46fb004c480d6bd5b5ac83a8965a08da42d
Verdict: CHANGES_REQUIRED

## Findings

### Major — A text reply can masquerade as a triage action

`libs/backend/rpc-handlers/src/lib/handlers/review-finding-response.ts:39-43,100-111`: `recordedTriage` treats any bot reply that starts with a triage marker as an Accept or Dismiss record. For `action: 'reply'`, the host posts the operator's `safeText` output directly. `safeText` in `libs/backend/review-core/src/lib/publication/publication-text.ts:15-18` escapes finding markers but leaves triage markers intact. An operator can send a normal reply beginning `<!-- ptah-review-triage:accepted -->`; a later Accept or Dismiss then returns `ok: true, triage: 'accepted'` without posting the requested action. This also permits a pasted, untrusted prompt to set the displayed triage state. Escape or reject both reserved triage markers in free-form replies before posting, and add a regression test that replies with each marker then attempts a triage action.

## Examined

- Full `git diff --stat 7f699a490...8aaff46fb004c480d6bd5b5ac83a8965a08da42d`, the `3f4774bc3` fix round, its review-fixes note, and merge resolution via `git show 8aaff46fb --cc`.
- Head-by-SHA contracts, finding responder and RPC registration, GitHub thread reader and publication adapter, query repository, redaction, file-opening path checks, Electron checkout resolution, Angular findings store/cards/panel and run detail, plus relevant specs.
- Merge retained the Inbox detail layout and findings panel; `findingRows` is absent. The five documented fix-round findings have corresponding regression specs. No tests were run because the working tree is concurrently in use.
