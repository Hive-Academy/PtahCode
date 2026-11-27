## Sources

- Codex / gpt-6-luna: `C:\Users\<user>\.ptah\state\sessions\55e623e6-6b9e-4d7e-a028-0439eed723c3\agent-output.03a54af7-44c4-4a39-b589-ecbfb749b6b6.json`. The journal has 23 `tool-call` segments; it has no `streamEvents` array. The matching Codex rollout is `C:\Users\<user>\.codex\sessions\2026\11\26\rollout-2026-11-26T23-22-50-01a219bd-5bf8-7570-bf09-57146176fada.jsonl`; counts use the journal segments.
- Antigravity / gemini-4-hydrogen-high: `C:\Users\<user>\.ptah\state\sessions\55e623e6-6b9e-4d7e-a028-0439eed723c3\agent-output.25281fb8-3d47-4462-882a-d5f691868e92.json`; counts use its 49 `tool-call` segments.
- Count gaps: Codex 0 (23 counted vs 23 reported); Antigravity 0 (49 vs 49). Counts use one saved tool-call segment per call. Tool results are not counted as calls.

## Results

| Lane | Total | Ptah | Native | Ptah share | Ptah errors | Discovery calls | Calls before first Ptah success | Substitutable native |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| codex / gpt-6-luna | 23 | 17 | 6 | 73.91% | 1 | 1 | 0 | 3 |
| antigravity / gemini-4-hydrogen-high | 49 | 7 | 42 | 14.29% | 0 | 7 | 0 | 33 |

Discovery calls are Ptah file or symbol search calls. Ptah share is Ptah calls divided by all calls. `other` calls are not included in substitutable-native counts.

## Native calls

Q attribution is `unknown` unless the tool target identifies a probe question directly. Shell commands are represented by the class and first command word only; no command text, file content, or prompt text is reproduced.

### Codex

| Native call(s) | Class | Ptah substitute | Probe question |
| --- | --- | --- | --- |
| 2 × Run (`Get-ChildItem`) | text-search | `ptah_grep` | unknown |
| 1 × Run (`Bash`) | path-listing | `ptah_search_files` | unknown |
| 2 × Run (`git`) | git-read | none | unknown |
| 1 × Run (`Bash`) | git-read | none | unknown |

### Antigravity

| Native call(s) | Class | Ptah substitute | Probe question |
| --- | --- | --- | --- |
| `node_modules/zod/package.json` | file-read | `ptah_read_symbol` | Q5 |
| `libs/shared/src/lib/tool-guidance/tool-substitutions.ts` × 2 | file-read | `ptah_read_symbol` | Q5 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.ts` × 2 | file-read | `ptah_read_symbol` | Q1 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.limits.ts` | file-read | `ptah_read_symbol` | Q1 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.ts` × 2 | file-read | `ptah_read_symbol` | Q2 |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.ts` | file-read | `ptah_read_symbol` | Q3 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-workspace-path.ts` | file-read | `ptah_read_symbol` | Q2 |
| `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.utils.spec.ts` | file-read | `ptah_read_symbol` | Q3 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.ts` | file-read | `ptah_read_symbol` | unknown |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep-engine.ts` | file-read | `ptah_read_symbol` | Q2 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.limits.ts` | file-read | `ptah_read_symbol` | Q2 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tool-handlers.ts` | file-read | `ptah_read_symbol` | Q1 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/route-tools.ts` | file-read | `ptah_read_symbol` | Q1 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/read-symbol.spec.ts` | file-read | `ptah_read_symbol` | Q1 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep.spec.ts` | file-read | `ptah_read_symbol` | Q2 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/grep-inline.spec.ts` | file-read | `ptah_read_symbol` | Q2 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/nav/nav-symbols.spec.ts` | file-read | `ptah_read_symbol` | unknown |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-description.builder.ts` | file-read | `ptah_read_symbol` | Q1 |
| `C:/Users/<user>/.gemini/antigravity-cli/brain/a7f481d6-1b10-4fc5-9218-5810884ef68f/.system_generated/tasks/task-47.log` | file-read | `ptah_read_symbol` | unknown |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/protocol-dispatcher.ts` | file-read | `ptah_read_symbol` | Q1 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/effective-tool-list.ts` | file-read | `ptah_read_symbol` | Q1 |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/tool-result-budget.ts` | file-read | `ptah_read_symbol` | unknown |
| `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/code-namespace.builder.ts` | file-read | `ptah_read_symbol` | Q1 |
| 3 × Run (`git`) | text-search | `ptah_grep` | unknown |
| 3 × Run (`Select-String`) | text-search | `ptah_grep` | Q2 |
| 1 × Run (`git`) | path-listing | `ptah_search_files` | Q4 |
| 1 × Run (`git`) | git-read | none | Q4 |
| 8 × Run (`manage_task`) | other | none | unknown |

## Ptah errors

- Codex: `mcp__ptah__ptah_read_symbol` — Error (1).
- Antigravity: none (0).

## How to re-run

From the task folder, run these exact commands after replacing the IDs:

```powershell
node measure/count-lane-calls.mjs --agent <newCodexPtahAgentId> --session <newCodexCliSessionId> --vendor codex
node measure/count-lane-calls.mjs --agent <newAntigravityPtahAgentId> --session <newAntigravityCliSessionId> --vendor antigravity
```

The script reads the Ptah saved output journal under `%USERPROFILE%\.ptah\state\sessions` (or the Ptah app-data state directory) and prints one JSON object. It fails with a message if the agent output or tool-call data is missing.

## Not measured

- Tool-call latency, duration, or cost.
- Answer quality or correctness.
- Reliable Q1–Q5 attribution for calls marked `unknown`.

