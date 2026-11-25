# Batch B runtime review fixes

## F7

**Confirmed yes.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.ts:228` rebuilt the candidate list after policy resolution and labeled an exhausted default list as a lane refusal. The manager overlays delivery on its own attribution at `libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts:1916`. The adapter could therefore overwrite an intentional omission or send a default that the outcome did not record.

- Changed `agent-process-manager.service.ts:1595`, `cli-adapters/cli-adapter.interface.ts:214`, and `cli-adapters/claude-cli.adapter.ts:229` so Claude validates only the selected effort when the manager has resolved policy. It reports a refusal only when it dropped a concrete effort. Direct adapter callers still resolve configured defaults.
- Added coverage at `cli-adapters/claude-cli.adapter.spec.ts:416` for intentional omission on models with and without usable metadata and for a refused selected effort. The manager test at `agent-process-manager.service.spec.ts:2028` verifies the resolution marker crosses the spawn boundary.

## F8

**Confirmed yes.** The Codex notification handler at `libs/backend/codex-runtime/src/lib/codex-context.ts:542` assigned null when both fields were missing and let a null or blank primary effort mask the alias. The runtime outcome writer at `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:61` passed raw strings to the recorder. The recorder rejects the whole row via `safeParse` and warns at `libs/backend/lane-outcomes/src/lib/lane-outcome-recorder.service.ts:207`. The review described a throw at this step.

- Changed `codex-context.ts:553` to preserve effort on model-only updates, coalesce trimmed aliases, and clear a reported effort when an explicit update has no usable value. Extended `codex-context.spec.ts:897` to cover each case.
- Changed `lane-completion-outcome.ts:30` to trim optional model and effort values, convert blanks to null, and cap model values at 200 and effort values at the shared 32-character limit. Added real recorder and store tests at `lane-completion-outcome.spec.ts:74` for bounded persistence and unknown provenance on blanks.

## F9

**Confirmed yes.** Both adapters had no `laneEfforts()` method. `libs/backend/rpc-handlers/src/lib/services/cli-model-list.service.ts:66` returns unknown in that case, and `libs/backend/lane-routing/src/lib/pipeline/assemble-gate.ts:635` requires an explicit empty fallback list for Cursor and OpenCode. The no-mapper path in `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts:415` labeled explicit requests as fallback refusals.

- Added empty lists in `cli-adapters/cursor-cli.adapter.ts:347` and `cli-adapters/opencode-cli.adapter.ts:429`. The spawn policy now reports `lane-takes-no-effort` for these two lanes without native support.
- Added direct coverage at `cli-adapters/cursor-cli.adapter.spec.ts:140`, `cli-adapters/opencode-cli.adapter.spec.ts:194`, and `lane-spawn-policy.spec.ts:149`.

## F10

**Confirmed yes.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.ts:14` retained failed probes under the same cache key as successful negative results. The SDK launch path around `copilot-sdk.adapter.ts:314` separately probed the version that the manager already had at `agent-process-manager.service.ts:982`.

- Changed `copilot-effort-flag.ts:18` to evict failures while retaining successful negative results. Copilot now requires a successful help exit through `cli-stdout-probe.ts:74`. The manager forwards the detected version at `agent-process-manager.service.ts:1585`, and `copilot-sdk.adapter.ts:315` uses it in the help-probe cache key.
- Added or extended tests at `cli-adapters/copilot-effort-flag.spec.ts:35`, `cli-adapters/cli-stdout-probe.spec.ts:66`, `cli-adapters/copilot-sdk.adapter.spec.ts:1043`, and `agent-process-manager.service.spec.ts:2028`. They cover recovery after failure, cached negative results, nonzero help exits, and version reuse and invalidation.

## F13

**Confirmed yes.** `libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts:112` previously accepted and preserved empty decision model strings, as did the completion path at `libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts:93`.

- The completion writer now records blanks as null. The schema normalizes existing blank values to null so rows already stored with these values remain readable.
- Added coverage at `lane-completion-outcome.spec.ts:98` and `libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.spec.ts:302`.

## F15

**Confirmed yes.** `libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts:628` labeled an empty profile list as fallback support. The underlying ACP session reports unknown in the absence of a native list at `libs/backend/acp-runtime/src/lib/acp-session-runtime.ts:1854`.

- The handle now returns the original report when the profile has no fallback values. Added coverage at `cli-adapters/provider-session/provider-session-lane-handle.spec.ts:2173`.

