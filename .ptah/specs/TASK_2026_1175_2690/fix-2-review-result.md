# Fix 2 review result

## N1: wizard origin store

- `libs/backend/harness-sync/src/lib/targets/retired-agent-origin.ts:16` adds one shared origin check. It reads `<harnessRoot>/.ptah/setup-wizard/agent-origins.json`, validates the store, and requires the recorded hash to match both the workspace agent and the source file. Missing, invalid, or unreadable data keeps the agent eligible.
- `libs/backend/agent-generation/src/lib/services/user-layer/user-layer-mirror.service.ts:2339,2494` uses that check for legacy and new scope seeds. `libs/backend/harness-sync/src/lib/targets/workspace-target.ts:455` uses it for sync. These paths no longer read a sidecar beside an agent for retirement.
- Specs: `user-layer-mirror.service.spec.ts:523,558` covers a recorded agent, no entry, changed hash, and unreadable store. `retired-agent-origin.spec.ts` covers the same check. `rival-targets.agent-model.spec.ts:133,185,193` covers sync suppression, changed hash, and unreadable store.
- Open limit: this is a shared function exported by `harness-sync`, with no new DI token or registration. It reads the store format directly because `WizardAgentOriginStore` belongs to `agent-generation`, which already depends on `harness-sync`. The requested DI binding was not added.

## N2: retired base entries

- `libs/backend/harness-sync/src/lib/targets/workspace-target.ts:660` keeps every retired agent base entry in the reap loop, without an origin check.
- Spec: `rival-targets.agent-model.spec.ts:175` removes the source clone and confirms the target copy stays.
- Open risk: none found in the focused spec.

## N3: role wording and decision

- `.ptah/specs/TASK_2026_1175_2690/decisions.md:21` and `step-1-plan.md:167` record option 1 and lane spawn role behavior. `apps/ptah-docs/src/content/docs/agents/built-in-agents.md:38` describes the store and hash rule.
- `libs/backend/cli-agent-runtime/src/lib/roles/agent-role-resolver.service.ts:78` now says `Role "<role>" is retired. Use the "implement" phase instead.` Its spec asserts the retired message.
- Open risk: none found.

## N4: agent overview

- `apps/ptah-docs/src/content/docs/agents/index.mdx:10` now says `such as testing, UI review, or research`.
- Open risk: none found.

## Focused checks

- `npx tsc --noEmit --project libs/backend/harness-sync/tsconfig.lib.json`: pass.
- `npx tsc --noEmit --project libs/backend/agent-generation/tsconfig.lib.json`: pass.
- Focused Jest, `harness-sync` origin and target specs: pass, 2 suites, 12 tests. One intermediate run failed because the test fixture lacked workspace source files; fixed and rerun.
- Focused Jest, `agent-generation` mirror spec: pass, 1 suite, 41 tests.
- Focused Jest, `cli-agent-runtime` resolver spec: pass, 1 suite, 38 tests.
- `npx eslint` on nine changed TypeScript files: exit 0, 0 errors, 7 warnings. Two warnings were unused imports/variables and were fixed after that run; the remaining warnings are existing file size and non-null assertions.
- Skill search found no invocable matching skill. No skill was loaded.
