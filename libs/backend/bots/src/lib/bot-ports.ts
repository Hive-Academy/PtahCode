import type { BotRepository } from '@ptah-extension/persistence-sqlite';
import type {
  BotDiagnostic,
  BotEditable,
  BotLaneRuntime,
  BotLaneTarget,
  BotScope,
  BotSourceRef,
  BotsPreviewImportParams,
} from '@ptah-extension/shared';

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
  read(
    scope: BotScope,
    selection?: Pick<BotEditable, 'runtime' | 'skills' | 'toolRequirements'>,
  ): Promise<BotCatalogSnapshot>;
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
 * Selectors are shared source identities, never caller-supplied file paths. The
 * proposal selector carries a workspaceRoot: authorize it through
 * BotWorkspaceAuthorizationPort before any proposal read.
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
export type BotStagedAssetOperations = Pick<
  BotRepository,
  'stageAvatar' | 'readAvatar' | 'save'
>;

/** Host-neutral identities shared by Electron and CLI composition roots. */
export const BOTS_TOKENS = {
  APPLICATION: Symbol.for('PtahBotApplication'),
  SOURCE_READER: Symbol.for('PtahBotSourceReader'),
  CATALOG: Symbol.for('PtahBotCatalog'),
  WORKSPACE_AUTHORIZATION: Symbol.for('PtahBotWorkspaceAuthorization'),
} as const;
