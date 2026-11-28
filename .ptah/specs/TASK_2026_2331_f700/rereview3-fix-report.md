# Round 3 handoff fix

Fixed the Serious finding. A failed Codex close remains visible to a fresh handoff service, including when its resolver returns `unresolved`.

## Changed files

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts:31` adds the optional runtime marker to the version 1 record. The successor-scoped compare-and-set at line 388 can update it.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts:511` hydrates the stop from the durable record. The guard at line 1245 requires a matching runtime while the marker is present. The adapter path at line 1264 persists the marker before close and clears it after success.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts:138` exercises a failed Codex close, retries in the original and fresh services, verifies that neither calls the renderer closer while unresolved, and checks completion once Codex returns and closes successfully.

## Checks

- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.spec.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.spec.ts` passed all 126 tests across 3 suites.
- `npx eslint libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.service.spec.ts` exited 0 with 8 existing warnings (7 non-null assertions and the file length). The module-boundaries rule was skipped because the project graph was uncached.

## Decisions

- Persist the marker before calling the runtime adapter so a rejected close that removes the live row leaves durable evidence. If the initial write fails, the stop remains retryable and the adapter call is deferred.
- Require a successful runtime close and successful marker clearance before reporting the stop. If the clear write fails after the adapter succeeds, the stop remains retryable and the durable marker can continue to block an unresolved predecessor.
- Keep the field optional and retain schema version 1 so existing records load without migration.
- Skill discovery was unavailable in this lane. Ptah read and search tools were used, with native `rg` as a fallback while a runtime-name search stalled.
