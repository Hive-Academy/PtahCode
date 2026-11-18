# Batch U03 logic review: bots signal store

Review family: claude (implementer: codex)

Score: 6.5 / 10
Verdict: REVISE

Scope: `bots.store.ts` (360 lines) and `bots.store.spec.ts` (24 tests), read in full. I also read
`bots-client.ts`, `claude-rpc.service.ts` (`RpcResult`), `bots-rpc.handlers.ts`,
`rpc-bots.schemas.ts` and the four discovery RPC types.

The store has a sound base. Signals are private and public views are readonly. There are no
effects, Subjects, `any`, `!` or `as unknown as`. Every request goes through `safe()`, so a
rejected promise becomes an `RpcResult` failure. The remaining defects are in the sequence guards,
the avatar cache and the shared error channel. Tests do not cover them.

## Defects

### D1 (Medium): a guard drops a successful write or delete, and the list stays stale
`bots.store.ts:221`, `:237`, `:146`.
`select`, `newDraft` or `discard` calls `invalidateEditor`, which raises `writeSequence`. When
the write then resolves, the code returns with no action. The server already changed the bot.
The list keeps the old name, enabled flag or revision. After a delete, the deleted bot stays in
`summaries`. A `select` that runs before the write commits can also load an old revision, and the
next save fails with a conflict.
Fix: when the result is stale but `isSuccess()`, still `await this.refresh()` and skip only the
editor updates. Do the same for `delete`.

### D2 (Medium): the avatar cache evicts entries that are still loading, so a long list loops
`bots.store.ts:339-347`, `:327-333`.
The limit is 24 and counts `loading` entries. The list has no upper bound. A page with 25 or more
image avatars evicts the oldest loading entry. That also deletes its sequence token, so the late
response is dropped. The row sees no entry and asks again, which evicts another entry. The loads
never settle.
Fix: evict only `ready` and `error` entries. If all entries are `loading`, allow a temporary
overflow. Add a spec with 30 concurrent `loadAvatar` calls.

### D3 (Medium): an upload that finishes during a save clobbers `saveState` and loses the avatar
`bots.store.ts:311-326`.
The `readonly()` check runs only before the `await`. If `save()` starts while the upload is
pending, the upload completion sets `saveState` to `dirty` (line 325) while a write is in flight.
When the write succeeds, `accept(record)` replaces the draft and the staged avatar disappears
without a message. `_upload` still shows `ready`.
Fix: after the `await`, if `this._saving()` is true, keep the result in `_upload` only and apply
the avatar after the write ends. Alternatively, reject the staging with an actionable error.
Never write `saveState` while saving.

### D4 (Medium): one `_error` signal serves the list and the editor
`bots.store.ts:133`, `:134`, `:248`, `:246`.
A successful `load` sets `_error` to null. It erases a save error or a conflict message that is
still on screen. A `refresh` failure after a successful write sets the generic "request failed"
message, although the write worked. The message also says "Your changes are still here", which is
false after a successful write.
Fix: add a separate `listError` signal. `load` and `refresh` write only to it. Keep `error` for
the editor.

### D5 (Medium): `patchDraft` overwrites `conflict` and `saving` state
`bots.store.ts:169-179`.
The method always sets `saveState` to `dirty`. During a conflict, the state changes from
`conflict` to `dirty` while `conflict()` is still set. The banner and the state then disagree. The
method also runs when `_draft` is null, and when the patch does not change the draft.
Fix: return early when `_draft()` is null. Keep `conflict` as the state when a conflict exists.
Set the state with `this.dirty() ? 'dirty' : 'pristine'`.

### D6 (Low): `select` clears the dirty draft before the request returns
`bots.store.ts:141-150`.
If `bots:get` fails, `selected` and `draft` are both null and the user's edits are gone. The
header comment says the caller confirms discard. A failed request still destroys the draft.
Fix: keep the previous state and replace it only on success. Use a `selecting` signal for the
loading view.

### D7 (Low): `loadLaneChoices` can throw and leave `catalogLoading` true
`bots.store.ts:293`, `:280-308`.
The type is `Record<SystemCliType, ...>`, but a detected CLI missing from the models map gives
`options === undefined`. Then `options.some` throws. The method has no `try/finally`, so
`_catalogLoading` stays true. The same loop also adds the same diagnostic text up to three times.
Fix: use `models.data[cli.cli] ?? []`. Wrap the body in `try/finally` for the current token. Add
a diagnostic for each failed source, with unique text.

