# Batch 24 report: Open items from B23 (decision row 39)

Executor: backend-developer (subagent). Worktree `.claude-worktrees/mcp-connector-parity`, branch
`fix/mcp-connector-parity`. Nothing is committed or staged. `libs/backend/agent-sdk` was not
touched. The `sdk-query-options-builder.ts` change in the tree belongs to the parallel batch.

## Item 1: repair-dialog wording for MCP server keys

Behaviour change: the `not-a-path` repair outcome is gone. Nothing can produce it any more,
because no target writes MCP config and so no MCP fragment key (`.mcp.json#github`) can be in the
blocked set. A stale request that names such a key is now refused as `not-blocked`. That
refusal leaves the path untouched, as before, and uses the approved
`HARNESS_REPAIR_REASONS.notBlocked` reason.

Compatibility check: `HarnessRepairOutcome` is an RPC result type only. No zod schema parses it,
and nothing persists it (rg found no other producer or parser). Removing the union member is safe.

Files:

- `libs/shared/src/lib/types/harness-sync.types.ts`: dropped `'not-a-path'` from
  `HarnessRepairOutcome` and removed its doc bullet.
- `libs/shared/src/lib/types/harness-blocked-wording.ts`: dropped `HARNESS_REPAIR_REASONS.notAPath`
  and the repair-dialog approved sentence "A server key inside a config file you also write...".
- `libs/shared/src/lib/types/harness-blocked-wording.spec.ts`: replaced the MCP-key destructive
  rewrite sample with a non-MCP one.
- `libs/backend/harness-sync/src/lib/repair/blocked-repair.service.ts`: removed the
  `isMcpFragmentKey` branch and its import from `refuse`, and documented the `not-blocked` fall-through.
- `libs/backend/harness-sync/src/lib/repair/blocked-repair.service.spec.ts`: the stale MCP-key
  case now asserts `not-blocked` + `notBlocked` reason, `repaired: 0`, `health: null`, file untouched.
- `libs/frontend/marketplace/src/lib/harness/harness-repair-dialog.component.ts`: dropped the
  `'not-a-path'` outcome text and rewrote the "What it does not re-implement" doc.
- `libs/frontend/marketplace/src/lib/harness/harness-repair-dialog.spec.ts`: removed the
  `not-a-path` row from the all-reasons wording pin. The "refusal in plain language" case now uses
  a `not-blocked` row.

## Item 2: linked worktree Installed tab

Behaviour change: `McpInstallService.listDeclarations` / `listInstalled` add the main checkout's
workspace intent rows when the root is a linked git worktree. The main checkout is resolved with
the same `worktreeMainRoot` (`cli-agents/git-main-checkout-root.ts`) that
`GatewayServerSources.resolve` uses, with the same `main === root -> null` rule. The rows follow
the worktree's own rows. Each one is `origin: 'ptah-intent'`, `scope: 'workspace'`,
`managedByPtah: true` and `removal: 'none'`, with a `removalBlockedReason` that names the main
checkout ("Open that folder in Ptah to remove it."). An uninstall from the worktree cannot drop
the main checkout's record, so the row offers no delete button there. A global intent is still
listed once.

Files:

- `libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.ts`: new option
  `mainCheckoutRoot` (spec seam, defaults to `worktreeMainRoot`), `readIntentRows` split into
  `workspaceIntentRows` / `intentRowsFor` / `mainCheckoutOf`, plus `mainCheckoutRemovalReason`.
  The header doc is updated.
- `libs/backend/cli-agent-runtime/src/lib/mcp-directory/mcp-install.service.spec.ts`: 4 new cases
  under "linked git worktree (#1469)". They cover the order and removal of the main rows, the
  same rows in `listDeclarations`, no extra rows outside a worktree (the main checkout lists its
  own once, as removable), and a global row listed once.

## Item 3: unused persistent reconcile family

The family is in vscode-lm-tools `mcp-http/mcp-caller-token-registry.ts`, not in harness-sync as
the brief said. The B23 report names it there. rg over `libs/` and `apps/` found
`issuePersistent`, `preparePersistent` and `reconcilePersistent` only in that file and its spec.
There is no production caller.

Removed: the three methods and the helpers and types only they used (`PersistentSlotInput`,
`PersistentReconcileResult`, `PreparedPersistentCredential`, `toPersistent`, `writeCapability`).
Kept: the methods that still have production callers. They are `revokePersistent`
(`http-mcp-server.service.ts:457`), `applyExternalCallerAccess` and `clampExternalCallerAccess`.
Stored records still load from state and authorize, so old slot records keep working until they
are retired. The header doc and one stale comment are updated. The file went from 623 to about
420 lines.

Spec (`mcp-caller-token-registry.spec.ts`): the new `seedPersistent` helper writes the records
an older host left in state. The persistent cases that remain are rebuilt on it:
recorder-compatible principal, digest auth and hash-only storage, never privileged while
read-only nor for home, downgrade/upgrade, failed downgrade clamps all, failed upgrade stays
read-only, legacy warnings per stored slot, fail closed after restart, downgrade beats an in-flight
upgrade, and the three `revokePersistent` cases. Five cases that only tested prepare/commit or
reconcile semantics were dropped: file-token preserve, unknown-token replacement, staged commit
failure, the registration overlap and the matching-token race.

