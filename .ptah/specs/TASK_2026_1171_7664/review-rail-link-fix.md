# Rail link fix review

**Verdict: REJECT**

## Findings

### High — resolved-session alias cannot move to a reopened tab

`HostRoutingCoordinator.onSessionIdResolved` returns when `aliases.get(realSessionId)` points at another tab (`libs/backend/rpc-handlers/src/lib/chat/host-routing/host-routing.coordinator.ts:585-595`). Aliases are only cleared on coordinator disposal (`:258-262`) or eventual capacity eviction through `touch` (`:621-623`); there is no tab-close removal. A legitimate Codex resume can open the same thread under a new tab: `CodexChatAdapter.resumeSession` calls `open(config, id)` for a non-live session (`libs/backend/agent-sdk/src/lib/codex-app-server/codex-chat-adapter.ts:308-343`), and `open` emits `{ tabId: config.tabId, realSessionId: id }` after publishing (`:466-488`). The old alias survives, so this valid binding is silently discarded. The chat handler calls `admitHostRoutingTurn` only after `resumeSession` returns (`libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts:3158-3165, 2121-2127`), leaving the old tab as event owner during the native open and until later admission. A resume with no routed user turn, or early turn-end, remains attributed to the old tab. The same problem applies to a Claude session reopened in a new tab. This guard needs ownership/lifecycle-aware rebinding; an unconditional conflicting-owner rejection is unsafe.

The new coordinator specs at `host-routing.coordinator.spec.ts:1017-1050` cover an artificial conflicting Codex notification and first binding, but omit same-real-ID resume/reopen after the previous tab closes. Add a test that opens the same real ID under tab A, closes/reopens under tab B, emits resolution, and checks the reply is attributed to B.

## Other review results

- `sdkIdOf` checks the lifecycle record first (`session-spawner.service.ts:1920-1934`), including an unresolved Claude record, so an active Claude tab is not mistaken for a native thread. For an ID absent from lifecycle it requires an active adapter session and a native `resolveLiveSessionId(id) === id`; `RoutingAgentAdapter` delegates only to native (`routing-agent-adapter.ts:204-211`). The native adapter returns the input itself only when it is a published session key (`codex-chat-adapter.ts:217-228`). This meets the parent SDK identity requirement. Call sites at spawner lines 357, 497, 619, 945, 1115, 1121, 1218, 1348, 1779, 1802, 2000, and 2320 use the result for depth/ownership, parent record, or organization binding; no call site stores an unconfirmed tab ID as `parentSdkSessionId`.
- The new Codex notification occurs after session publication (`codex-chat-adapter.ts:466-488`). The spawner listener looks up the child by payload `tabId`, binds its SDK ID and records organization (`session-spawner.service.ts:1319-1355`). Other registry listeners either rekey tab-local state (turn state, memory trigger), clear pending lineage, update follow-up mapping, handle pending handoff, or consume `realSessionId`; organization capture ignores payloads without `previousSessionId` (`session-organization-capture.service.ts:155-159`). I found no duplicate consumer action from the separate single-slot callback: it remaps agent/subagent parents and broadcasts to the webview (`cli-agent-runtime/src/lib/wiring/sdk-callbacks.ts:196-245`), while the registry subscribers own separate state. No `any` or unsafe cast was introduced in the changed production logic, and the new dependency is typed and optional. The new tests establish first publication and unconfirmed-ID behavior, but do not cover the resume conflict above.

## Checks

Inspected the uncommitted diff under `libs/` and `git show 5d3be6ea9`; traced all `sdkIdOf` call sites, registry subscribers, native resume, chat admission, and alias cleanup with targeted `rg` and source reads. No Jest, TypeScript, ESLint, Nx, build, or source edits were run. Ptah workspace analysis was attempted but did not return a usable result; native `rg`/git reads were used as the fallback. No matching code-review skill was exposed through the CLI skill catalog.

