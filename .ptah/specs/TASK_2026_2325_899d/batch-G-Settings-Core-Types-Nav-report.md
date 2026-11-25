# Batch report — G-Settings-Core-Types-Nav (W9)

## Files changed

- `libs/frontend/core/src/lib/services/app-state.service.ts` (M): added `'setup'` to the
  `PendingSettingsTab.section` union (now `:130-142`), placed after `'background-models'`
  because the Setup row lives in Settings "Background models".
- `libs/frontend/core/src/lib/services/app-state.service.spec.ts` (M): two new tests in the
  `openSettingsTab` describe — "keeps a setup deep link as a pending Settings request" and
  "keeps an existing section deep link unchanged".
- `libs/frontend/core/src/lib/services/providers-settings.types.ts` (M): imported
  `ModelPair` and `SetupPairState` from `@ptah-extension/shared` (shared W1 exports verified:
  `rpc.types.ts:128` re-exports `rpc-skill-judge.types.ts`; `libs/shared/src/index.ts:19`).
  Added `ProvidersSetupRowState` and `ProvidersSetupUndoEntry`, exported where neighbor types
  are exported. No `any`.

## Plan items done

- Plan section 8 (implementation-plan.md:169-174), deep-link bullet: `'setup'` added to
  `PendingSettingsTab.section`. The gate named `app-state.service.ts:126-142` is this union
  itself — `requestSettingsTab` stores the target verbatim (`app-state.service.ts:1458-1460`)
  and `consumePendingSettingsTab` returns it (`:1478-1484`); core has no other runtime filter.
- Revision 3 split (implementation-plan.md:341): `providers-settings.types.ts` now hosts the
  Setup row and Undo types for `G-Settings-Core-Commit-State` and `G-Settings-UI`:
  - `ProvidersSetupRowState` — `{ state: SetupPairState; committed: ModelPair | null;
    commitSeq: number }`, the `wizard:get-setup-model` read plus the last applied
    `wizard:set-setup-model` receipt (plan 3.2, lines 369-375).
  - `ProvidersSetupUndoEntry` — `{ targetPair: ModelPair | null; committedReceipt:
    ModelPair | null; commitSeq: number }`, the exact `undoEntry` shape plan 3.2 line 375
    names; `targetPair: null` means prior state Unset (empty/empty sent on Undo).
- R13/F27 (implementation-plan.md:572), part naming `app-state.service`: the deep link
  `{ tab: 'providers', section: 'setup' }` is now an accepted `PendingSettingsTab`, so the
  recovery actions "Choose a provider" / "Choose a model" / "Sign in" can raise it. The
  click handlers themselves live in `analyze-skills.page.ts` (G-Onb-Pages).

## Check commands and results

- `npx jest --config libs/frontend/core/jest.config.ts --runInBand --coverage=false
  --runTestsByPath libs/frontend/core/src/lib/services/app-state.service.spec.ts`
  — 156 passed, 156 total (154 before + 2 new).
- `npx tsc --noEmit --project libs/frontend/core/tsconfig.lib.json` — no errors.
- `npx eslint <the 3 changed files>` — 0 errors, 1 warning: `max-lines` on
  `app-state.service.ts` (738 counted lines, limit 700). Pre-existing: the file at HEAD
  already counts 737; my change adds exactly one line. Not caused by this batch.

## Decisions

1. The "deep-link gate" in `app-state.service.ts` is the `section` union type, not a runtime
   check. Options: (a) treat the union as the gate; (b) add runtime validation of sections.
   Evidence: plan cites `app-state.service.ts:126-142`, which is exactly the
   `PendingSettingsTab` interface; `requestSettingsTab`/`consumePendingSettingsTab` apply no
   section filter. Chose (a). Reversible.
2. Plan line 572 names `appState.requestOpenSettings(...)`, which does not exist anywhere in
   the plan or the code. Options: (a) add a new method; (b) map it to the established deep-link
   pattern `requestSettingsTab({ tab, section })` + `setCurrentView('settings')`
   (`memory-diagnostics-accordion.component.ts:472-477`, `agents-routing-settings.component.ts:270`).
   Chose (b): a duplicate method would violate "replace, do not accumulate", and the caller is
   G-Onb-Pages anyway. Reversible.
3. R13/F27's `focusProviderId: state.provider` maps to the existing `PendingSettingsTab.providerId`
   field; no new field added. Evidence: `providerId` already flows to the Settings surface and the
   plan names no consumer of a distinct `focusProviderId` type. G-Onb-Pages should pass
   `providerId: state.provider`. Reversible.
4. Type names `ProvidersSetupRowState` / `ProvidersSetupUndoEntry`: the plan names the fields
   (`state`, `committed`, `commitSeq`, `targetPair`, `committedReceipt`) but no type names; the
   names follow the file's `Providers*` convention and the chat-side `BackgroundConsumerRow`
   naming. Reversible.

## Open items and needed changes in other groups

- G-Settings-UI (`settings.component.ts:70-86,334-361`): the second Settings gate must accept
  `section: 'setup'` (per plan section 8; explicitly out of this batch's scope).
- G-Settings-UI (`provider-consumer-rows.ts:19-31`): add `'setup'` first to
  `BackgroundConsumerId` / `PROVIDER_CONSUMER_IDS`; `provider-consumer-assignments.component.ts:552`
  needs `initialEditingConsumerId` support. Not edited here (chat files are not this group's
  write files).
- G-Settings-Core-Commit-State: consume `ProvidersSetupRowState` / `ProvidersSetupUndoEntry` in
  `providers-commit.service.ts` / `providers-settings-state.service.ts` (plan 3.2 UI contract,
  lines 373-376) and re-export them from `providers-settings-state.service.ts` like the
  neighbor types (`:77-95`).
- G-Onb-Pages: the R13/F27 recovery-action clicks and their `analyze-skills.page.spec.ts` tests
  (plan line 572 test row).
- Pre-existing `max-lines` warning on `app-state.service.ts` (737 -> 738 of 700): a file split
  would fix it; out of scope for this batch.

## Extra reads

- implementation-plan.md: lines 165-180, 250-291, 330-350, 572 row, 3.2 amendment
  (~lines 360-385), tail (Coordinator amendment C1, no impact on this group).
- `libs/shared/src/lib/types/rpc/rpc-skill-judge.types.ts` (lines 1-60, 110-160),
  `rpc.types.ts` / `libs/shared/src/index.ts` export-chain greps.
- `libs/frontend/chat/src/lib/settings/providers/provider-consumer-rows.ts:1-90` (read-only;
  `BackgroundConsumerId` lives there, owned by G-Settings-UI).
- `libs/frontend/core/src/lib/services/providers-settings-state.service.ts:1-130` and
  `providers-commit.service.ts` (grep) — read-only, to place the new types where the next
  group consumes them.
- `libs/frontend/memory-curator-ui/src/lib/components/diagnostics/memory-diagnostics-accordion.component.ts:465-485`
  (established deep-link call pattern).
