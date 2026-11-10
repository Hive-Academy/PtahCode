## Model validation design

`SdkModelService.getSupportedModels` (`libs/backend/agent-sdk/src/lib/helpers/sdk-model-service.ts:678-709`) supplies ambient provider models; `getNativeClaudeModels` (947-975) supplies local Claude login models. `resolveModelId` (1452-1469) maps tier aliases using the provider profile auth environment. The child accepts a concrete catalog ID. Alias support: yes, for `opus`/`sonnet`/`haiku` only when the resolver maps the alias to a catalog ID. The validation runs in `ChatSessionService.resolveAgentChildModel` through the existing host adapter before `SessionSpawnerService` calls the provisioner. Unknown IDs return `invalid-model` with at most 30 listed accepted IDs and a remainder count; unreadable/empty catalogs return `model-catalog-unavailable`. Omitted model makes no catalog call. The resolved ID is stored and passed to the launch.

## Changed files

- `libs/shared/src/lib/types/ai-provider.types.ts`: one `EFFORT_LEVELS` constant and derived type.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/session-tool-args.schema.ts`, `session-tool-handlers.ts`, `session-tools.ts`, `session-tools.spec.ts`: shared enum and dedicated effort refusal with tests; shortened the start-tool description to meet its 984-character contract budget.
- `libs/backend/cli-agent-runtime/src/lib/session-children/child-chat-session-host.port.ts`, `session-spawner.port.ts`, `session-spawner.service.ts`, `session-spawner.service.spec.ts`: model preflight, refusal codes, resolved model persistence and tests.
- `libs/backend/rpc-handlers/src/lib/chat/session/chat-session.service.ts`, `child-chat-session-host.adapter.ts`, `child-chat-session-host.adapter.spec.ts`, `chat-session-agent-child.spec.ts`: account/profile catalog validation, adapter forwarding, and chat launch effort tests.
- Earlier lane changes remain in the working tree as recorded in `implementation-report.md`.

## Decisions

- Validate before worktree creation using the existing host port. This prevents an invalid explicit model from creating a branch or registry record. Reversible.
- Return `model-catalog-unavailable` for named accounts pending a read-only certified catalog API: `ProviderAccountService.admitClaudeRoute` acquires a lease and is not a read-only preflight. Parent informed. Reversible.
- Refuse unsupported effort before Zod validation so tool output uses the existing session refusal style. Reversible.

## Known gaps

- Named-account explicit model starts refuse `model-catalog-unavailable`: their model catalog cannot be read without a launch. The refusal tells callers to omit `model`; `effort` remains accepted. A dedicated regression test covers this refusal and confirms the ambient catalog is not read.
- The ambient catalog may differ from a workspace provider profile when another provider owns global AuthEnv; this path needs account-scoped catalog access to be fully reliable.
- Named account and workspace-profiled cross-provider catalog behavior needs an account-scoped catalog API and dedicated integration tests.
- Latest scoped verify is not fully green: two `mcp-directory-rpc.handlers.spec.ts` assertions failed outside the child-session code; see Verification for exact failures.

## Verification

- Command: `npm run verify -- -p @ptah-extension/shared,@ptah-extension/vscode-lm-tools,@ptah-extension/cli-agent-runtime,@ptah-extension/rpc-handlers > .ptah/specs/TASK_2026_915_2621/verify-output.log 2>&1`.
- Running target test for 4 projects.
- Latest run: lint 4 passed, 0 failed; typecheck 4 passed, 0 failed (`8 tasks: 8 succeeded, 2 cached`). Tests: 3 project targets passed, 1 failed (`rpc-handlers:test`; 2 cached). Exit code 1. In that target, 239 suites passed and 1 failed; 6,369 tests passed, 8 skipped, and 2 failed. Both failures are in the unrelated `mcp-directory-rpc.handlers.spec.ts`: line 1532 expected `scopeOf('alpha', a)` to be `workspace` but got `undefined`; line 1554 expected the intent file not to exist but it did. The new named-account child-session test passed. Full log: `C:\Users\abdal\.nx\d60e02896ae18ad9\cache\terminalOutputs\18148832752469635969`.
- Previous rerun: lint/typecheck passed, 3 test project targets passed, 1 failed (`vscode-lm-tools:test`) because `ptah_session_start` description exceeded its 984-character budget by 15 characters. The description was shortened; the latest run passed that target.




