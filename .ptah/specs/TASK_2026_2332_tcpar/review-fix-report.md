# Tool-card parity review fixes

| Finding | Fix | Regression coverage |
| --- | --- | --- |
| Serious — replay strips FileChange diffs and shortens Edit snapshots | `libs/backend/acp-runtime/src/lib/acp-replay-collector.ts:205` keeps both presentation shapes intact within the existing total replay budget. At line 224, an input larger than the entire budget is omitted and counted toward the existing truncation notice without evicting the prior start. `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:190` keeps the most recent input when a replacement carries no input. | `libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts:7` projects multi-file patches and Edit snapshots over 4,096 characters. Line 41 covers preservation of the last patch after an oversized update. |
| Moderate — late input causes the card to remount | `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:190` reuses the original start ID and timestamp. | `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.spec.ts:37` checks identity, timestamp, and replacement input. `libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts:787` asserts the same identity through the ACP mapper. |
| Moderate — a non-zero shell exit displays success | `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts:211` marks a completed tool result with a non-zero exit code as an error. | `libs/backend/provider-session-contracts/src/lib/flat-stream-projector.spec.ts:57` checks non-zero, zero, and absent exit codes. |

## Decisions

- The existing total replay budget bounds complete file-edit presentations. A patch too large for the entire budget is omitted as a unit so replay cannot render a fabricated partial patch.
- The fix is in ACP replay and the shared flat-stream projector used by Electron chat. The CLI segment projector continues to consume native events through the existing contracts.
- The review's minor findings are outside this fix round. The existing Codex and RPC handler diffs were already present at handoff.

## Checks

- `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts` passed, 44 tests across 2 suites. The first run exposed an assertion that expected the update to change the ID. The final run passed after the assertion was updated.
- `npx jest --config libs/backend/provider-session-contracts/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/provider-session-contracts/src/lib/flat-stream-projector.spec.ts libs/backend/provider-session-contracts/src/lib/cli-segment-projector.spec.ts` passed, 27 tests across 2 suites.
- `npx eslint libs/backend/acp-runtime/src/lib/acp-replay-collector.ts libs/backend/provider-session-contracts/src/lib/flat-stream-projector.ts libs/backend/acp-runtime/src/lib/acp-replay-collector.spec.ts libs/backend/acp-runtime/src/lib/acp-session-update-mapper.spec.ts libs/backend/provider-session-contracts/src/lib/flat-stream-projector.spec.ts` exited 0. ESLint skipped the Nx module-boundary rule because a cached project graph was unavailable.
- `npx tsc --noEmit --project libs/backend/acp-runtime/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/backend/provider-session-contracts/tsconfig.lib.json` passed.


