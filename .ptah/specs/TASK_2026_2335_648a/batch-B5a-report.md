# Batch B5a backend

## RPC contract

Reuse `enhancedPrompts:getStatus` with `{ workspacePath?: string }`. The response fields are `enabled: boolean`, `hasGeneratedPrompt: boolean`, `generatedAt: string | null`, optional `regenerationStartedAt: string | null`, `detectedStack: EnhancedPromptsStatus['detectedStack']`, `cacheValid: boolean`, optional `invalidationReason: string`, and optional `error: string`. Use `hasGeneratedPrompt` to gate the toggle and `hasGeneratedPrompt && enabled` for its displayed value. Persist a choice with the existing `enhancedPrompts:setEnabled` RPC. The generation completion path should refresh status.

## Files and behavior

- `libs/backend/agent-sdk/src/lib/prompt-harness/ptah-full-prompt.ts` and its spec define the static prompt and cache boundary contract.
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts` and its builder and output-style specs cover the full prompt, its static and dynamic slots, preset compatibility, and style flag suppression.
- `libs/backend/agent-generation/src/lib/services/enhanced-prompts/enhanced-prompts.service.ts`, its spec, and `libs/backend/agent-generation/src/lib/types/enhanced-prompts.types.ts` persist explicit choices and serialize generation and toggle writes per workspace.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts` and its focused `chat-session.ptah-ui-flag.spec.ts` set and test the backend-only full-prompt marker on new main chats. These files were added to the write set by the coordinator.
- `libs/backend/output-styles/src/lib/output-style-session-activation.service.ts` and its spec supply the winning style body for custom prompts. These files were added to the write set by the coordinator.
- `libs/backend/agent-sdk/src/lib/helpers/session-lifecycle/session-query-executor.service.ts` forwards the admitted resource context so named-account styles are resolved within that account.

| Enhanced content | Toggle | New main-chat Claude prompt |
| --- | --- | --- |
| Missing or blank | Off and unavailable | Claude Code preset plus the existing Ptah append |
| Available | On by default or explicitly on | Ptah full prompt array |
| Available | Explicitly off | Claude Code preset plus the existing Ptah append |

Main chat uses the existing `preset: 'enhanced'` field internally. Chat apps, agent-child, gateway, and Ptah CLI callers retain their existing prompt construction. The builder also requires a first-party Anthropic endpoint and no phase delivery. Session continuation relies on the SDK's default snapshot behavior.

The full array starts with the Ptah static prompt, UI hint, user system prompt, output-style body, and enhanced prompt in that order. The SDK cache boundary precedes environment, memory snapshot, corpus, recalled memory, and symbols. Empty optional blocks are omitted. The SDK output-style flag is suppressed for this route.

## Preset rules and size

The static full prompt is **10,142 characters**, including the Ptah core and excluding all other blocks. The limit is 16,000.

| Preset rule | Kept or dropped | Reason |
| --- | --- | --- |
| Claude identity | Kept and adapted | Identifies Claude and the Ptah host. |
| Authorized security testing and abuse restrictions | Kept | Defines permitted contexts and refusal boundaries. |
| Confirmation, privacy, and honest results | Kept | Preserves user control, data handling, and reporting. |
| Dedicated tools, read before edit, and independent calls | Kept | Applies to Ptah's tool surface. |
| System reminders, hooks, and untrusted context | Kept | Distinguishes system updates, tool results, pasted data, and user feedback. |
| Concise tone and clickable file references | Kept | Applies to the Ptah chat view. |
| Git authorization and safeguards | Kept | Maintains workspace authority and protects user changes. |
| Terminal UI, fixed model catalog, fast mode, and Claude Code product commands | Dropped | These are specific to the Claude Code product UI or fixed runtime facts. |
| Extended context-management and task narration advice | Dropped | Ptah's existing prompt and host handle orchestration. |
| SDK-generated environment | Replaced | Runtime fields go after the cache boundary. |

## Focused checks

- Agent SDK focused Jest suites covering the query builder, output-style flag, and static prompt passed 165 tests across 3 suites. Zero failures.
- Agent generation focused Jest suites covering persistence and enhanced-prompt state passed 77 tests across 2 suites. Zero failures.
- Output style focused Jest suites covering activation and account isolation passed 31 tests across 2 suites. Zero failures.
- RPC handler focused Jest suites covering the chat marker and enhanced-prompt status passed 73 tests across 2 suites. Zero failures.
- Claude SDK CLI lane regression suite passed 115 tests. Zero failures.
- Total across the five focused Jest runs was 461 passed, zero failed, across 10 suites.
- `git diff --check` passed for the four touched backend projects.
- Ptah's scoped diagnostics returned no completed result within its request window. Verification uses the project Jest configurations directly.

## Proposed Removals

None.

## Decisions

- Existing generated records with `enabled: false` migrate as explicit opt-outs. Older records without generated content did not distinguish the initial disabled value from an explicit off choice. New writes track that distinction.
- The SDK's bundled styles expose names and descriptions through Ptah's style catalog. For those styles, full-prompt mode injects a short directive based on that description. File-backed styles use their discovered bodies.
- The environment block uses the host shell environment, local date, and a bounded Git check. An unavailable Git check reports `unknown`.

## Unknown

- SDK snapshot availability depends on account rollout. A live resumed provider session was outside the focused check scope.
