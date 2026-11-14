# Step 0b lane briefs (written 2026-11-14, not started)

Start these lanes only after PR 1267 (step 0a) merges into `main` (plan §5, decision P4-12).
The coordinator puts the worktree path of the 0b branch into each spawn as `workingDirectory`
and into the text where this file says `<WORKTREE>`. Each lane gets the "Common rules" block
and its own batch block, as one self-contained prompt.

Executors (plan §5): 0b-1 Claude Api, 0b-2 codex, 0b-3 Claude Api. The reviewer of each batch is
from the other family. Check `ptah_agent_list` before each spawn. Never use a lane at its limit.
At most 3 lanes run at one time.

File ownership (the batches are file-disjoint):

| Batch | Owns | Must not edit |
| --- | --- | --- |
| 0b-1 | `libs/backend/skill-synthesis/**`, `libs/backend/rpc-handlers/src/lib/handlers/skills-synthesis-rpc.handlers.ts` and its `skill-synthesis/` helpers, `libs/frontend/skill-synthesis-ui/**`, the skill clone RPC types in `libs/shared` (`rpc-skill-clone.types.ts` or the file that defines the enhance, snapshot-body and revert params) | `libs/backend/lane-routing/**`, `plugins/**`, `.claude/skills/**`, `scripts/validate-orchestration-skill.ts`, `libs/shared/src/lib/types/rpc.types.ts`, `libs/backend/vscode-lm-tools/**`, the DI guard specs |
| 0b-2 | `libs/backend/lane-routing/**`, `libs/shared/src/lib/types/phase-contract.types.ts`, `libs/shared/src/lib/types/phase-dispatch.schema.ts`, `plugins/ptah-core/skills/orchestration/phases/*.md`, `.claude/skills/orchestration/phases/*.md`, `scripts/validate-orchestration-skill.ts` | `libs/backend/skill-synthesis/**`, `libs/frontend/**`, `libs/shared/src/lib/types/rpc.types.ts`, `libs/backend/vscode-lm-tools/**`, the DI guard specs |
| 0b-3 | `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/effective-tool-list.spec.ts` and its `__snapshots__/` file, the new usage RPC handler file under `libs/backend/rpc-handlers/src/lib/handlers/`, `libs/shared/src/lib/types/rpc.types.ts`, the RPC registration and allowlist, the DI and RPC guard specs (`apps/ptah-electron/src/di/rpc-surface.spec.ts`, `apps/ptah-electron/src/di/expected-resolvable.ts`, `libs/backend/cli-engine/src/lib/rpc/rpc-surface.spec.ts`, the VS Code equivalents, `container.smoke.spec.ts`, `surface-composition.spec.ts` where they list RPC methods) | `libs/backend/skill-synthesis/**`, `skills-synthesis-rpc.handlers.ts`, `libs/frontend/**`, `libs/backend/lane-routing/**`, `plugins/**`, `.claude/skills/**` |

If a batch needs a file that another batch owns, the lane stops that part and names the file in
its result. It does not edit the file.

## Common rules (copy into each brief)

- Work only in `<WORKTREE>`. Read `CLAUDE.md` there first.
- Write the deliverable before the last verify run. Lane budget: 90 minutes.
- Do not commit, push, open a pull request, merge or rebase. The coordinator does that.
- Not authorized: force push, history rewrite, branch deletion, worktree removal, bare git stash.
  Never `git checkout -- <path>`, `git restore`, `git reset`, `git stash`, `git clean`.
- Never stop a process by name (`Stop-Process -Name`, `taskkill /IM`, `pkill`). Stop only your
  own PIDs.
- If a permission denies an action, stop it and report it in the deliverable. Never go around it.
- Do not set environment variables in commands.
- Public repository: no home paths with a user name and no personal data in any file.
- Checks: do not run `npm run verify` or `nx`. Run only focused checks:
  - `node scripts/verify.mjs --exec --task <name> -- npx jest --config <project>/jest.config.ts --runInBand --coverage=false --runTestsByPath <specs>`
  - `npx tsc --noEmit --project <tsconfig>`
  - `npx eslint <changed files>`
  If a check is denied, write that in the deliverable. The coordinator runs the gate.
- Never run `build`, `serve`, `dev`, `e2e` or `package` targets. Do not start the app.
- Code rules: strict TypeScript, no `any`, no `@ts-ignore`, no `as unknown as X`. Zod at each
  boundary. Typed `RpcUserError` with an UPPER_SNAKE code. Injected `Logger`, no `console.*` in
  libs. Do not swallow errors. Import only from a lib's public `src/index.ts` alias. Specs that
  import tsyringe code start with `import 'reflect-metadata';`.
- Role census: `npx ts-node --transpile-only tools/role-census/check-role-census.ts` must exit 0.
  Never use `--update` and never edit `tools/role-census/baseline.json`. New specs read role
  slugs from `ROLE_PHASE_ALIASES` (`@ptah-extension/shared`); they do not write a slug literal.
- Degradation audit (`npx ts-node --transpile-only tools/degradation-audit/check-degradation.ts`)
  and ui-class audit (`npx ts-node --transpile-only tools/ui-class-audit/check-ui-classes.ts`)
  must exit 0 with no baseline edit. UI code uses `@ptah-extension/ui` parts (for example the
  `ptahBadge` directive), never raw DaisyUI component classes.
