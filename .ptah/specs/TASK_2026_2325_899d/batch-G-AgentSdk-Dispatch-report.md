# G-AgentSdk-Dispatch report

## Files changed

Under `libs/backend/agent-sdk/src/lib/`:

- `internal-query/internal-query.types.ts`
- `internal-query/internal-query.service.ts`
- `internal-query/internal-query.service.spec.ts`
- `helpers/sdk-query-runner.service.ts`
- `helpers/sdk-query-runner.service.spec.ts`

## Plan items

- Lines 99–109, 241, 260, 342 and 392–398. Added optional
  `onProviderSubmit` to both one-shot inputs. The internal query service
  forwards the callback only after acquiring a slot. It releases the slot
  through its existing error path if the signal is already aborted at handoff.
- Lines 392–398. The SDK runner honors cancellation after option construction.
  The callback receives the canonical provider inferred from the submitted
  auth environment and the effective SDK model. It runs synchronously once,
  inside the launch guard and immediately before `queryFn`.
- Lines 92–96 and 409. The specs pin unchanged submission of a concrete model,
  effective alias resolution, retained caller trace after a deadline abort,
  slot handoff cancellation, queue timeout, option-building failure, and
  the stale Codex launch guard. No changes to SDK failure logs were needed for
  the callback since it reports only the pair.

## Checks

Commands ran from the supplied task worktree. In the commands below,
`b=libs/backend/agent-sdk/src/lib`.

- `ptah_get_diagnostics` scoped to the five changed files reported zero errors
  and zero warnings.
- `npx jest --config libs/backend/agent-sdk/jest.config.ts --runInBand --coverage=false --runTestsByPath "$b/internal-query/internal-query.service.spec.ts" "$b/helpers/sdk-query-runner.service.spec.ts"`
  passed both suites and all 88 tests. Node emitted a warning while loading
  the TypeScript Jest config.
- `npx tsc --noEmit --project libs/backend/agent-sdk/tsconfig.lib.json`
  exited successfully.
- `npx eslint "$b/internal-query/internal-query.types.ts" "$b/internal-query/internal-query.service.ts" "$b/internal-query/internal-query.service.spec.ts" "$b/helpers/sdk-query-runner.service.ts" "$b/helpers/sdk-query-runner.service.spec.ts"`
  exited successfully.

## Decisions

- Put the marker inside the `launch` invocation closure. Placing it before
  `launch` would mark a stale Codex environment as submitted before the existing
  `AuthRequiredError` guard rejected it. This placement is reversible.
- Kept the runner's existing model resolver for general one-shot callers.
  Plan lines 92–96 assign strict Setup validation and the resolver identity
  assertion to `buildSetupProfile`. A blanket SDK guard would reject legitimate
  alias and tier mapping for existing callers. The submission spec confirms
  that a concrete ID passes through unchanged. Validation ownership can be
  revisited with the Setup caller contract.
- Used the existing slot release path and typed gate timeout. A separate
  release path or a replacement queue timer would duplicate the service's
  existing guarantees. This choice is reversible.

## Open items

- `G-Runner-And-Extract` owns writing `stageTrace.pairAttempted` via the callback,
  success-only attribution through `terminal?.kind === 'success'`, and mapping
  `InternalQueryQueueTimeoutError` to `queue-timed-out`. An outer deadline that
  wins before the gate returns its typed timeout cannot use an empty
  `pairAttempted` alone to distinguish a queued request from SDK initialization.
  Use the typed gate timeout for queue attribution and coordinate a slot-state
  observation if the caller needs that distinction when its outer timer wins.
- `G-Setup-Scope-Resolver` owns the `buildSetupProfile` identity assertion at
  plan line 96. The dispatch lane verifies the identity-preserving path and
  continues to support model resolution for existing non-Setup callers.

## Extra reads

- Repository orchestration skill and task `batches.md` for lane ownership.
- `internal-query/internal-query-concurrency-gate.ts`,
  `errors/internal-query-queue-timeout.error.ts` exports,
  `helpers/sdk-query-options-builder.ts`, and `helpers/sdk-model-service.ts`
  for the gate, provider classifier, and existing resolver contract.
- Shared `auth-env.types.ts`, `rpc-skill-judge.types.ts`, and provider registry
  matches for auth environment typing, `ModelPair`, and the direct provider ID.
- The assigned completed stream processor, workspace LLM port, and
  lane-routing submission matches were consulted as input.
