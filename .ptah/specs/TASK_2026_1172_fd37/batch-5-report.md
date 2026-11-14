# Batch 5: durable CLI lane policy snapshot

## Changed files

- `libs/shared/src/lib/types/cli-lane-defaults.types.ts` — added strict effective and requested policy schemas using the existing lane permission and network enums.
- `libs/shared/src/lib/types/agent-process.types.ts` — added documented policy fields to `CliSessionReference`.
- `libs/backend/agent-sdk/src/lib/session-metadata-store.ts` — validates both restored policy fields and drops malformed values, including when they are the only optional fields present.
- `libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts` — covers valid policy round-trip and malformed policy removal.
- `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts` — includes both policy snapshots in persisted session references.
- `libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.spec.ts` — checks the reference projection includes both fields.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts` — restores both snapshots into `AgentProcessInfo`.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts` — checks Claude and Codex restored policies and requests.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/system-cli-lane-resumer.spec.ts` — checks a restored plan snapshot reaches spawn even with a yolo original request.
- `.ptah/specs/TASK_2026_1172_fd37/batch-5-report.md` — this report.

The policy resolver was not changed. Legacy references without a policy still use its existing default behavior, and its parent-plan cap still applies.

## Checks

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts` — passed; 1 suite, 164 tests, 0 failures.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/system-cli-lane-resumer.spec.ts` — passed; 3 suites, 307 tests, 0 failures.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json` — passed; 0 errors.
- `npx tsc --noEmit --project libs/shared/tsconfig.spec.json` — passed; 0 errors.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` — passed; 0 errors.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.spec.json` — passed; 0 errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json` — passed; 0 errors.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` — passed; 0 errors.
- `npx eslint libs/shared/src/lib/types/cli-lane-defaults.types.ts libs/shared/src/lib/types/agent-process.types.ts libs/backend/agent-sdk/src/lib/session-metadata-store.ts libs/backend/agent-sdk/src/lib/session-metadata-store.spec.ts libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.ts libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/system-cli-lane-resumer.spec.ts` — passed; 0 errors, 7 warnings (existing unrelated lines and file-length warnings).
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.spec.ts` — passed after replacing a test logger cast; 1 suite, 55 tests, 0 failures.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json` — passed after the test logger change; 0 errors.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/wiring/agent-events.spec.ts` — passed after the test logger change; 0 errors, 1 existing warning.

Ptah workspace analysis did not return; local file reads were used as fallback. No commit or push was made.
