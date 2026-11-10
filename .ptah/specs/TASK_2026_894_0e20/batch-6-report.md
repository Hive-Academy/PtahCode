# Summary

Forwarded the Codex settings action from the routing matrix to the Settings shell and into the OpenAI Codex Credentials drawer in Electron. The existing Claude Accounts request remains supported.

# Files changed

- `libs/frontend/chat/src/lib/settings/providers/agents-routing-settings.component.ts` and `.spec.ts`: forward matrix output and test it.
- `libs/frontend/chat/src/lib/settings/providers/providers-settings.component.ts` and `.spec.ts`: accept typed Codex request, wait for connections, show missing-connection action, consume close, and test request branches.
- `libs/frontend/chat/src/lib/settings/settings.component.ts`, `.html`, `.spec.ts`: switch tabs, bind request and clear it on departure; test host behavior.
- `libs/frontend/webview-e2e-harness/src/lib/scenarios/settings/settings-providers.e2e.spec.ts`: navigate from Codex settings to the Credentials drawer.

# Contract

- Agents routing output: `codexSettingsRequested: OutputEmitterRef<void>`.
- Provider drawer input: `ProvidersSettingsDrawerRequest = { connection: 'claude-cli'; tab: 'accounts' } | { providerId: 'openai-codex'; tab: 'credentials' }`.
- Provider drawer output: `requestedDrawerConsumed: OutputEmitterRef<void>`.
- Shell signal: `requestedDrawer: WritableSignal<ProvidersSettingsDrawerRequest | null>`.

# Acceptance evidence

1. Matrix output is bound to Agents routing output; the shell binds the latter to `openCodexSettings()`.
2. The shell selects Providers and binds its typed signal to Providers.
3. Providers waits for `connections().status === 'ready'`, opens `openai-codex` on Credentials, and emits consumption on close. The shell clears the request on tab departure.
4. The Codex branch matches `providerId` directly; Claude still resolves its connection kind as before.
5. A signed-out Codex connection opens Credentials. An absent connection shows Connect Codex, which enters the existing setup wizard. `VSCodeService.isElectron` gates forced drawer opening.
6. The Electron e2e scenario now clicks Codex settings and checks its drawer/tab. E2e was not executed.

# Verification

Scoped lint/typecheck (`npm run verify -- -t lint,typecheck -p chat,webview-e2e-harness`): `NX   4 tasks: 4 succeeded`; `[verify 2026-11-08T22:25:32.250Z] lock released after 62.3s, exit code 0`.

Focused Chat tests (`npm run verify -- -t test -p chat -- "--testPathPatterns=(agents-routing-settings|providers-settings|settings.component)"`): `NX   1 task: 1 succeeded`; `[verify 2026-11-08T22:34:34.106Z] lock released after 48.8s, exit code 0`. The first run failed two new test assertions; after correcting their setup/expectations, the allowed second run passed. PowerShell lacked `tail`, so output was tailed with `Select-Object -Last`.

Ptah diagnostics timed out after 45 seconds, leaving three files unchecked; scoped Nx typecheck passed. A rendered screenshot was unavailable under the task's prohibition on build, serve, dev and e2e.

## Decisions

| Decision | Options | Evidence | Reversible |
| --- | --- | --- | --- |
| Extend the existing drawer request union | Separate Codex request or extend the current request | Providers already owns drawer deep links and a connection readiness effect. | Yes |
| Match Codex by exact provider id | Match by connection kind or id | Acceptance names `openai-codex`; the Claude kind lookup must remain unchanged. | Yes |
| Use existing setup wizard for missing Codex | Catalog or direct wizard | `openWizard(providerId)` is the existing provider-specific connect flow. | Yes |

# Not done

E2e execution and rendered visual review were excluded by the verification rules. The assigned `angular-frontend-patterns` skill could not be loaded because this host exposed no skill-loading tool.
