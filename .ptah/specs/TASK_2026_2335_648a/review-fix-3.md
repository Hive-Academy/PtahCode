# PR 1534 review fixes

Reviewed the four full comments via the GitHub REST API after `gh api` reported missing authentication. Verified each against worktree head `e068b0ca3`.

## Findings

1. [4728093123](https://github.com/Hive-Academy/PtahCode/pull/1534#discussion_r4728093123) — Valid. The RPC accepted bundled IDs for writes, but the settings catalog returned only terminal and synced skill rows. The existing `terminalSkills` list now includes bundled rows with descriptions. The same catalog supplies the launch and write-validation IDs. Bundled prompt sizes are unmeasured, so their token estimate is zero. Changes at `libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.ts:590` and `libs/backend/agent-sdk/src/lib/helpers/claude-builtin-catalog.ts:123`. `agent-rpc.handlers.spec.ts:1053` verifies every row is discoverable and toggles `dataviz` on and off through the RPC. The existing `sdk-query-options-builder.spec.ts:3427` verifies a subsequent SDK options build honors the opt-in.
2. [4728093125](https://github.com/Hive-Academy/PtahCode/pull/1534#discussion_r4728093125) — Valid. The previous rewrite only read the description's first line. `scripts/regen-agents.mjs:46` parses the YAML and replaces the full description range before the provider transformers run, preserving the neighboring field and Markdown body. `scripts/regen-agents.spec.mjs:57` covers indented plain, multiline quoted, folded, and literal scalars, plus a comment between the key and its continuation.
3. [4728093129](https://github.com/Hive-Academy/PtahCode/pull/1534#discussion_r4728093129) — Valid. Ambient enhanced prompt assembly discovered user styles under the home profile regardless of the child's `CLAUDE_CONFIG_DIR`. `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1441` reuses the launch config resolver and forwards the effective directory at line 1474. `libs/backend/output-styles/src/lib/output-style-session-activation.service.ts:173` forwards it to discovery, which scopes the ambient user tier in `output-style-discovery.service.ts:266`. The project tier still takes precedence and named routes still use their admitted root. `sdk-query-options-builder.spec.ts:3223` verifies the path matches the child environment and the injection omits the flag. `output-style-account-context.spec.ts:176` verifies the overridden profile wins over a same-name home style.
4. [4728093134](https://github.com/Hive-Academy/PtahCode/pull/1534#discussion_r4728093134) — Valid. A named-account style discovery rejection propagated out of enhanced SDK options construction. `libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.ts:1480` logs a diagnostic with session context and clears both style channels so launch can proceed. Account-root validation still rejects invalid paths at discovery. `sdk-query-options-builder.spec.ts:3238` exercises startup with a real dangling output-style directory junction, verifies discovery never reads through it, and checks both style channels and the diagnostic.

## Focused verification

- `node --test scripts/regen-agents.spec.mjs` — 8 passed, exit 0.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/sdk-query-options-builder.spec.ts` — 143 passed, exit 0.
- `npx jest --config libs/backend/output-styles/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/output-styles/src/lib/output-style-account-context.spec.ts` — 12 passed, exit 0.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/handlers/agent-rpc.handlers.spec.ts` — 89 passed. Jest warned of an open handle and stayed running. The observed shell exit was −1 after I stopped the child. The previous lane documented the same behavior with 88 passing tests in `correction-B1.md`.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` — exit 0.
- `npx tsc --noEmit --project libs/backend/output-styles/tsconfig.lib.json` — exit 0.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` — exit 0.
- `npx eslint <11 changed backend and script files>` — exit 0, no errors, two existing `max-lines` warnings in the SDK builder and agent RPC handler.
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts` — 4,780 files scanned, `TOTAL 0 unsuppressed site(s)`, exit 0.
- `git diff --check` — exit 0.

Ptah provided source reads, AST structure and dependency impact for the implementation files. Native PowerShell and `rg` supplied targeted reads where output was truncated or the Ptah workspace scan was partial. Native skill invocation was unavailable in this Codex session. The repository lane and orchestration skill files were available for inspection. Verification used the targeted checks authorized for this lane.