### D8 (Low): `resubmitConflict` can use a stale revision after a toggle
`bots.store.ts:195-206`, `:242-243`.
`setEnabled` is allowed while a conflict is pending. It rebases `selected` and `draft` but not
`conflict.latest`. `resubmitConflict` then sends `conflict.latest.revision`, which is old, and
conflicts again.
Fix: block `setEnabled` while `_conflict()` is set, or update `conflict.latest` with the result.

### D9 (Low): `dirty` compares JSON text, so key order matters
`bots.store.ts:113-117`.
A nested object that the UI builds in another key order, for example `scope` or `runtime`, makes
`dirty` true with no real change.
Fix: use a canonical deep-equal helper.

### D10 (Low): the avatar upload scope comes from the caller, not from the draft
`bots.store.ts:311`, `:171-174`.
`uploadAvatar` accepts any `params.scope`. If the draft scope later changes, the staged
`imageId` stays on `draft.definition.avatar` but belongs to the old scope.
Fix: take the scope from `draft.definition.scope`. When the scope changes, remove a staged image
avatar.

### D11 (Low): memory and message limits on the avatar path
`bots.store.ts:318`, `:337`, `:341`.
The cache limit counts entries, not bytes. 24 entries of up to about 2.7 MB each is about 65 MB
in the renderer. The upload error always adds the "PNG, JPEG or WebP up to 2 MB" text, even for
`PERSISTENCE_UNAVAILABLE`. For `bots:get-avatar`, `BOT_NOT_FOUND` shows the "bot no longer exists"
text, which is wrong for a missing image.
Fix: add a byte budget. Choose the avatar text by error code.

## Carry-forward rows

| # | Row | Result |
| --- | --- | --- |
| 1 | Every error code maps to its own message with a fallback | Pass. `RpcUserErrorCode` has 7 `BOT_*` codes (`rpc-error-codes.types.ts:17-23`). The store maps all 7 plus `PERSISTENCE_UNAVAILABLE`, `INVALID_PARAMS`, `UNAUTHORIZED_WORKSPACE` (`bots.store.ts:13-24`). The handler throws only `INVALID_PARAMS`, `PERSISTENCE_UNAVAILABLE` and `BotDomainError` codes (`bots-rpc.handlers.ts:53,62,112`). `satisfies Record` enforces completeness. Unknown codes use the fallback. See D11 for the avatar text. |
| 2 | Multi-root `bots:create` carries an explicit scope | Pass. `newDraft` refuses an omitted scope when roots are more than one or none (`:152-157`). `save` sends `definition.scope`. The handler fallback `roots[0]` is never used. |
| 3 | `unreadable` items and `unidentifiedRowCount` kept in state | Pass (`:90-96`). `unreadable` stays apart from `summaries`. |
| 4 | ID-based methods send no workspace path | Pass. `get`, `setEnabled`, `archive`, `restore`, `delete` and `getAvatar` send only IDs. `update` and `create` carry the path inside `definition.scope`, which the wire schema requires. `list` sends `workspaceRoot`, which the schema requires. |

## Acceptance criteria

Met: typed runtime union and drafts, lane choices from four RPCs with no lane start,
readonly signals with method-only writes, `computed` over `effect`, enabled toggle rebases only
enabled and revision, dirty draft kept on refresh, conflict get, compare and resubmit,
unavailable catalog diagnostics.
Partly met: stale-result disposal (D1, D2), bounded cache (D2, D11), actionable load and
upload failures (D4, D11).

## Test gaps
The spec has no case for D1 (a stale success refreshes the list), D2 (cache of 30 loads), D3
(upload during save), D4 (a list load after a save error), D7 (model map missing a key) or D8.

## Check results

| Command | Result |
| --- | --- |
| `npx jest --config libs/frontend/bots-ui/jest.config.ts ... bots.store.spec.ts` | 24 passed, 1 suite |
| `npx eslint` on the two files | Clean, no output |
| `npx tsc --noEmit --project libs/frontend/bots-ui/tsconfig.lib.json` | Clean, no output |

The spec tsconfig BigInt errors in `libs/shared` are pre-existing and I did not run them.

## Decisions
- I rate D1 to D5 as Medium because each can show wrong data to the user. I rate D6 to D11 as
  Low because each needs an unusual order of events, or has a small effect. Both ratings can
  change.