## Checks

Ptah file search returned zero entries for the hidden task directory. Used `rg --files --hidden --no-ignore` to discover the task files.

`ptah_get_diagnostics` was scoped to all 25 changed TypeScript files. Its 1 GB worker memory limit was exceeded. Used the native project TypeScript commands below.

Interrupted after about three minutes with no suite results (exit 143).
```sh
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-stdout-probe.spec.ts
```

Interrupted after about two minutes with no suite results (exit 143).
```sh
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-stdout-probe.spec.ts
```

Passed (1 targeted test, 325 skipped).
```sh
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts --testNamePattern 'is undefined when neither UI effort nor config is set'
```

Passed (9 suites, 14 targeted tests, 425 skipped).
```sh
npx jest --config libs/backend/cli-agent-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-stdout-probe.spec.ts --testNamePattern 'keeps the spawn policy omission|reports when the Claude transport refuses|stores an outcome even|records blank reported|advertises an empty effort list|has no effort transport|reuses the detected version|evicts a failed probe|caches successful help|discards stdout from failed|reports unknown effort support' --verbose
```

Passed.
```sh
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.lib.json
```

Passed.
```sh
npx tsc --noEmit --project libs/backend/cli-agent-runtime/tsconfig.spec.json
```

Passed (1 suite, 35 tests).
```sh
npx jest --config libs/backend/codex-runtime/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/codex-runtime/src/lib/codex-context.spec.ts
```

Passed.
```sh
npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.lib.json
```

Passed.
```sh
npx tsc --noEmit --project libs/backend/codex-runtime/tsconfig.spec.json
```

Passed (1 suite, 28 tests).
```sh
npx jest --config libs/backend/lane-outcomes/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.spec.ts
```

Passed.
```sh
npx tsc --noEmit --project libs/backend/lane-outcomes/tsconfig.lib.json
```

Passed.
```sh
npx tsc --noEmit --project libs/backend/lane-outcomes/tsconfig.spec.json
```

Passed (0 errors, 48 warnings on existing lines or file-length rules).
```sh
npx eslint libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.ts libs/backend/codex-runtime/src/lib/codex-context.ts libs/backend/lane-outcomes/src/lib/lane-outcome.schema.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-adapter.interface.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-stdout-probe.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/claude-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/agent-process-manager.service.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-completion-outcome.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/lane-spawn-policy.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cursor-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/opencode-cli.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-sdk.adapter.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/copilot-effort-flag.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/provider-session/provider-session-lane-handle.spec.ts libs/backend/codex-runtime/src/lib/codex-context.spec.ts libs/backend/cli-agent-runtime/src/lib/cli-agents/cli-adapters/cli-stdout-probe.spec.ts libs/backend/lane-outcomes/src/lib/store/sqlite-lane-outcome.store.spec.ts
```

## Decisions

- Preserved direct Claude adapter default selection using an optional resolution marker on the existing spawn options. Applying manager-style policy to every direct caller would have changed the tested direct-call contract. Reversible in the adapter and manager.
- Forwarded Copilot's detected version on the existing spawn options instead of adding a second cache or subprocess. The existing detection cache and binary-path/version help key already provide a version boundary. Reversible in the adapter and manager.
- Normalized blank historical decision models at schema parse time. Rejecting them with `.min(1)` would make previously valid rows unreadable. The transform retains the 128-character bound and needs no storage migration. Reversible at the schema boundary.

## Needed outside write set

- F7 needs no change in `choice-evidence.ts` for the confirmed adapter defect. The matrix continues to count explicit lane refusals at `libs/backend/lane-routing/src/lib/matrix/choice-evidence.ts:203`.
- F9 needs no RPC or gate changes. `CliModelListService.effortSupport()` already distinguishes an empty array from an absent method, and the gate already handles both lane IDs.
- Optional F13 follow-up for the lane-routing owner: normalize blank decision IDs at `libs/backend/lane-routing/src/lib/route/route-record.registry.ts:16` if route facts also need the invariant before recording. Persisted outcomes are covered here.

## Not done

- Both unfiltered runs of the selected CLI specs were interrupted after producing no suite results. The 15 targeted CLI regression cases passed. The remaining cases in those specs were not verified by this lane.
- Coordinator-level review and verification remain with the coordinating session. The original batch catalogue records that the host denied `nx-workspace-architect` in skill overrides. This fix batch changes behavior in existing libraries and has no library organization or boundary work.
