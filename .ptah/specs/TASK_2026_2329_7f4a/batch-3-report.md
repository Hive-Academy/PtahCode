# Batch 3 — Live chat permission readback

Provider-session chat records initialize their permission override from explicit Ptah levels on open and resume. The adapter reports the session override or the live runtime's default. The RPC reports the Claude lifecycle level or an independently injected native routing adapter's level. The two adapters have separate DI tokens, and the RPC tests model them separately.

Regression coverage exercises the explicit startup level, runtime default, settings changes, unknown sessions, and omitted session IDs.

Verification command

```sh
npm run verify -- -p @ptah-extension/agent-sdk,@ptah-extension/rpc-handlers
```

Both projects passed lint and typecheck. The full agent SDK rerun passed after removing an example that could not typecheck under the start contract. The full RPC run passed 276 suites and exposed one unrelated fixture that hard-coded a nonexistent project under /tmp. The fixture now points at the existing repository root. A focused rerun passed the plugin-notice and permission RPC suites.

```sh
npm run verify -- -t test -p @ptah-extension/rpc-handlers -- --output-style=static '--testPathPatterns=plugin-rpc.handlers.session-notice.spec.ts|config-rpc.handlers.spec.ts' --runInBand
```

Readback commit `3a06182e1`. Test fixture commit `9243d1742`.