Review family: claude (implementer: codex)

## Re-review 1

Review family: claude (implementer: codex)

Score: 7.5 / 10
Verdict: REVISE (one small fix: N1)

Scope: I re-read `bots.store.ts` (429 lines) and `bots.store.spec.ts` (38 tests) in full. I also
read the "Revision 1" section of the report. Lane checks I ran: jest on `bots.store.spec.ts`
(38 passed), eslint on the two files (clean), `tsc --noEmit` on `tsconfig.lib.json` (clean).
There are no `any`, `!` or `as unknown as` in the store. The fixes for 10 of 11 defects are correct.
D2 is only partly fixed, and the spec accepts the remaining fault.

### D1 to D11

| # | Result | Evidence |
| --- | --- | --- |
| D1 | Fixed | `bots.store.ts:263` and `:282` refresh the list on a stale success and skip editor updates. Specs `D1 ...` (`spec:183-205`) check that the list is reloaded and that the new draft stays. Stale failures do nothing, which is correct. |
| D2 | Partly fixed | Loading entries are no longer evicted (`:409`). But the cap still counts loading entries, so a just-settled entry is evicted first when the map is over 24. See N1. Spec `:206-217` expects `size === 24` after 30 loads, so it accepts that 6 settled images vanish. |
| D3 | Fixed | `:381-384` refuses staging while `_saving()` and does not touch the draft or `saveState`. Spec `:218-232` proves `saving`, `saveState`, the unchanged draft and the visible error. |
| D4 | Fixed | `listError` is separate (`:95`, `:165-167`). `load` never writes `_error`. Spec `:233-244` proves an editor error survives a list load and that a refresh failure after a save uses the list text. |
| D5 | Fixed | `:204-205` returns early with no draft. `:219` keeps `conflict` and derives `dirty` or `pristine`. Spec `:245-256` covers each case. |
| D6 | Fixed | `select` keeps the old selection and draft until `get` succeeds (`:172-185`), with a separate `selectRequestSequence`. Spec `:257-269` proves the draft survives a failed get and that `selecting` is true during the request. |
| D7 | Fixed | `?? []` at `:345`, one text per failed source (`:338-340`), `try/catch/finally` with a token check (`:331-367`). Both D7 specs pass. |
| D8 | Fixed | `:239` blocks `setEnabled` during a conflict. Spec `:290-298` proves no RPC call and `expectedRevision: 4` on resubmit. |
| D9 | Fixed | `deepEqual` (`:62-74`) ignores key order, ignores `undefined` keys and keeps array order. Spec `:299-305` proves all three. |
| D10 | Fixed | `:375` sends the draft scope and ignores the caller scope. `:206-216` removes only the staged image on a scope change. Spec `:306-313` proves both. |
| D11 | Fixed | A byte budget (`:51`, `:408`) and code-specific texts (`:55-60`). Specs `:314-337` prove the budget, the storage text, the 2 MB text and the missing-image text. |

### New defects

**N1 (Medium) - the cache evicts the newest settled entry, so rows still reload in a loop.**
`bots.store.ts:404-415`, `:392-403`, spec `:206-217`.
The `while` loop counts loading entries toward `BOT_AVATAR_CACHE_LIMIT` and then evicts the
oldest non-loading entry. When 30 loads are pending, each early completion makes the map larger
than 24 and evicts a settled image at once, because it is the only evictable one. After all 30
loads, 6 rows have no entry. A row that calls `loadAvatar` for a missing entry starts a new load,
which evicts a visible, settled image. With more than 24 visible image avatars, the reload cycle
continues. This is the symptom of the original D2.
Fix: count only settled entries toward the 24-entry cap. Never evict the entry that was just
written. Raise the cap above the largest expected visible list (for example 64) and keep the byte
budget as the real limit. Change the spec to assert that all 30 entries stay `ready` when the
bytes are small.

**N2 (Low) - `resubmitConflict` can leave `saveState` at `conflict` with no conflict.**
`bots.store.ts:242-248`.
The method clears `_conflict` before `save()`. If `save()` returns early because `readonly()` is
true (for example while `selecting`), nothing resets the state and the UI shows a conflict state
with no conflict object.
Fix: call `save()` guards first, or set `saveState` to `dirty` after the early return.

