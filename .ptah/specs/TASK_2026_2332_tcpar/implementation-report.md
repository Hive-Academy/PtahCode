# Tool-card parity implementation

## Changed files and rules

| File | Change |
| --- | --- |
| `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts` | Presents execute as Bash, including the agy CommandLine field. Presents single-file edits with old and new text as Edit and falls back to FileChange. Retains late input and diff snapshots by call ID and completes cancelled tools with a short error result. |
| `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts` | Exercises mapper-to-flat-stream projection for native agy shell input, late input, cancellation, Edit promotion, and multiple file diffs. |
| `libs/backend/provider-session-contracts/src/lib/provider-session-events.ts` | Adds optional chat presentation snapshots to tool start and update events. |
| `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts` | Projects snapshots and reissues the tool start with the original call ID, message ID and timestamp. The existing accumulator replaces the card. |
| `libs/backend/codex-runtime/src/lib/codex-event-translator.ts` | Carries completed file artifacts in the native FileChange tool result. |
| `libs/backend/codex-runtime/src/lib/codex-event-translator.spec.ts` | Verifies the completed FileChange result includes its changes. |
| `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts` | Delivers file refresh notifications without creating the duplicate Edit card. |
| `libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.spec.ts` | Verifies the file notification and absence of a duplicate tool event. |
| `libs/backend/acp-runtime/src/lib/acp-replay-collector.ts` | Counts and compacts the new presentation input during history replay, using the existing per-input and per-session limits. |

## Decisions

- Chose an ACP-side formatter with a provider-neutral snapshot field over ACP logic inside the shared projector. The CLI projector consumes the native name and input and continues to receive the existing file-change notices. The optional snapshot is reversible without changing consumer signatures.
- Chose existing call-ID replacement over JSON input deltas. The renderer already accepts equal-priority starts for the same call ID, and a snapshot can replace both the name and the input when an ACP diff arrives. This uses the existing renderer contract and is reversible in the projector.
- Kept the standalone Image card. The Codex translator associates file artifacts with fileChange item IDs, and the Image event contract carries image data with an independent item ID. There is no file-to-image association in the native producer. A provider correlation field would be needed to attach a future related image.
- The FileChange renderer reads update patches as unified diff and add/delete payloads as whole file text. ACP presentation follows those shapes.

- Used nine TypeScript files within the allowed directories. The extra replay collector edit keeps late input and diffs inside the existing history limits.
- The Codex FileChange card reads the structured changes from its tool start. The final result also retains the completed changes. If Codex supplies the patch only on completion, the existing renderer displays it through the generic tool-output path. A renderer fallback to the result's changes would be needed to give that case the specialized diff view.

## Checks

All 291 focused tests passed.

- `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts` passed (41 tests).
- `npx jest --config libs/backend/provider-session-contracts/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/provider-session-contracts/src/lib/flat-stream-projector.spec.ts libs/backend/provider-session-contracts/src/lib/cli-segment-projector.spec.ts` passed (23 tests).
- `npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-event-translator.spec.ts libs/backend/codex-runtime/src/lib/codex-tool-presentation.spec.ts` passed (210 tests).
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.spec.ts` passed (17 tests).
- `npx tsc --noEmit --project libs/backend/acp-runtime/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/backend/provider-session-contracts/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` passed.
- `npx eslint libs/backend/acp-runtime/src/lib/acp-session-update-mapper.ts libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.ts libs/backend/provider-session-contracts/src/lib/provider-session-events.ts libs/backend/codex-runtime/src/lib/codex-event-translator.ts libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts libs/backend/rpc-handlers/src/lib/chat/codex-host/codex-chat-event-callbacks.spec.ts libs/backend/codex-runtime/src/lib/codex-event-translator.spec.ts` passed.
- `npx eslint libs/backend/acp-runtime/src/lib/acp-replay-collector.ts` passed.

Ptah diagnostics scoped to ACP mapper and replay collector reported zero errors and zero warnings. Jest emitted Node's TypeScript config loader warning. ESLint skipped the Nx boundary rule because no cached project graph was available. The added imports use the same project scope.

## Outstanding work

No Electron visual run was performed under the focused check restrictions. Skill discovery was unavailable in this lane. The Codex final-only patch rendering and standalone image behavior are documented under Decisions.
