# provider-session-contracts

The neutral contract shared by every provider-session runtime (ACP agents in
`@ptah-extension/acp-runtime`, OpenCode later) and every consumer (CLI lanes in
`@ptah-extension/cli-agent-runtime`, the chat host later).

- `ProviderSessionEvent` — the one event stream a runtime emits.
- `ProviderSessionRuntime` / `ProviderSession` — the session surface.
- `ProviderSessionLogger` — the logging port a runtime takes; the host `Logger`
  satisfies it structurally, so runtimes never import a host logger.
- `projectToCliSegments(event)` — an event as lane `onSegment` rows.
- `createFlatStreamProjector(ids)` — events as `FlatStreamEventUnion` rows.

Types and pure functions only; depends on `@ptah-extension/shared` alone.

Run the specs with `npm run verify -- -t test -p provider-session-contracts`.