**N3 (Low) - several actions return with no feedback.**
`bots.store.ts:205`, `:229`, `:239`, `:372`.
`patchDraft`, `save`, `setEnabled` and `uploadAvatar` return with no message while `selecting`,
`saving`, in conflict, or archived. The `readonly` signal covers most cases. The conflict block of
`setEnabled` and the `uploadAvatar` block while `selecting` have no signal for the UI.
Fix: expose a `blockedReason` computed signal, or document that components must disable controls
from `readonly` and `conflict`.

**N4 (Low) - a staged avatar can be evicted while a draft still uses it.**
`bots.store.ts:386`, `:409`, `:388`.
The staged image of an unsaved draft is cached only by `imageId`. If the cache evicts it, a
component calls `loadAvatar` with no valid bot ID, and the get fails with an error state for an
image the user just chose.
Fix: never evict the entry whose ID equals `stagedImageId`.

**N5 (Low) - a late avatar load can overwrite a staged entry.**
`bots.store.ts:393-402`, `:386`.
`cacheAvatar` replaces a `loading` entry with the staged `ready` entry but leaves its token in
`avatarSequence`. A late `bots:get-avatar` result then overwrites it, possibly with an error.
Fix: delete `avatarSequence` for the ID inside `uploadAvatar` before `cacheAvatar`.

### Remaining state

All four carry-forward rows still pass. N1 is the only item that blocks approval. After N1 is
fixed and its spec is changed, I expect APPROVED at 8.5 or higher.

Review family: claude (implementer: codex)

## Re-review 2

Review family: claude (implementer: codex)

Score: 9 / 10
Verdict: APPROVED

Scope: I re-read `bots.store.ts` (441 lines) in the changed paths (`cacheAvatar`, `uploadAvatar`,
`loadAvatar`, `resubmitConflict`, `blockedReason`) and the specs `bots.store.spec.ts:206-297`.
Lane checks I ran: jest on `bots.store.spec.ts` (45 passed), eslint on the two files (clean),
`tsc --noEmit` on `tsconfig.lib.json` (clean). The store has no `any`, `!` or `as unknown as`.

### N1 to N5

| # | Result | Evidence |
| --- | --- | --- |
| N1 | Fixed | `bots.store.ts:418-419` counts only settled entries against the cap (now 64, `:49`). `:420` never evicts the entry just written. Spec `:206-219` shows 30 small loads all stay `ready` and a second pass makes no new RPC call. Spec `:220-236` shows 70 pending loads, with the first two protected on settling, and a final size of 64 with all `ready`. |
| N2 | Fixed | `:252` guards on `readonly()` before the method changes any state, so a blocked call keeps the conflict. `:255` sets a consistent `saveState`. Spec `:237-249` proves the conflict and `conflict` state survive while selecting. Spec `:250-257` proves `error` state after a validation failure. |
| N3 | Fixed | `:50` and `:153-158` add `blockedReason` with the order selecting, saving, conflict, archived, null. Spec `:258-271` goes through every value and back to null. |
| N4 | Fixed | `:396` pins `stagedImageId` before the insert, and `:420` skips it under both entry and byte pressure. Spec `:272-286` proves the staged entry is unchanged after 65 small loads and 3 large loads, and that no get call is made for it. |
| N5 | Fixed | `:395` deletes the pending token before the staged insert. Spec `:287-297` proves a late success with other data and a late failure are both ignored. |

### New defects

**1 (Low) - more than 64 visible image avatars still reload.**
`bots.store.ts:414-428`.
The cap is a count. A list with more than 64 distinct image avatars on screen evicts visible
entries, and a row that asks again causes a new load. The fix removes the loop for realistic
lists, not for this case.
Fix: none needed in the store. The U04 list must limit visible rows (paging or virtual scroll) and
must not call `loadAvatar` from an `effect` for rows outside the view.

**2 (Low) - the byte budget can be exceeded by protected entries.**
`bots.store.ts:420-421`.
The loop stops when only the newest and the staged entry remain. The total can then exceed 12 MiB
by at most two images (each up to about 5.4 MB in UTF-16 estimate). This is bounded and small.
Fix: none needed.

**3 (Low) - an `error` avatar entry stays cached.**
`bots.store.ts:403`.
A failed load is kept, and `loadAvatar` returns early unless `retry` is true. A component that
does not pass `retry` never recovers.
Fix: none in the store. The component must show a retry action that calls `loadAvatar(..., true)`.

