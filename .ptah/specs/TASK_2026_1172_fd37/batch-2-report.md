# Batch 2 report

## Files changed

- `libs/shared/src/lib/types/agent-process.types.ts`: optional requested policy and effective policy fields for spawn results and lane records.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts`: retain the caller's requested permission/network on both paths and add the Plan instruction to rival CLI prompts.
- `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-reporting-contract.ts` and new spec: Plan instruction.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts`: retain requested policy for Ptah CLI lanes and add Plan instruction when parent or explicit request says Plan.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts`: assert requested policy reaches the process manager and an explicit Plan prompt contains the instruction.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.ts` and spec: requested/effective permission and network, source labels, Plan notices, native Codex sandbox details.
- `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts`: parent Plan cap response case.

## Tests

- `npx tsc --noEmit --project libs/backend/vscode-lm-tools/tsconfig.lib.json`: pass, 0 errors.
- `npx jest --config libs/backend/vscode-lm-tools/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts`: fail, 2 suites; 0 tests ran. Jest maps `marked` to missing `node_modules/marked/lib/marked.umd.js`.
- `npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json`: pass, 0 errors.
- `npx tsc --noEmit --project libs/shared/tsconfig.lib.json`: pass, 0 errors.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-reporting-contract.spec.ts`: pass, 1 suite, 1 test.
- `ptah_get_diagnostics` for five changed source files: unavailable after 45 seconds; all three library type checks passed separately.
- `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/mcp-response-formatter.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.spec.ts libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-reporting-contract.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-reporting-contract.spec.ts libs/shared/src/lib/types/agent-process.types.ts`: pass, 0 errors, 12 warnings in existing code and unavailable Nx project graph.
- `npx eslint libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.spec.ts`: pass, 0 errors, 1 unavailable Nx project graph warning.

## Sample output

Case b, expected formatter text for a Codex lane with requested `auto-edit`, effective `plan`, and parent Plan cap. The Jest environment error prevented runtime capture. The policy portion of spawn text is:

```text
**Permission:** requested auto-edit -> effective plan (source: Parent plan cap) (Codex sandbox read-only, approvals never)
Capped to plan by the parent session's Plan mode. This lane cannot edit files. Plan refusals are not approval requests: no approval prompt will appear. To allow edits, switch the parent session out of Plan mode, then spawn again.
```

The policy portion of status text is verbatim the same:

```text
**Permission:** requested auto-edit -> effective plan (source: Parent plan cap) (Codex sandbox read-only, approvals never)
Capped to plan by the parent session's Plan mode. This lane cannot edit files. Plan refusals are not approval requests: no approval prompt will appear. To allow edits, switch the parent session out of Plan mode, then spawn again.
```

## Decisions

- Keep explicit caller values separate from the resolver's selected policy, because the resolver replaces permission under the parent Plan cap.
- Preserve Codex yolo as an explicit opt-in and show `danger-full-access` plus approval `never` in reporting, per parent direction.
- Keep policy enforcement unchanged.

## Open issues

- The Ptah CLI task prompt is assembled before the registry returns effective policy. Saved-default Plan cannot be named in that prompt within this write set; spawn/status still show it. Parent or explicit Plan is covered in the prompt.
- Jest verification is blocked by the missing `marked` mapping target. No test assertions ran in those two suites.
- Concurrent lanes changed files outside this batch's write set; this lane did not touch them.

