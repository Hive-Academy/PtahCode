# Merge resolution review: 87e113cde

**Verdict: APPROVED** (static review; focused Jest did not complete).

**Findings:** None requiring changes. `agent-process-manager.service.ts:994-996,1274-1285` keeps the flat effective policy, requested policy, and main's phase fields on both spawn paths. The reference persists both policies (`wiring/agent-events.ts:751-752`), restore retains them (`agent-process-manager.service.ts:1847-1848`), and malformed present effective snapshots restore to plan, with Codex network denied (`session-metadata-store.ts:936-951`). Resume reads flat fields (`system-cli-lane-resumer.ts:43-45`); the parent-plan cap and Plan BLOCKED instruction remain (`cli-lane-policy-resolver.ts:73-94`, `lane-reporting-contract.ts:20`, `ptah-cli-registry.ts:962-969`). Main's `phaseKind`, `phase`, `toolProfileApplied`, `laneMcpTokenCapability` export, and `laneToolProfileAdapterResult` import survived. No wrapper-shaped `AgentProcessInfo.effectivePolicy` reader or global YOLO change was found.

**Did the resolution change any permission code path compared with a37e74065 beyond adding main's fields? No.** The resolved D25 permission selection, storage, and resume path is unchanged. Main adds intentional phase tool denials to Claude SDK options and MCP credentials (`claude-sdk-lane-options.ts:240-247`, `lane-mcp-credentials.ts:68-95`); the extracted MCP capability rule preserves the prior CLI mapping (`lane-mcp-token-rule.ts:4-17`).

**Commands and results:**

- `git show 87e113cde --cc --format=medium` — passed; reviewed combined hunks.
- `git diff a37e74065 87e113cde -- libs/backend/cli-agent-runtime libs/backend/vscode-lm-tools libs/backend/agent-sdk libs/shared` — inspected with targeted file diffs and diff stat; no D25 regression found.
- `git diff a37e74065 87e113cde -- libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts` and `git diff a37e74065 87e113cde -- libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/agent-namespace.builder.ts` — passed; checked both conflicted paths.
- `rg -n "requestedPolicy|effectivePolicy|toolProfileAdapter" libs/backend/cli-agent-runtime` — passed; located persistence and policy readers.
- `npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/messaging/lane-resumers/system-cli-lane-resumer.spec.ts` — no result after >1 minute; interrupted (exit 1).
- `git status --short` — passed; no source or spec edits made by this review.

No matching review skill was exposed by the CLI skill mechanism.