**4 (Low) - `blockedReason` has no value for "no draft".**
`bots.store.ts:153-158`.
It returns null when there is no draft, so a control cannot tell "free" from "nothing to edit".
Fix: none needed. Components already read `draft()` for that case.

### Safe to carry forward to U04-U06

All four new items are Low and safe to carry forward as consumer rules:
- U04 list: bound visible image avatars to 64 or fewer, and load them from the view, not from a
  broad `effect` (item 1).
- U04/U05 avatar view: provide a retry action with `retry = true` (item 3).
- U05 editor: disable save, enabled and field controls from `blockedReason()` and `readonly()`.
  Keep conflict compare, edit-mine, `resubmitConflict` and `loadConflictLatest` available during
  a conflict.
- Components must pass no scope to `uploadAvatar` (the store ignores it) and must render
  `listError` for the list and `error` for the editor.

All four carry-forward rows from the first review still pass. No open item blocks approval.

Review family: claude (implementer: codex)

## Split review

Review family: claude (implementer: codex)

Score: 9 / 10
Verdict: APPROVED

Scope: I read `bot-avatar-cache.ts` (85 lines), `bot-error-messages.ts` (55 lines) and the changed
parts of `bots.store.ts` (682 lines). I compared the cache logic with the version I approved in
Re-review 2. Lane checks I ran: jest on `bots.store.spec.ts` (45 passed, spec unchanged), eslint on
the store and the two new files (clean), `tsc --noEmit` on `tsconfig.lib.json` (clean).

### Behavior check

| Item | Result | Evidence |
| --- | --- | --- |
| Cap of 64 settled entries | Same | `bot-avatar-cache.ts:8`, `:66-69` count only non-loading entries. |
| Byte budget 12 MiB, UTF-16 estimate | Same | `bot-avatar-cache.ts:10-13`, `:62-65`. |
| Newest and staged entries protected | Same | `bot-avatar-cache.ts:72-73` skip the written ID and `_stagedImageId`. Pending entries are skipped at `:74`. |
| Token deleted on staging | Same | `stage()` (`bot-avatar-cache.ts:39-43`) deletes the token, then pins, then caches. The store calls it at `bots.store.ts:619`. |
| Token check before applying a get | Same | `finishLoad()` returns when the token differs (`bot-avatar-cache.ts:52-56`). The store calls it at `bots.store.ts:646`. |
| Evicted entries lose their token | Same | `bot-avatar-cache.ts:81`. |
| Staged ID cleared in the same places | Same | `clearStaged()` at `bots.store.ts:305` (scope change), `:482` and `:492` (accept and invalidate). |
| Error texts and fallback | Same | All texts in `bot-error-messages.ts:10-26`, `:36-49` match the approved text. `listErrorMessage` (`:51-55`) gives the old list text. The `satisfies Record<BotDomainCode, string>` check is kept (`:26`). |
| Signals readonly to consumers | Yes | `avatars` and `avatarCacheBytes` are `entries` (`asReadonly`) and a `computed` (`bot-avatar-cache.ts:24-30`). `_entries`, the token map and the counter are private. `stagedImageId` has a getter only. |
| Public exports kept | Yes | `bots.store.ts:25-34` re-export `BOT_AVATAR_CACHE_LIMIT`, `BOT_AVATAR_CACHE_BYTES`, `AvatarState`, `botErrorMessage`, `BotDomainCode`, `BotFailure`. |
| Circular import | None | `bot-avatar-cache.ts` imports a type from `bot-error-messages.ts`. That file imports only from `@ptah-extension/shared`. The store imports both. |
| `any`, `as unknown as`, `!` | None | The only cast is `code as BotDomainCode` after an `Object.hasOwn` check, as before. |

### Defects

**1 (Low) - `BotAvatarCache` and the two helpers are not exported from the library barrel.**
`bot-avatar-cache.ts:16`, `bot-error-messages.ts:36`, `:51`.
This is correct for now, because only the store should use them. If a later batch adds them to
`index.ts`, the cache becomes a second write path for consumers.
Fix: none needed. Keep them out of the barrel.

**2 (Low) - the cache is a plain class created with `new` inside the store.**
`bots.store.ts:142`.
A spec cannot replace it. The current specs test it through the store, which is enough.
Fix: none needed.

No behavior change found. The split is safe to merge.

Review family: claude (implementer: codex)
