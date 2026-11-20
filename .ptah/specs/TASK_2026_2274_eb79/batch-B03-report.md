# B03 report

Implemented strict bots domain configuration and host-neutral ports.

## Files written

- `libs/backend/bots/project.json`
- `libs/backend/bots/tsconfig.json`
- `libs/backend/bots/tsconfig.lib.json`
- `libs/backend/bots/tsconfig.spec.json`
- `libs/backend/bots/jest.config.ts`
- `libs/backend/bots/eslint.config.mjs`
- `libs/backend/bots/src/lib/bot-ports.ts`
- `nx.json`: added only the two bots include entries, after auth-providers in the lint and Jest plugin include lists.
- `.ptah/specs/TASK_2026_2274_eb79/batch-B03-report.md`

## Full port signatures

The complete declaration file, including supporting data types and token identities:

```typescript
import type { BotRepository } from '@ptah-extension/persistence-sqlite';
import type { BotDiagnostic, BotEditable, BotLaneRuntime, BotLaneTarget, BotScope, BotSourceRef, BotsPreviewImportParams } from '@ptah-extension/shared';

/** Advertised capabilities only; omitted lists mean unknown, not unsupported. */
export interface BotRuntimeCapabilities {
  readonly models?: readonly string[];
  readonly modelTiers?: readonly NonNullable<BotLaneRuntime['modelTier']>[];
  readonly efforts?: readonly string[];
}

/** Public provider connection identity and model identities, without credentials. */
export interface BotMainProviderChoice {
  readonly providerId: string;
  readonly label: string;
  readonly capabilities: BotRuntimeCapabilities;
}

/** A system CLI installation or ptah-cli registry identity; never a command. */
export interface BotLaneChoice {
  readonly target: BotLaneTarget;
  readonly label: string;
  readonly available: boolean;
  readonly capabilities: BotRuntimeCapabilities;
}

/** Partial catalog data remains usable; failures must have explicit diagnostics. */
export interface BotCatalogSnapshot {
  readonly status: 'available' | 'partial' | 'unavailable';
  readonly mainProviders: readonly BotMainProviderChoice[];
  readonly lanes: readonly BotLaneChoice[];
  readonly skills: readonly BotEditable['skills'][number][];
  readonly toolIds: readonly string[];
  readonly diagnostics: readonly BotDiagnostic[];
}

/**
 * Enumerates trusted catalogs without spawning or checking credentials.
 * With a selection, also diagnoses unknown/unavailable identities and unsupported
 * capabilities without rejecting or rewriting the selection. Dependency failures
 * return partial/unavailable snapshots with diagnostics, never silent empty lists.
 */
export interface BotCatalogPort {
  read(scope: BotScope, selection?: Pick<BotEditable, 'runtime' | 'skills' | 'toolRequirements'>): Promise<BotCatalogSnapshot>;
}

/** An untrusted source item with its stable tuple and content fingerprint. */
export interface BotSourceItem {
  readonly source: BotSourceRef;
  readonly fingerprint: string;
  readonly raw: unknown;
}

/** Preserve duplicate items and malformed content for application preview checks. */
export interface BotSourceSnapshot {
  readonly items: readonly BotSourceItem[];
  readonly diagnostics: readonly BotDiagnostic[];
}

/**
 * Reads existing preset/proposal containers only, without modifying their stores.
 * Selectors are shared source identities, never caller-supplied filesystem paths.
 * Each item carries its full BotSourceRef; raw data must be validated before use.
 * Missing/malformed sources are reported through diagnostics, not empty success.
 */
export interface BotSourceReaderPort {
  read(source: BotsPreviewImportParams['source']): Promise<BotSourceSnapshot>;
}

/**
 * Authorizes an exact open root, rejecting traversal, descendants and closed roots.
 * Returns the stored/open-folder spelling, including Windows casing, for exact
 * repository scope comparisons. This is lexical authorization, not realpath access.
 * An unauthorized root is refused rather than returned or silently normalized.
 */
export interface BotWorkspaceAuthorizationPort {
  authorize(workspaceRoot: string): Promise<string>;
}

/**
 * Repository-owned avatar operations: stage validated bytes, read scoped bytes,
 * and claim an image atomically through save with the owning definition/revision.
 * No separate claim operation or second asset repository is introduced.
 */
export type BotStagedAssetOperations = Pick<BotRepository, 'stageAvatar' | 'readAvatar' | 'save'>;

/** Host-neutral identities shared by Electron and CLI composition roots. */
export const BOTS_TOKENS = {
  APPLICATION: Symbol.for('PtahBotApplication'),
  SOURCE_READER: Symbol.for('PtahBotSourceReader'),
  CATALOG: Symbol.for('PtahBotCatalog'),
  WORKSPACE_AUTHORIZATION: Symbol.for('PtahBotWorkspaceAuthorization'),
} as const;
```

