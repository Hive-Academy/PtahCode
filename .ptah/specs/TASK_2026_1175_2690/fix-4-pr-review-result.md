# PR review fix 4 result

## F1: lane role resolution

- Boundary: `cli-agent-runtime` and `harness-sync` both have `scope:extension` and `type:feature`. The ESLint module rules permit feature to feature and extension to extension imports. The resolver already imported `harness-sync`, and `harness-sync` has no import of `cli-agent-runtime`; this change adds no dependency cycle.
- Change: `agent-role-resolver.service.ts:50-56,72-90,163-173` checks `isRetiredPtahAgent` with the resolved harness root and `.claude/agents/<slug>.md`. Only an unchanged wizard agent is hidden and rejected. The rejection keeps the `implement` hint.
- Specs: `agent-role-resolver.service.spec.ts:248-303` covers all three wizard slugs, no origin entry, and hash mismatch. Existing active role specs remain green. Focused Jest: 40 passed.
- Open risk: The origin check reads the real workspace files. A virtual file provider without a matching disk file cannot prove wizard ownership and therefore exposes the role.

## F2: provider copy reaping

- Boundary: no new library import. `workspace-target.ts` uses the existing local origin helper.
- Change: `workspace-target.ts:269-276,654-681` passes the resolved workspace root into removal planning and keeps a retired provider copy only when the workspace agent file matches the wizard origin hash.
- Specs: `rival-targets.agent-model.spec.ts:240-281` covers a recorded wizard agent after its clone is removed, a custom agent without an origin entry, and a changed workspace hash. Focused Jest: 10 passed.
- Open risk: none identified in the focused paths.

## Docs and checks

- `decisions.md:21`, `step-1-plan.md:167`, and `built-in-agents.md:38-39` now state the origin-based lane and provider-copy behavior. Routing still maps the retired slugs to `implement`.
- `npx prettier --write` completed for all seven changed source, spec, and documentation files.
- `npx tsc --noEmit --project` passed for `cli-agent-runtime` and `harness-sync`.
- `npx eslint` on four changed TypeScript files passed with zero errors. It reported the existing `max-lines` warning in `workspace-target.ts` (825 lines, limit 700).
