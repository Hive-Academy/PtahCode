# Batch 4 B result

## Files changed

- `libs/shared/src/lib/types/retired-roles.ts:53`: retire `team-leader` in step 4. Alias stays `batch`.
- `libs/shared/src/lib/types/retired-roles.spec.ts:74`: assert exact row and alias.
- `libs/shared/src/lib/types/task-spec.contract.ts:66,503,591,608`: assign current batch ownership to the batch phase. Keep legacy `tasks.md` reads.
- `libs/shared/src/lib/types/task-spec.contract.spec.ts:480,559,589`: assert phase wording.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.ts:50,290,315,333`: route implementation through `batch` and final audit through `completion`.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/orchestration-namespace.builder.spec.ts:288,311,340`: assert batch, completion and legacy read.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/system-namespace.builders.ts:413`: describe phase kinds.

## Checks

- Shared focused Jest, four specs: exit 0; 311 tests passed.
- Vscode-lm-tools focused Jest: exit 0; 18 tests passed.
- Shared lib TypeScript: exit 0.
- Vscode-lm-tools lib TypeScript: first exit 1 for unescaped prompt backticks; fixed; rerun exit 0.
- ESLint on seven changed TypeScript files: exit 0; two existing `preserve-caught-error` warnings at `system-namespace.builders.ts:701,703`. Nx boundary rule skipped due to no cached graph.
- `git diff --check`: exit 0. Other lanes' concurrent files were left intact.

## Breaks for other batches

- `libs/backend/agent-generation/src/lib/services/agent-recommendation.service.spec.ts`: expects sole built-in recommendation `team-leader`; now catalog should be empty.
- `libs/backend/agent-generation/src/lib/services/subagent-tool-allowlist.spec.ts`: retirement filter makes one-template count stale.
- `libs/backend/agent-generation/src/lib/services/template-partial-resolver.spec.ts`: expects coordinator audience for retired template.
- `libs/backend/agent-generation/src/lib/services/template-sharing.guard.spec.ts`: still requires template and return contract.
- `libs/backend/agent-generation/src/lib/services/content-generation.service.spec.ts`: current built-in generation fixtures use retired slug.
- `libs/backend/agent-generation/src/lib/services/orchestrator.service.spec.ts`: current built-in selection fixtures use retired slug.
- `libs/backend/agent-generation/src/lib/services/invocable-plugin-skills.spec.ts`: current agent fixture uses retired slug.
- `libs/backend/rpc-handlers/src/lib/handlers/setup-rpc.handlers.spec.ts`: asserts `team-leader` remains in built-in list.
- `libs/backend/rpc-handlers/src/lib/handlers/skill-synthesis/retired-role-guard.spec.ts`: default guard expects `team-leader` mutable; now rejects it.
- `libs/backend/rpc-handlers/src/lib/handlers/wizard-generation.preview-fidelity.spec.ts`: built-in generation fixtures need custom-agent treatment after catalog retirement.
- `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.spec.ts`: role hint expectations may change. Preserve explicit same-name file read at line 548.
- `libs/frontend/chat-ui/src/lib/atoms/agent-avatar/agent-marks.spec.ts`: includes retired built-in mark.
- `libs/frontend/chat/src/lib/components/organisms/session-inspector/session-task-reader.spec.ts`: historical wording can remain.
- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-agent-scope.spec.ts` and `user-layer-seed-quarantine.spec.ts`: custom same-name/history fixtures must stay readable.

## Extra files read

- Step 4 plan and step 3 lane rules.
- Other-batch specs above, current namespace and task contract source.

## Decisions

- One retired slug has one alias: `team-leader` maps to `batch`. Workflow state selects `completion`.
- Stored `currentAgent: 'team-leader'` remains readable. Routing uses phase, checkpoint and strategy.
- Existing retired-role guard behavior is unchanged. Custom same-name files remain a cross-project integration case.
- No matching coding skill was exposed by the CLI skill mechanism for this contract/routing scope; skill invocation was unavailable.

## Not done

- Other-batch specs were not edited or run. Custom same-name path needs integration verification after batch C.
- No workspace-wide checks, Nx, build, serve, dev, e2e, package, commit or push.

## Needs another batch

- Batch C: update agent-generation and RPC handler files above while preserving custom same-name/history behavior.
- Batch D: update frontend built-in examples and mark.
- Coordinator: verify CLI retirement hints and custom same-name reads after integration.
