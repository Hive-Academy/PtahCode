## Changed files

- `libs/frontend/core/src/lib/services/providers-connection-setup.service.ts` and spec
- `libs/frontend/core/src/lib/services/providers-settings-state.service.spec.ts` (updated old connect-only rejection expectation)
- `libs/frontend/chat/src/lib/settings/providers/provider-setup-wizard.component.ts` and spec
- `libs/frontend/chat/src/lib/settings/providers/connection-drawer/credentials-tab.component.ts` and spec
- `libs/frontend/chat/src/lib/settings/providers/add-cli-instance-modal.component.ts` and spec

## Wizard and service behaviour

Claude API connect-only is enabled and defaults when a main route exists. The setup service writes a newly typed key with `auth:setDirectAnthropicApiKey` and makes no route write for connect-only. An existing key is reused without a key write. Explicit main-agent activation remains the final commit stage, with the existing `auth:saveSettings` path. Global storage remains required because the direct secret slot is global.

## Credentials tab finding

The tab forced `use-main-agent` for Claude API replacement and hid Replace when Claude API did not drive the route. Replacement now emits `connect-only` and is offered regardless of route. Claude API deletion uses `auth:setDirectAnthropicApiKey` with `null` through the setup service. Both key edits and deletion leave the route unchanged.

## Dialog behaviour

Claude API appears beside Claude (Subscription). Create maps the virtual `anthropic` connection to lane provider `anthropic-api`. It defaults to the saved connection key and sends `credentialSource: 'shared-connection'` with no `apiKey`. A separate key sends `credentialSource: 'instance'` with `apiKey`. The shared choice is disabled and submit blocked while no saved Claude API key is connected. OpenAI Codex remains excluded; other create payloads are unchanged.

## New/changed UI text

- `Claude API can be saved as a connection. Using it for the main agent switches main-agent requests to API billing.`
- `Connect an API key; optionally use it for the main agent`
- `Saving updates the Claude API connection key. The main-agent route stays the same.`
- `Use the saved Claude API connection key`
- `Use a separate key for this instance`
- `Connect Claude API first to use its saved key, or enter a separate key.`
- `Enter a separate Claude API key for this instance.`

## Verification

`npm run verify -- -p chat,core`: lint/typecheck 4/4 passed. Chat tests: 354 suites, 6305 tests passed, 2 skipped. Core initially had 56 suites and 1732 tests passed, 1 suite and 1 test failed due to an old assertion that connect-only must be blocked; that assertion was updated.

`npm run verify -- -t test -p core -- '--testPathPatterns=providers-(connection-setup|settings-state).service.spec.ts'`: 2 suites, 206 tests passed.

`npm run verify -- -t test -p chat -- '--testPathPatterns=(provider-setup-wizard|add-cli-instance-modal|credentials-tab).component.spec.ts'`: 3 suites, 138 tests passed.

Ptah scoped diagnostics was unavailable after its 45-second timeout; the required verify lint/typecheck passed before the final spec edits, and both focused test runs compiled the changed specs.

## Decisions

Used the shared exported `ANTHROPIC_API_LANE_ENTRY.id` for the create payload. Kept the connection row ID `anthropic`. Did not add a new secret state; the dialog retains only its existing password input state.

## Open points

The full core test target was not rerun after fixing its only failure; its affected suites passed in the focused rerun.
