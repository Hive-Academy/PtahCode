# Batch 3 C result

## Files changed

- `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.ts:44`: catalog has only `team-leader`.
- `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.spec.ts:45`: assert the active catalog and exclude all six retired roles. Filter retired templates until batch D removes their files.
- `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.ts:63`: keep only the `team-leader` policy.
- `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.spec.ts:35`: test the active policy and retired fallback.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.ts:625`: setup RPC catalog has only `team-leader`.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts:958`: check one active entry and reject retired entries.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:52`: planning invokes `plan`; design invokes `architecture`. `team-leader` stays the implementation agent.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.spec.ts:125`: check phase actions for new, rejected, advancing and missing-document paths.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/system-namespace.builders.ts:382`: system text offers phase kinds for plan, architecture, research, docs and design.
- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.ts:107`: retire six active glyph rows; generic fallback still displays old event types.
- `libs/frontend/onboarding/src/lib/shell/onboarding-announcer.service.ts:5`: use `team-leader` in the example announcement.

## Checks

- Agent-generation, RPC-handlers and vscode-lm-tools `npx tsc --noEmit --project <project>/tsconfig.lib.json`: all passed.
- Agent-generation Jest: `agent-recommendation.service.spec.ts` and `subagent-tool-allowlist.spec.ts`, 15 passed. The recommendation spec passed again after its final assertion, 4 passed.
- RPC-handlers Jest: `setup-rpc.handlers.spec.ts`, 58 passed.
- Vscode-lm-tools Jest: `orchestration-namespace.builder.spec.ts` and `system-namespace.builders.spec.ts`, 52 passed.
- Chat-ui Jest: `agent-marks.spec.ts`, 14 passed.
- `npx eslint` on all changed source and spec files: zero errors. It reported existing warnings and no cached Nx ProjectGraph. Follow-up lint on final edits had zero errors.
- Electron path read: `ElectronSetupWizardService` opens onboarding, and `phase-4-handlers.ts:184` includes `SetupRpcHandlers`. The RPC spec covers catalog response.

## Extra files read

- `step-3-lane-rules.md`, `step-3-plan.md`, and `plugins/ptah-angular/skills/angular-frontend-patterns/SKILL.md`.
- `apps/ptah-electron/src/services/electron-setup-wizard.service.ts` and `apps/ptah-electron/src/di/phase-4-handlers.ts`.
- Step 2 model: `git show --stat HEAD^2` and `git show HEAD^2~1 -- libs/backend/agent-generation/src/lib/services/agent-recommendation.service.ts`.

## Decisions

- `team-leader` is the sole active built-in type. No changed path needs two active built-in types.
- References in `orchestrator.service.spec.ts` describe custom or historical agent records. They stay. Type examples in the interface and core type files are legacy examples, not catalog entries. Same-name skills stay.
- The setup RPC method name and Electron registration stay the same.

## Not done

- No rendered UI screenshot. The lane rules forbid build and serve targets, and no running UI or in-workspace HTML artifact was available. Visual quality was not inferred from tests.

## Needs another batch

- Batch D owns deletion of the six template files and the `template-partial-resolver.ts` special case. This lane did not edit them.
