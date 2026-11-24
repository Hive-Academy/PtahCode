# Batch 16 report: B8a ACP runtime available commands and hidden list

## Changes

- MODIFIED `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts`:
  - new exported `AcpAvailableCommand { name; description?; path? }` (`path` = `_meta.path`) and
    `readAvailableCommands(update)`, a defensive reader (entries without a string name are
    skipped; an update without a list returns `undefined`).
  - the `sessionUpdate` handler keeps the latest list of every own-session
    `available_commands_update`, before the replay checks (the list is session state, not history).
  - `AcpSession.getAvailableCommands()` returns it (empty until one arrives).
  - `_meta.usage` handling (`acpUsageUpdateSchema` block) unchanged (D9).
- MODIFIED `acp-vendor-profile.ts`: optional `hiddenLaneCommands?: readonly string[]`.
- MODIFIED `profiles/grok-acp-profile.ts`: `hiddenLaneCommands: ['always-approve']`.
- `profiles/antigravity-acp-profile.ts` untouched.
- Specs: `acp-session-runtime.spec.ts` replays the recorded `available_commands_update` payloads of
  `grok-plain-turn.ndjson` (55 entries, 40 with a `SKILL.md` path, `always-approve` present) and
  `antigravity-p3-ptah-mcp-tool-use.ndjson` (13 entries, no `_meta` path) through the fake agent,
  plus malformed-update cases. `grok-acp-profile.spec.ts` checks the hidden list against the
  fixture.

## Verification

- `npx jest --config libs/backend/acp-runtime/jest.config.ts --runInBand --coverage=false
  --runTestsByPath acp-session-runtime.spec.ts profiles/grok-acp-profile.spec.ts`: 2 suites,
  40 tests passed.
- `npx eslint` on the 5 files: 0 errors; 1 pre-existing `max-lines` warning on
  `acp-session-runtime.ts`.
- Typecheck not run locally (CI).

## Open items

- `AcpAvailableCommand` and `readAvailableCommands` are not re-exported from
  `libs/backend/acp-runtime/src/index.ts` (not in this batch's write set). Batch 27 can use
  `ReturnType<AcpSession['getAvailableCommands']>` or add the barrel export.
