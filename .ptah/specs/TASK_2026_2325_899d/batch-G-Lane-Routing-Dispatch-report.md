# G-Lane-Routing-Dispatch

## Files changed

All five source and test files are under `libs/backend/lane-routing/src/lib/`.

- `pipeline/phase-plan.ts` adds `OpenedCaller.configuredPair` on the blocked variant.
- `decision-model/decision-caller.ts` captures the configured pair before checking the structured port or resolving the System One target. It supplies the canonical System One provider when it creates a dispatch.
- `pipeline/model-refine.ts` adds the optional `signal` and `onProviderSubmit` inputs to `runFixedRequest` and suppresses aborted or oversized submissions.
- `pipeline/model-call.ts` guards both provider call boundaries and reports the effective pair synchronously before submission. The structured completer receives the caller's abort signal combined with its dispatch timeout.
- `pipeline/model-call.spec.ts` tests immediate callback order, effective pair, byte-cap failure, pre-aborted input, and the final cancellation guard for both provider paths.

## Plan items

- Lines 115–116: preserve the configured pair on all blocked outcomes, including missing structured port, unreachable target, target resolution failure, and missing Jev authentication.
- Lines 399–402: forward cancellation and submission attribution into the two provider boundaries. Oversized payloads retain `payload-too-large` and pre-submission cancellation produces `sent: false` with `cancelled`.
- Lines 264, 343 and 410: keep writes within the five-file assignment. Place the new regressions in the writable `model-call.spec.ts` and run the existing `model-refine.spec.ts` alongside it.

## Checks

Ptah diagnostics scoped to the five changed files reported zero errors and zero warnings after the final edit. Each native check ran through the repository's verify lock using `node scripts/verify.mjs --exec --task <name> -- <command>`.

- `npx jest --config libs/backend/lane-routing/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.spec.ts` passed, with 23 tests across two suites.
- `npx tsc --noEmit --project libs/backend/lane-routing/tsconfig.lib.json` passed.
- `npx eslint libs/backend/lane-routing/src/lib/pipeline/phase-plan.ts libs/backend/lane-routing/src/lib/pipeline/model-call.ts libs/backend/lane-routing/src/lib/pipeline/model-call.spec.ts libs/backend/lane-routing/src/lib/pipeline/model-refine.ts libs/backend/lane-routing/src/lib/decision-model/decision-caller.ts` passed.

## Decisions

- Keep `cancelled` in the opt-in request outcome type. Adding it to the shared routing fallback schema would widen existing routing output. The plan assigns cancellation to fixed requests with an explicit signal, so the no-signal overload retains the original cause type. Reversible.
- Carry the provider already resolved by `DecisionCaller` alongside the effective target model. Legacy System One dispatch fixtures omit a provider and represent Ollama, so the field is additive and the fallback is Ollama. Reversible.
- Combine the per-dispatch structured timeout and the fixed request's caller signal. Replacing the dispatch signal would drop a local timeout. Structured callers without an explicit fixed-request signal keep their original signal. Reversible.
- Use the supplied task worktree and leave branch management and phase review to the orchestration parent. The common brief assigns the existing worktree to concurrent lanes.

## Open items

No remaining implementation or verification items for this batch. The sibling `G-Lane-Routing-SkillCaller` batch owns stage status and category mapping and consumption of the new hook. Independent phase review belongs to the orchestration parent.

## Extra reads

- Read the assigned files' imports, fitting code, and test setup to implement the changes. Inspected relevant symbols and references in `decision-model.types.ts`, `system-one.client.ts`, `compile-reasons.ts`, `route-decide-result.schema.ts`, `preflight-answer.ts`, `phase-resolve.ts`, `route-decide.service.ts`, `scope-check.service.ts`, `decision-model-task-kind-classifier.ts`, `child-setting-router.service.ts` and its spec, `skill-ranking-caller.service.ts` and its spec, and the shared `rpc-skill-judge.types.ts` to verify pair and fallback contracts. Inspected fixed-request fixture references in the assigned check suite `model-refine.spec.ts`.
- Read orchestration and agent-lanes guidance and the backend role's output contract. Inspected the focused Jest config, package and TypeScript settings, and the verify lock wrapper invocation.
- `ptah_search_files` returned zero `AGENTS.md` matches. A scoped `rg --files` fallback also returned no matches.
