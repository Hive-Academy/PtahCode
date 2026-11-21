# acp-runtime

Runs one Agent Client Protocol (ACP) agent process per session and maps its
`session/update` stream to `ProviderSessionEvent`s
(`@ptah-extension/provider-session-contracts`).

- `createAcpSession` — spawn, handshake (per-phase deadlines), resume or new
  session, `session/set_config_option`, prompts, usage drain, cancel grace.
- `spawnAcpProcess` — the child-process byte stream; the caller injects the
  spawn function (`AcpSpawnTransport`), so this library holds no lane policy.
- `grokAcpProfile` — the Grok vendor profile (`grok agent --no-leader stdio`).
- `@ptah-extension/acp-runtime/testing` — the scripted fake ACP agent for specs.

The ACP SDK (`@agentclientprotocol/sdk`, ESM only) is loaded lazily by
`acp-sdk-loader.ts`; no other file imports an SDK runtime value.

Run the specs with `npm run verify -- -t test -p acp-runtime`.
