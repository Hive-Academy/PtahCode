# Fix round 1 F1 — TASK_2026_2325_899d

## Files changed

- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts`
- `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.spec.ts`
- `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.ts`
- `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.spec.ts`

## Findings and plan references

- **A1** — The harness attaches the snapshot's canonical provider ID to the isolated auth override at `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.ts:176`. The SDK reads the optional field at actual submission and retains hostname inference and the Anthropic default for overrides without an ID. It continues reporting the resolved SDK model. See `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:176` and `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts:506`, implementing plan line 397.
- **C3** — The catch block broadcasts and logs `timed-out` only after submission. Before submission it uses `queue-timed-out` for `InternalQueryQueueTimeoutError` and `pre-dispatch-error` for other failures, including abort. It rethrows the original error. See `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.ts:215`, implementing plan lines 391 and 398.

## Regression specs

- **A1** — Three added SDK cases exercise Ollama Cloud via the shared local daemon, Ollama Cloud direct, and Kimi with a custom base URL. Each checks the submitted pair and the SDK query model and URL. The existing OpenRouter case covers hostname fallback. See `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.spec.ts:1310` and `libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.spec.ts:1334`. The harness spec checks provider ID and credentials for both a resolved workspace and a supplied snapshot at `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.spec.ts:113` and `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.spec.ts:193`.
- **C3** — The deadline regression now expects distinct pre- and post-submission categories and asserts the warning, both completion broadcasts, the attribution record, and handle cleanup. The existing typed queue timeout case covers the queue category and original error. See `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.spec.ts:257` and `libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.spec.ts:275`.

## Checks

The following commands ran sequentially through the shared lock using `node scripts/verify.mjs --exec --task <name> -- <command>`.

- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.spec.ts` passed all 65 tests.
- `npx jest --config libs/backend/rpc-handlers/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.spec.ts` passed all 12 tests.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json` passed.
- `npx tsc --noEmit --project libs/backend/rpc-handlers/tsconfig.lib.json` passed.
- `npx eslint libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.ts libs/backend/agent-sdk/src/lib/helpers/sdk-query-runner.service.spec.ts libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.ts libs/backend/rpc-handlers/src/lib/harness/ai/harness-llm-runner.service.spec.ts` passed.
- Both Jest invocations emitted a Node module-loading warning for their TypeScript config and completed successfully.
- `ptah_get_diagnostics` returned with the four scoped files unchecked after 45 seconds. Its retry reported a 1024 MB compiler memory limit. The two native project typechecks passed.

## Decisions

- **Provider identity carrier.** Options were extending the isolated auth override or adding a dispatch field and plumbing it through both runner inputs. The auth override is already forwarded intact by `internal-query.service.ts:137`, and Setup resolution guarantees isolated auth. The harness spreads the auth object to avoid mutating the shared snapshot. Snapshots that inherit process-wide auth use the SDK's existing inference path. The optional field is additive and reversible.
- **Deadline attribution.** The existing submission marker already distinguishes a started provider request from setup or slot acquisition. Using it in the abort condition preserves the existing typed queue-timeout branch without introducing another error type. The check is reversible.

## Open items and other lanes

No F1 blockers or changes needed from other lanes. Independent re-review belongs to the coordinator.

## Extra reads

- `CLAUDE.md`, the backend role's Method and Output contract, `.claude/skills/orchestration/SKILL.md`, and the executor contract in `.claude/skills/agent-lanes/SKILL.md` for workflow and verification rules.
- Task carrier metadata and `implementation-plan.md` targeted excerpts around lines 386–404 and the coordinator amendment at line 671 (plus targeted searches for review references).
- `libs/backend/agent-sdk/src/lib/auth/workspace-llm-resolver.port.ts` and targeted excerpts in `libs/backend/auth-providers/src/lib/auth/workspace-llm-resolver.ts` for the Setup auth guarantee and workspace fallback. Ptah symbol search returned zero hits for the snapshot type, so `rg` located its definition.
- Targeted provider URL and export searches in the provider entry and provider registry, plus the agent SDK public barrels, for the regression inputs and contract.
- `scripts/verify.mjs` targeted excerpts to confirm its lock-only command path.