## Item 4: `listInstalledMcpServers()` lists Ptah install intents

Behaviour change: `ptah.harness.listInstalledMcpServers()` (and `ptah_harness_list_installed_mcp`)
returns the `.vscode/mcp.json` and `.mcp.json` rows as before. After them it adds the
`origin: 'ptah-intent'` rows from the injected installer's `listInstalled(workspaceRoot)`,
which is the same data as the Installed tab. These rows are grouped per server and source and
carry a `targets` array. `source` is `'ptah-intent (global)'`, `'ptah-intent (workspace)'` or
`'ptah-intent (main checkout)'` (a workspace row with no Ptah removal, from item 2). Harness-config
rows from the installer are skipped, so the files are not listed twice. If the installer fails,
the failure is logged and the file rows are still returned.

Wiring: `HarnessMcpInstaller` gains an optional `listInstalled?`. The production
`McpInstallService` in `ptah-api-builder.service.ts` already satisfies it, so no wiring change was
needed. It is optional so that install-only mocks still compile.

Files:

- CREATED `libs/backend/vscode-lm-tools/src/lib/code-execution/namespace-builders/harness-installed-mcp-servers.ts`:
  the list logic, moved out of the 1226-line builder. Its catches carry `degradation-audit: reported` markers.
- `.../namespace-builders/harness-namespace.builder.ts`: delegates to the new module, adds
  `HarnessMcpInstaller.listInstalled?`, changes the return type to `HarnessInstalledMcpServer[]`,
  and drops the unused `readFile` import (net about -70 lines).
- `.../namespace-builders/harness-namespace.builder.spec.ts`: 2 new cases. One checks the grouped
  intent rows with sources and targets after the file rows, with harness-config rows skipped.
  The other checks that an installer failure still lists the files and logs.
- `.../mcp-core/tool-description.builder.ts`: new `ptah_harness_list_installed_mcp` description.
- `.../namespace-builders/system-namespace.builders.ts`: new help-doc line.
- The effective-tool-list snapshot did not change. It hashes the input schema, which stayed the same, and its 4 snapshots pass.

## Checks (all under `node scripts/verify.mjs --exec --task b24`; logs in `.ptah/tmp/b24-*.log`)

- `npx tsc --noEmit --project <p>/tsconfig.lib.json`: exit 0 for shared, harness-sync,
  cli-agent-runtime, vscode-lm-tools and marketplace.
- `npx eslint <16 changed files + new file>`: exit 0, 0 errors. The 4 warnings are all old:
  `max-lines` on `tool-description.builder.ts` (2080) and `harness-namespace.builder.ts` (857,
  down from more), and `preserve-caught-error` in `system-namespace.builders.ts:738,740`
  (lines this batch did not touch). `mcp-install.service.ts` raised no max-lines warning.
- Jest (`--runInBand --coverage=false --runTestsByPath`):
  - shared `harness-blocked-wording.spec.ts`: 33 passed.
  - harness-sync `blocked-repair.service.spec.ts`: 26 passed.
  - cli-agent-runtime `mcp-install.service.spec.ts`: 73 passed. The first run failed 3 new
    cases because the fixture roots resolved up to `tmp/.ptah`. Each fixture root now gets its
    own `.ptah` marker.
  - vscode-lm-tools `mcp-caller-token-registry.spec.ts`, `harness-namespace.builder.spec.ts`,
    `effective-tool-list.spec.ts`, `system-namespace.builders.spec.ts`: 143 passed, 4 snapshots passed.
  - marketplace `harness-repair-dialog.spec.ts`: 42 passed.
- Not run: the spec tsconfigs (`tsc -p tsconfig.spec.json`), `typecheck-templates` (no template
  changed, only a TS constant in the dialog), di-lint and the degradation-audit ratchet. The
  coordinator's gate covers these.

## Decisions

- Item 1: remove `not-a-path` instead of keeping it as dead compatibility. Options were to keep
  the outcome but reword it, or to remove it. Evidence: no producer remains, and no schema or
  store parses the type. Reversible.
- Item 2: main-checkout rows are listed with `removal: 'none'` and a reason. The other option was
  `ptah-managed`, but then a delete would be a silent no-op from the worktree, because `uninstall`
  only drops the worktree's own and global records. Reversible.
- Item 3: the family lives in vscode-lm-tools, not harness-sync. The B23 report and rg both put it
  there. Only the three named methods and their sole helpers were removed.
- Item 4: read the intents through the injected installer's `listInstalled`, not a new intent
  store dependency. This reuses the existing `mcpInstaller` dependency and the Installed-tab rows,
  so item 2's worktree rows show up here too.

## Left open / out of scope

- `isMcpFragmentKey` (harness-sync `targets/mcp/mcp-facet.port.ts`, exported from the barrel) has
  no caller in `libs/` or `apps/` now. It was left in place because it is a public export and not
  part of this batch's items.
- The recorded grok fixture `acp-runtime/src/lib/__fixtures__/grok-p1-ptah-mcp-search-use-tool.ndjson`
  still carries the old tool description. It is recorded wire data, so it was left unchanged.
- After item 3, nothing mints a persistent slot token. The persistent store now only loads,
  re-scopes and retires old records. Removing the store entirely would be a separate follow-up.
