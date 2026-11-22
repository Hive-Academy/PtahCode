# acp-runtime

Runs one Agent Client Protocol (ACP) agent process per session and maps its
`session/update` stream to `ProviderSessionEvent`s
(`@ptah-extension/provider-session-contracts`).

- `createAcpSession` — spawn, handshake (per-phase deadlines, protocol 1/2
  tolerance per D8, one `authenticate` retry), resume/load or new session
  (require-resume via `attachFailure: 'error'`), `session/load` replay
  capture, `session/set_config_option` / `session/set_mode`, prompts with an
  optional watchdog, interrupt that keeps the process, approval sink, process
  generations with respawn, usage drain, cancel grace.
- `createAcpProviderSessionRuntime` — the chat `ProviderSessionRuntime`
  over `createAcpSession`: open (attach `resume`/`load`, replay), capabilities
  from the agent's advertisement, text/image/file prompt content, instructions
  through the profile's `instructionsMeta` (agy:
  `session/new` `_meta.antigravity.systemPrompt.append`) or a first-prompt
  prefix, never on a restored session; bounded `close`.
- `spawnAcpProcess` — the child-process byte stream, spawned through
  `IProcessSpawner` with the complete environment (`buildAcpSpawnEnv`); the
  caller supplies the command-line policy (`AcpCommandPreparer`).
- Vendor behaviour lives only in profiles (`AcpVendorProfile`: spawn spec,
  extension hooks, cancel behaviour, sign-in hint, error wording).
- `grokAcpProfile` — the Grok vendor profile (`grok agent --no-leader stdio`).
- `@ptah-extension/acp-runtime/testing` — the scripted fake ACP agent and the
  recorded-fixture reader for specs.
- Live check: `PTAH_LIVE_AGY=1` runs `src/lib/live/agy-acp.live.spec.ts`
  against a signed-in `agy acp` (skipped otherwise); `agy-chat-runtime.live.spec.ts`
  checks the chat runtime (instructions hook, file links) the same way.

The ACP SDK (`@agentclientprotocol/sdk`, ESM only) is loaded lazily by
`acp-sdk-loader.ts`; no other file imports an SDK runtime value.

Run the specs with `npm run verify -- -t test -p acp-runtime`.