## Decisions

1. **Catalog:** use one asynchronous `read(scope, selection?)` returning a typed snapshot of provider models, system/ptah-cli targets, skills, tools and diagnostics. Optional selection requests capability/unresolved-reference diagnostics. Options: separate enumeration/diagnosis ports or one snapshot port. Evidence: B03/B05 require enumeration without spawning and diagnostics without blocking saves; B06 needs both skills and runtime validation. Snapshot status distinguishes complete, partial and failed catalogs, so empty results cannot silently hide failure. Capability lists are optional to distinguish unknown support from an explicitly empty list. Reversible: yes, before B05/B06 adapters consume it.
2. **Sources:** the reader accepts the shared preview container selector, with each returned item carrying a full `BotSourceRef`, fingerprint and untrusted `raw: unknown`. Options: convert to BotEditable inside the adapter or preserve source data for the application. Evidence: B05 owns read-only store access; B06 owns preview conversion, duplicate detection and malformed-source handling. The shared preview selector names a preset or proposal container without arbitrary paths; full item references preserve source-location collisions. Raw content must be validated by B06 before use. Reversible: yes.
3. **Workspace roots:** `authorize(root)` returns the exact open-folder spelling rather than a boolean or normalized root. Options: return authorization only or return authorized stored spelling. Evidence: carry-forward B04 review #1 and the plan's exact-root helper contract require preserving Windows case for case-sensitive repository comparisons. Reversible: yes, but downstream callers must use the returned value.
4. **Avatar operations:** expose `Pick<BotRepository, 'stageAvatar' | 'readAvatar' | 'save'>`. Options: duplicate asset repository, add independent claim operation, or reuse repository methods. Evidence: B04 exposes staging/reads and claims images transactionally in save; B06 owns image admission/policy. No independent claim can safely replace the repository transaction. Reversible: yes.
5. **Configuration:** copy lane-outcomes configuration and change library identity and tags only; retain its strict compiler flags and esbuild/test setup. Evidence: explicit B03 contract and sibling configuration. `eslint.config.mjs:382-383` permits data-access to depend on data-access/util, and persistence-sqlite has `type:util`, so its public import is allowed without exceptions. Reversible: yes.

## Checks

- `ptah_get_diagnostics` scoped to `bot-ports.ts` and `jest.config.ts`: `Errors: 0 | Warnings: 0 ? No issues found.` Coverage: clean.
- `npx tsc --noEmit --project libs/backend/bots/tsconfig.lib.json`: exit 0; no output.
- `npx eslint libs/backend/bots/jest.config.ts libs/backend/bots/src/lib/bot-ports.ts`: exit 0; no output.
- Initial `npx prettier --check` over all written files: exit 1, formatting warnings on copied configurations, nx.json and report. Corrected formatting with Prettier within the permitted write set.
- `npx prettier --check libs/backend/bots/project.json libs/backend/bots/tsconfig.json libs/backend/bots/tsconfig.lib.json libs/backend/bots/tsconfig.spec.json libs/backend/bots/jest.config.ts libs/backend/bots/eslint.config.mjs libs/backend/bots/src/lib/bot-ports.ts nx.json .ptah/specs/TASK_2026_2274_eb79/batch-B03-report.md`: exit 0; `Checking formatting...` followed by `All matched files use Prettier code style!`.

## Anything not done

- No application implementation, public barrel, host registrations, or tests added; those belong to later batches. No spawning, host APIs or filesystem access in the domain declarations.
- Skill discovery/loading is unavailable: no skill catalogue or loader is exposed in this lane, including for `nx-workspace-architect`. Used the approved plan and existing sibling configuration directly.
- No Git commands were run. Other batches' shared/persistence sources were already present and were read only; no out-of-scope changes were made or reverted.
