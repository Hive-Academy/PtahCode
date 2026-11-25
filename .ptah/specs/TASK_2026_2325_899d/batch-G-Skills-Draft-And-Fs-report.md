# Batch G-Skills-Draft-And-Fs report

TASK_2026_2325_899d · W6 · rpc-handlers

## Files changed

All four source and spec paths are under `libs/backend/rpc-handlers/src/lib/`.

- `skills-sh/services/skill-draft-generation.service.ts` adds the draft generation service and validates structured or text model output.
- `skills-sh/services/skill-draft-generation.service.spec.ts` covers Setup resolution, evidence and reason pairing, output parsing, categorized failures, and Preview-to-disk equality with a temporary home.
- `harness/io/harness-fs.service.ts` delegates document construction to the shared serializer and retains the existing directory, write, and mirror behavior.
- `harness/io/harness-fs.service.spec.ts` pins the original output with and without `allowed_tools` and checks that an edited Preview equals the saved file.

## Plan items done

- Lines 161–168 and 273. `generateDraft(params, workspaceRoot?)` uses `resolveSetup(workspaceRoot)` and passes the resulting snapshot directly to `HarnessLlmRunner` for `generate-skills`. It disables tools and MCP, sets three turns and a 60-second runner deadline, and requires the SDK success terminal. Tests exercise the explicit Setup pair and the effective workspace pair returned for unset Setup. Success carries the runner's submitted pair. All six shared failure categories have test coverage and use fixed messages.
- Lines 452–471. The service slugifies the name, trims the description, normalizes the model body once, appends project evidence and its linked Build reasons when the section is absent, and serializes the response. The integrated test sends two leading YAML blocks through generation and the actual filesystem writer, then compares the Preview bytes directly to the saved bytes. The outer block is removed and the inner one remains.
- Lines 166 and 467–471. Compared the serializer against the original writer at HEAD and pinned exact output in actual write tests. The fixtures cover quote and newline escaping, `source: custom`, sanitized tool names, trailing newlines, and a delimiter-prefixed body with and without tools. The edited Preview test passes the edited name, description, and body through the same serializer and writer.

## Checks

```sh
npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath \
  libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.spec.ts \
  libs/backend/rpc-handlers/src/lib/harness/io/harness-fs.service.spec.ts
npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json
npx eslint \
  libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.ts \
  libs/backend/rpc-handlers/src/lib/skills-sh/services/skill-draft-generation.service.spec.ts \
  libs/backend/rpc-handlers/src/lib/harness/io/harness-fs.service.ts \
  libs/backend/rpc-handlers/src/lib/harness/io/harness-fs.service.spec.ts
```

- Jest passed both suites and all 25 tests. Node emitted an ES module load warning for the Jest config. Jest loaded the config and finished successfully.
- TypeScript reported zero errors in the four batch files. It exited 2 with the two known TS2739 errors at `handlers/setup-rpc.handlers.ts:647` and `skills-sh/services/skill-recommendation.service.ts:304`. Both are missing `judge` and `analysisPair` on `WizardRecommendAnalysisSkillsResult`.
- ESLint passed on all four files.
- `ptah_get_diagnostics` scoped to the four files returned unavailable after 45 seconds. The requested native project TypeScript check supplied the diagnostics above.

## Decisions

| Decision | Options considered | Evidence | Reversible |
| --- | --- | --- | --- |
| Parse extracted text JSON when structured output fails schema validation | Trust any structured object or validate and use text as a fallback | Plan line 165 specifies the JSON schema and text fallback. The runner delivers both fields. Tests cover text only and incomplete structured output with valid text. | Yes |
| Use the runner's recorded `pairUsed` for success | Echo the resolved pair or return the runner's submission record | The runner records the submitted pair as used only on SDK success. The draft result requires `pairUsed`. | Yes |
| Test Preview parity with the real writer in the draft spec | Compare two serializer invocations or write the returned draft into a temporary home | Plan line 471 calls for byte equality after exactly one normalization. The integrated test exercises both production paths with the returned name, description, and body. | Yes |

## Open items and needed changes in other groups

- `G-Skills-Rec-And-DI` owns `SKILL_DRAFT_GENERATION_SERVICE`. Register `SkillDraftGenerationService` with that token in the rpc-handlers DI module and expose the class and token through the planned public exports. The class injects `SDK_TOKENS.SDK_WORKSPACE_LLM_RESOLVER` and `HARNESS_TOKENS.LLM_RUNNER`.
- `G-Setup-RPC-Integration` owns the `wizard:generate-skill-draft` handler, allowlist, and Electron integration. Validate and sanitize the incoming payload at that RPC boundary per plan line 165, then call `generateDraft(params, workspaceRoot)` with the validated params.
- Verification here covers the assigned backend code and the writer's real filesystem output. End-to-end RPC and Electron verification belongs to the integration batch.

## Extra reads

- Task carrier, relevant context and batch rows, the supplied plan ranges, and targeted plan references for Setup RPC ownership and DI. Also searched task-description references and checked for a pending handoff. No handoff record was present in this worktree.
- Compared the two filesystem files against HEAD using a read-only diff and read the original writer with `git show`.
- Read the supplied serializer, draft RPC contracts, JSON extractor, and runner contract and implementation. Also read `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` and checked the package export and `harness/tokens.ts` for the existing injection contract.
- Ptah file search returned zero task-folder files. Used `rg --files --hidden` in the known task folder. Skill discovery was unavailable in this lane's tool list. Reviewed the inherited changes directly and made focused revisions in the supplied task worktree.