- Electron first. The renderer is `apps/ptah-extension-webview`.
- Deliverable: `.ptah/specs/TASK_2026_1175_2690/batch-0b-<n>-result.md` with these sections:
  Changed files, Decisions and assumptions, Checks (command and result, or "denied"), Not done,
  Risks for the coordinator.

## Batch 0b-1: learning on phase files

Read first: `implementation-plan.md` §2 "U-D13 (1)" and `skills-learning-locations.md` (both in
`.ptah/specs/TASK_2026_1175_2690/`). The line numbers there are from the plan date. Confirm them.

1. Add an optional `file` argument to the enhance, snapshot-body and revert RPCs for kind
   `skill`. Accepted values: `SKILL.md` (the default) or `phases/<kind>.md`, with `<kind>` in
   `PHASE_KINDS`. Parse it with Zod. Check the resolved path with `isInsideRoot`. Refuse any
   other value with a typed `RpcUserError`. Kinds `agent` and `command` refuse a `file` argument.
2. `skill-enhancer.service.ts` resolves the body target from this argument.
3. Before an enhance applies to a phase file, run `resolvePhaseDefinition` on the new text. Find
   it through the public alias of `lane-routing`. If `skill-synthesis` may not import
   `lane-routing` (check the Nx tags and `ptah_get_dependencies`), stop and name the blocker. Do
   not copy the resolver. A parse failure refuses the apply and keeps the old file.
4. Snapshots stay folder-wide. A revert of one phase file restores only that file from the
   snapshot.
5. Rebase to upstream and keep mine call the same provider re-sync that enhance and revert call
   (gap 5 in `skills-learning-locations.md`).
6. UI (Electron first): the clone drawer of a skill that has a `phases/` folder lists the phase
   files. Each row has enhance, history and revert. Keep the retired-role guard of step 0a.
   OnPush, signals, `input()`/`output()`, `inject()`.
7. Specs: the `file` parse (accepted and refused values, path escape), the enhance refusal on a
   bad phase text, the one-file revert, the re-sync after rebase and keep mine, the drawer rows.

## Batch 0b-2: machine capability field

Read first: `phase2-handover.md` §1 and `implementation-plan.md` §3 (row §1).

Fact to respect: `PhaseDefinitionV1` (`libs/shared/src/lib/types/phase-contract.types.ts`)
already has `requiredCapabilities: readonly string[]`. It is prose, and
`phase-dispatch.schema.ts` requires at least one entry. Do not reuse it for machine tokens.

1. Add an optional field `machineCapabilities` (values from `MACHINE_CAPABILITIES` in
   `lane-routing`, first value `browser`, default `[]`) to the phase definition contract. Bump
   the serialized contract to version 2. Version 1 stays readable and reads as `[]`. If the
   vocabulary must move to `libs/shared` so the contract can name it, move it and re-export it
   from `lane-routing`.
2. Fill the field in the 12 phase files under `plugins/ptah-core/skills/orchestration/phases/`:
   `visual-review` and `design` get `[browser]`, the others get `[]` or omit it (choose one and
   state it). Copy the result to `.claude/skills/orchestration/phases/`. The two folders must be
   byte-identical (`diff -r plugins/ptah-core/skills/orchestration .claude/skills/orchestration`).
3. `resolvePhaseDefinition` parses the field strictly. An unknown token is an error.
4. The route request producer (`phase-plan.ts` and the code that builds the route request) sends
   the parsed list.
5. Remove the default table in `libs/backend/lane-routing/src/lib/ranking/capability.ts`
   (`requiredCapabilities`). Callers (`candidate-tools.ts`, `hard-constraints.ts`) use the list
   from the phase. Behavior for `visual-review` and `design` stays the same.
6. Update `scripts/validate-orchestration-skill.ts` for the field. Run `npm run validate-skill`
   and `npm run manifest:check`. If `manifest:check` fails because the skill files changed,
   report the exact message. Do not edit a manifest by hand unless the message says how.
7. Specs: version 1 and version 2 parse, an unknown token refusal, the route request carries the
   list, `visual-review` still requires `browser`, a pin to a candidate with no browser tools
   names the missing capability.

## Batch 0b-3: snapshot check and usage totals RPC

Read first: `phase2-handover.md` §3.3 and `implementation-plan.md` §3 (rows §3.3).

1. In `libs/backend/vscode-lm-tools/src/lib/code-execution/mcp-core/effective-tool-list.spec.ts`,
   replace the full-definition snapshot (about 8168 lines) with an ordered list of tool names
   plus one schema hash for each tool. Delete the old entries from the `.snap` file and write the
   new snapshot with `-u` on this spec only. The new check must still fail when a tool is added,
   removed, reordered or when its schema changes.
2. Add a read-only RPC `usage:getDimensionTotals` over `getUsageDimensionTotals`
   (`libs/backend/persistence-sqlite/src/lib/session-store/session-stats-repository.ts`). Params
   are parsed with Zod (`sessionId`, non-empty). Put the handler in its own file under
   `libs/backend/rpc-handlers/src/lib/handlers/` (find the existing `usage` handlers first and
   follow them). Add the method to `libs/shared/src/lib/types/rpc.types.ts`, to the allowlist
   (`ALLOWED_METHOD_PREFIXES`) only if the prefix is not there, and to the registration.
3. Update every DI and RPC guard spec that lists RPC methods (Electron, VS Code, CLI). Find them
   with a search for an existing `usage:` method name.
4. No UI.
5. Specs: the handler (valid params, bad params, an empty result), and the guard specs.
