# Batches — TASK_2026_2329_7f4a

- **Total batches**: 4 (file-disjoint; Batches 1, 2, 4 parallel, Batch 3 after Batch 1)
- **Total tasks**: 9
- **Plan-validation status**: OK (validated directly against source and existing specs)
- **Worktree**: `/home/amun/ptah-extension/.claude-worktrees/fix-full-auto-yolo-providers-13f62db78c01`
- **Task folder**: `/home/amun/ptah-extension/.claude-worktrees/fix-full-auto-yolo-providers-13f62db78c01/.ptah/specs/TASK_2026_2329_7f4a`
- **Subagent reason**: On the running `/opt/Ptah` host, `codex` fails with `Codex executable does not match the selected executable` and every `ptah-cli` lane spawned from our Antigravity chat is capped to read-only `plan` mode by the Batch 4 bug (`parent-plan`). User approved built-in subagents for implementation + `kimi code` CLI lane for cross-family code-logic review.

---

## Batch 1: ACP / Antigravity Chat YOLO Auto-Approval & `getPermission` — COMPLETE

- **Commits** `a3bc27e9c` and `3ee709f7d`

- **Shape & weight**: 2 Nx projects (`@ptah-extension/provider-session-contracts`, `@ptah-extension/acp-runtime`), 4 files, ~8,000 tokens estimated (actual tokens: unavailable)
- **Dependency & phase**: Independent · Phase 1 (implement)
- **Required Skills**: none
- **Executor**: Built-in subagent (`self`) · **Review family**: `ollama-cloud` (handoff fallback)
- **Write set**:
  - `libs/backend/provider-session-contracts/src/lib/provider-session.types.ts`
  - `libs/backend/acp-runtime/src/lib/acp-provider-session-runtime.ts`
  - `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts`
  - `libs/backend/acp-runtime/src/lib/acp-provider-session-runtime.spec.ts`
- **Deliverable report**: `.ptah/specs/TASK_2026_2329_7f4a/batch-1-report.md`
- **Scoped verify command**: `npm run verify -- -p @ptah-extension/provider-session-contracts,@ptah-extension/acp-runtime`

---

## Batch 2: Codex Runtime YOLO Policy & Child Thread Approvals — COMPLETE

- **Commit** `9cfbd50fb`

- **Shape & weight**: 1 Nx project (`@ptah-extension/codex-runtime`), 4 files, ~9,000 tokens estimated (actual tokens: unavailable)
- **Dependency & phase**: Independent · Phase 1 (implement)
- **Required Skills**: none
- **Executor**: Built-in subagent (`self`) · **Review family**: `ollama-cloud` (handoff fallback)
- **Write set**:
  - `libs/backend/codex-runtime/src/lib/codex-permission-policy.ts`
  - `libs/backend/codex-runtime/src/lib/codex-approval-bridge.ts`
  - `libs/backend/codex-runtime/src/lib/codex-permission-policy.spec.ts`
  - `libs/backend/codex-runtime/src/lib/codex-approval-bridge.spec.ts`
- **Deliverable report**: `.ptah/specs/TASK_2026_2329_7f4a/batch-2-report.md`
- **Scoped verify command**: `npm run verify -- -p @ptah-extension/codex-runtime`

---

## Batch 3: Per-Session Permission Propagation & `config:autopilot-get` Readback — COMPLETE

- **Commit** `3a06182e1`
- **Verification fixture commit** `9243d1742`

- **Shape & weight**: 2 Nx projects (`@ptah-extension/agent-sdk`, `@ptah-extension/rpc-handlers`), 6 files, ~10,000 tokens estimated (actual tokens: unavailable)
- **Dependency & phase**: Depends on Batch 1 (`ProviderSession.getPermission?`) · Phase 1 (implement)
- **Required Skills**: none
- **Executor**: Built-in subagent (`self`) · **Review family**: `ollama-cloud` (handoff fallback)
- **Write set**:
  - `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-session.ts`
  - `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.ts`
  - `libs/backend/agent-sdk/src/lib/codex-app-server/routing-agent-adapter.ts`
  - `libs/backend/rpc-handlers/src/lib/handlers/config-rpc.handlers.ts`
  - `libs/backend/agent-sdk/src/lib/provider-session/provider-session-chat-adapter.spec.ts`
  - `libs/backend/rpc-handlers/src/lib/handlers/config-rpc.handlers.spec.ts`
- **Deliverable report**: `.ptah/specs/TASK_2026_2329_7f4a/batch-3-report.md`
- **Scoped verify command**: `npm run verify -- -p @ptah-extension/agent-sdk,@ptah-extension/rpc-handlers`

---

## Batch 4: Antigravity Parent-Lane Permission & Caller Attribution — COMPLETE

- **Commit** `0749c6db6`

- **Shape & weight**: 2 Nx projects (`@ptah-extension/cli-agent-runtime`, `@ptah-extension/vscode-lm-tools`), 7 files, ~9,500 tokens estimated (actual tokens: unavailable)
- **Dependency & phase**: Independent · Phase 1 (implement)
- **Required Skills**: none
- **Executor**: Built-in subagent (`self`) · **Review family**: `ollama-cloud` (handoff fallback)
- **Write set**:
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.ts`
  - `libs/backend/cli-agent-runtime/src/lib/cli-agents/parent-lane-permission.spec.ts`
  - `libs/backend/cli-agent-runtime/src/lib/di/register-agent-messaging.ts`
  - `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.ts`
  - `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.ts`
  - `libs/backend/vscode-lm-tools/src/lib/code-execution/ptah-api-builder.service.spec.ts`
  - `libs/backend/vscode-lm-tools/src/lib/code-execution/parent-lane-permission.spec.ts`
- **Deliverable report**: `.ptah/specs/TASK_2026_2329_7f4a/batch-4-report.md`
- **Scoped verify command**: `npm run verify -- -p @ptah-extension/cli-agent-runtime,@ptah-extension/vscode-lm-tools`
