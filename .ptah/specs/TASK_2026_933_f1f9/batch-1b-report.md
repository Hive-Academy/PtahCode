# Batch 1b report: provider-neutral harness seed prompts

## Changed files
- libs/backend/rpc-handlers/src/lib/harness/harness-constants.ts
- libs/backend/rpc-handlers/src/lib/harness/harness-constants.spec.ts
- libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.ts
- libs/backend/rpc-handlers/src/lib/harness/ai/harness-workflow-prompt.service.spec.ts

## Wording changes
- new-project step: "using the AskUserQuestion tool" -> "using your question tool for asking the user"
- configure-harness planning block: "use your Read, Glob, and Grep tools to find" -> "use your file reading and searching tools to find"
- Specs: replaced the `AskUserQuestion` assertion with `your question tool`; added "no Claude-only tool" tests for new-project and for both configure-harness variants (empty and non-empty workspace).

## Verify result
Command: `npm run verify -- -p @ptah-extension/rpc-handlers`
- lint+typecheck: "1 task: 1 succeeded"
- test: "1 task: 1 succeeded" (Nx flagged the test task as flaky, 8m 15s), "lock released after 590.9s, exit code 0"
- The first run was killed by the tool's background time limit (output lost to the pipe), so it was rerun once.

## Not done
- The plan's "remove references to the live preview sidebar" and "Apply to Workspace card" wording was not applied: neither prompt mentions the sidebar today.
- `.claude/skills/` etc. in the "What Apply Writes" block are factual output paths (spec-asserted) and were left unchanged.
- content-manifest.json: not checked or regenerated. If it hashes these files, it needs a refresh.
