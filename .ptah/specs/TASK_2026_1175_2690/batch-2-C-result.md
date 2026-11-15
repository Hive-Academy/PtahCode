# Batch 2 C result

## Files changed

- `libs/shared/src/lib/types/task-spec.contract.ts:69`; `wizard/recommendations.ts:31`: keep legacy report names and use an active wizard example.
- `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.ts:69` and `agent-recommendation.service.spec.ts:57`: remove four retired roles from the wizard picker and assert exclusion.
- `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:65` and `subagent-tool-allowlist.spec.ts:38`: remove built-in policy rows for retired roles. Same-name custom agents have no built-in policy.
- `libs/backend/agent-generation/src/lib/services/orchestrator.service.ts:1286` and `orchestrator.service.spec.ts:1504`: update examples and policy fixtures to active roles. Keep old-name tests that represent historical data.
- `libs/backend/agent-generation/src/lib/services/template-storage.service.ts:228`; `interfaces/template-storage.interface.ts:59`: update template examples to active slugs.
- `libs/backend/agent-generation/src/lib/types/analysis.types.ts:182`, `core.types.ts:37`, `wizard.types.ts:37`: update active examples. Type shapes and legacy parse values stay unchanged.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:650` and `setup-rpc.handlers.spec.ts:955`: remove the four roles from the setup catalog and update expectations.
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts:582`: use active agent slugs for wizard generation fixtures.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:57`, `orchestration-namespace.builder.spec.ts:281`, `system-namespace.builders.ts:406`: recommend phase kinds for built-in QA work and keep explicit user agents in help text.
- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts:114` and `agent-marks.spec.ts:9`: remove retired icons; assert Bot fallback.
- `libs/frontend/onboarding/src/lib/shell/onboarding-announcer.service.ts:5`: use an active agent in the comment.
- `apps/ptah-docs/src/content/docs/agents/agent-orchestration.md:25`, `built-in-agents.md:8`, `cli-agents.md:123`, `index.mdx:12`; `setup/setup-wizard.md:61`; `templates/index.md:6`, `template-storage.md:17`: describe seven active templates, phase kinds, and the origin-store rule for same-name custom agents.

## Checks

- Prettier on every changed batch C file: passed.
- `npx tsc --noEmit --project <project>/tsconfig.lib.json`: passed for shared, agent-generation, rpc-handlers, vscode-lm-tools, chat-ui, onboarding.
- `npx eslint <changed files>`: exit 0. Existing warnings remain. Nx module-boundary rule skipped because no cached ProjectGraph was available.
- Jest: rpc-handlers setup and wizard preview 65/65 passed; agent-generation orchestrator 98/98 passed; vscode-lm-tools namespace specs 50/50 passed.
- Jest: agent-generation recommendation and allowlist 25/27 passed. Two catalog/template parity tests fail while batch D's four template files remain on disk. Rerun after D removes them.
- Jest: chat-ui `agent-marks.spec.ts` could not start. `esbuild` spawn returned `EPERM` twice; zero tests ran.
- `git diff --check` on batch C files: passed.

## Open risks and other batch files

- Batch D owns `libs/backend/agent-generation/templates/agents/{code-logic-reviewer,code-style-reviewer,senior-tester,visual-reviewer}.template.md`. It must remove those four files before the two catalog/template parity tests can pass. I did not edit them.
- Chat UI icon change has no rendered screenshot. The requested lane checks forbid build/serve/dev targets, and no rendered host was available. No Angular template changed; coordinator template typecheck is not needed for this batch.
- Ptah workspace analysis and parent report calls did not return. I used native `rg`, Git, and CLI checks as fallback.
