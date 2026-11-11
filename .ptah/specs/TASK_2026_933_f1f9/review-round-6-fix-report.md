# Round 6 review fixes

| Thread | Verdict | Files changed and regression test, or reason |
| --- | --- | --- |
| PRRT_kwDOPngTds62UGe7 | Fixed | `codex-context.ts`, `codex-context.spec.ts`: `preserves pending questions when a replacement turn is aborted before admission`. Cancellation now follows successful `turn/start`. |
| PRRT_kwDOPngTds62UGfE | Fixed | `codex-context.ts`, `codex-context.spec.ts`: `starts a follow-up when the selected turn ends before an async answer can steer`. |
| PRRT_kwDOPngTds62UGfO | Fixed | `chat-view.component.ts`, `chat-view.session-enter.spec.ts`: `hydrates without a workflow marker and retries after leaving the workflow tab`. |
| PRRT_kwDOPngTds62UGfa | Fixed | `chat-view.component.ts`, `chat-view.session-enter.spec.ts`: `hydrates without a workflow marker and retries after leaving the workflow tab`. |
| PRRT_kwDOPngTds62UGfk | Fixed | `harness-chat-proposal.helpers.ts`, `harness-chat-proposal.store.spec.ts`: `ignores empty sections and fingerprints equivalent property orders equally`. |
| PRRT_kwDOPngTds62UGfs | Fixed | `harness-chat-proposal.helpers.ts`, `harness-chat-proposal.store.spec.ts`: `ignores empty sections and fingerprints equivalent property orders equally`. |
| PRRT_kwDOPngTds62UGgc | No change | `harness-chat-proposal.store.ts:159-169,196-205` clears `applying` after a timeout; `rpc-call.util.ts:128-133` resolves the timeout locally and removes the pending reply. The client cannot know whether the host applied the config. Safe retry needs a backend operation identifier and deduplication or status contract; keeping the client in `applying` indefinitely would strand users after a failed host operation. This is outside the scoped minimal fix. |
| PRRT_kwDOPngTds62UGgl | Fixed | `harness-chat-proposal.store.ts`, `harness-chat-proposal.store.spec.ts`: `rejects an older push after hydration has completed`. |
| PRRT_kwDOPngTds62UGgt | Fixed | `harness-chat-launcher.service.ts`, `harness-chat-launcher.service.spec.ts`: `treats a stopped first turn as cancellation without restoring the draft`. |

## Verification

- `npm run verify -- -p codex-runtime,chat,onboarding` — exit 0 on final state; 6/6 lint and typecheck tasks and 3/3 test tasks succeeded. The first run exited 1: 6/6 lint and typecheck tasks passed, 2/3 test tasks passed, and `chat:test` found one failing empty-section regression assertion; the nested-empty-container fix resolved it.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` — exit 0; 218 unsuppressed sites, within baselines (`libs/frontend/chat`: 11, baseline 11).
- No Angular template changed, so the template typecheck command was not required.
- Scoped Ptah diagnostics returned `unavailable` after 45 seconds with five files unchecked; the completed project typechecks above provide the compiler evidence.
