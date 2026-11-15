# Phase 4 step 4 review fix batch 2

## Findings

1. `agent-pack-manifest.json:8` now has `"agents": []`. No generator for this manifest exists in `package.json` or `scripts/`; `manifest:generate` generates `content-manifest.json` only. Earlier retirement commits directly edited the agent pack manifest. `git ls-files .claude/agents .opencode/agent | Select-String team-leader` returned `.claude/agents/team-leader.md` and `.opencode/agent/team-leader.md`; both remain tracked and untouched under U-D12. `agent-pack-download.service.ts:257` maps the empty array safely, `pack-install.service.ts:265-326` iterates empty inputs and returns a result without indexing, and `setup-rpc.handlers.ts:897-901` parses and forwards the request. The existing setup RPC spec uses an empty agent list. No old manifest row assertion was found. `npm run manifest:generate` and `npm run manifest:check` exited 0.
2. `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:1286` now shows `"reviewer" -> "Reviewer"`.
3. Prettier checked all existing changed `.ts`, `.tsx`, `.js`, and `.json` files from `git status --short`, found 18 files, and rewrote them with `npx prettier --write`. The final check exited 0. The generated `content-manifest.json` was refreshed by `manifest:generate`.
4. `libs/backend/agent-generation/src/lib/services/template-sharing.guard.spec.ts:554-565` explicitly skips the skeleton allowlist test when the template corpus is empty. The comment explains that Phase 5 removes generation. The nonempty case still asserts no unused entries.
5. `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-stdio/tool-builders.ts:16,147-187`, `session-submit.port.ts:41`, and `namespace-builders/system-namespace.builders.ts:375-386` use orchestration workflow or batch phase wording. Tool names and schemas are unchanged. No spec asserted the removed wording.
6. `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.ts:9-13,41-43` explains the empty built-in catalog instead of claiming it mirrors templates.

## Checks

- Jest by path: agent-generation 8 suites/355 passed/18 skipped; rpc-handlers 4 suites/235 passed; vscode-lm-tools 3 suites/107 passed; chat-ui 1 suite/15 passed; onboarding 2 suites/36 passed; shared 2 suites/106 passed. All exit 0.
- `npx tsc --noEmit --project <lib>/tsconfig.lib.json`: agent-generation, rpc-handlers, vscode-lm-tools, chat-ui, onboarding, webview-e2e-harness, shared. Each exit 0.
- `npx eslint <changed ts files>`: exit 0, 236 warnings and 0 errors. Nx module-boundary rule reported no cached ProjectGraph and was skipped.
- `npx prettier --check <changed source/spec/json files>`: exit 0 after the write pass.
- `npx ts-node --transpile-only tools/role-census/check-role-census.ts`: exit 0, no baseline update.
- `npm run validate-skill`: exit 0, 21 files, 0 errors, 0 warnings.
- `npm run manifest:generate`: exit 0. `npm run manifest:check`: exit 0 (also repeated after formatting).
- `npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`: exit 0; 221 unsuppressed sites within baseline.

## Decisions

- Kept tracked generated agent files under U-D12. The shipped pack manifest has an empty catalog.
- Kept the empty pack install result's existing `success: false` semantics for zero installed files; it returns without throwing.
- Used a visible skipped test for the empty template corpus, since an assertion in that case would be vacuous.

## Not done

- No commit, push, broad Nx check, build, serve, or e2e run.
- No visual inspection was needed; these changes contain no UI layout edit.

## Needs another batch

- None identified.
