# Batch D report

## Files changed

- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff-ack.store.ts` and `.spec.ts`: complete-read lookup of the validated, current predecessor record; identity and workspace matching; read-only regression coverage.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.service.ts` and `.spec.ts`: status result mapping, unavailable handling with injected Logger, and service regression coverage.
- `libs/backend/cli-agent-runtime/src/lib/session-children/session-handoff.port.ts` and `index.ts`: public status request/result contract and export.

## Contract for batch F

`ISessionHandoff.status(request: SessionHandoffStatusRequest): Promise<SessionHandoffStatusResult>`

`SessionHandoffStatusRequest` is `{ readonly tabId: string; readonly sessionId: string; readonly workspaceRoot: string }`. `SessionHandoffStatusResult` is `{ readonly state: 'absent' | 'starting' | 'recorded' | 'closePending' | 'closeCompleted' | 'unavailable'; readonly successorSessionId: string | null }`. Import these types and `ISessionHandoff` from `@ptah-extension/cli-agent-runtime`. Resolve the existing `CLI_AGENT_RUNTIME_TOKENS.SESSION_HANDOFF` token as `ISessionHandoff`; no new registration is needed. The service is already registered for the Electron and CLI composition paths.

The lookup matches the exact predecessor tab, SDK id and workspace. It returns the persisted successor SDK id or null. It neither creates a successor nor writes state or returns paths/document content. A failed complete storage read returns `unavailable` and is logged.

## Checks

- Scoped Ptah diagnostics: both requests returned unavailable after 45 seconds with TypeScript check still running. The focused `tsc` command below completed without reported errors.
- Focused Jest command: acknowledgement store suite passed (20 tests); service suite failed to load because Jest maps `marked` to missing `node_modules/marked/lib/marked.umd.js` in this worktree. The service assertions did not execute.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: no diagnostics in tailed output.
- `npx eslint` on the six changed files: 0 errors, 7 existing warnings in `session-handoff.service.ts`; Nx module boundary rule skipped due to absent cached ProjectGraph.

## Anything not done

No DI or RPC handler files changed; batch F owns the RPC. The service test suite needs a working `marked` Jest mapping or dependency before it can execute in this worktree.

## Decisions

- Added `status` to the existing `ISessionHandoff` port instead of a new token. Evidence: the service and token already exist in the runtime registration and provide the same handoff boundary. Reversible.
- Used the store's `locate(..., true)` path to require every candidate storage read to succeed before exposing status. A partial read could report an obsolete record; alternatives were best-effort status or reading only one workspace store. Reversible.
- Required exact predecessor tab, SDK id and workspace match and returned only state and successor SDK id. Evidence: persisted record fields and the shared RPC result shape. Reversible.
