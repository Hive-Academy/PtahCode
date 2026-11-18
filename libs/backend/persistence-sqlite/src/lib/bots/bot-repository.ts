import type {
  BotDefinition,
  BotScope,
  BotRetention,
  BotAvatarMediaType,
} from '@ptah-extension/shared';

/** Raw storage is always returned, including unsupported or damaged snapshots. */
export interface StoredBot {
  raw: unknown;
  definition: BotDefinition | null;
  diagnostics: readonly string[];
}
export interface BotRevision {
  botId: string;
  revision: number;
  schemaVersion: number;
  definitionJson: string;
  createdAt: number;
}
export interface InvalidBotRevision {
  raw: unknown;
  diagnostics: readonly string[];
}
export interface BotAvatarImage {
  imageId: string;
  mediaType: BotAvatarMediaType;
  bytes: Uint8Array;
  ownerBotId: string | null;
  expiresAt: number | null;
}
export interface BotWriteResult {
  changed: boolean;
  definition: BotDefinition;
}
export interface BotDeleteResult {
  revisionsRemoved: number;
  imagesRemoved: number;
}
export type BotRepositoryErrorCode =
  'conflict' | 'not-found' | 'invalid' | 'scope-denied' | 'quota';
export class BotRepositoryError extends Error {
  constructor(
    readonly code: BotRepositoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BotRepositoryError';
  }
}
/** Scope roots must already be canonicalized and authorized by the caller.
 * workspace_root is compared exactly: pass the stored/open-folder spelling,
 * including case and separators. The 20 MiB quota covers staged images only;
 * claimed images are retained for immutable history without that quota.
 * list/get exclude tombstones; revisions returns [] for a deleted bot.
 * A later authorized retained-history read path is outside this port.
 * Every mutation is synchronous and atomic on the shared connection.
 * Memory/run ownership is handled by the application; this repository owns only
 * definitions, revisions and avatars, and never claims to purge external assets.
 */
export interface BotRepository {
  list(scope: BotScope): StoredBot[];
  get(id: string, scope: BotScope): StoredBot | null;
  revisions(id: string, scope: BotScope): (BotRevision | InvalidBotRevision)[];
  save(
    definition: BotDefinition,
    expectedRevision: number | null,
  ): BotWriteResult;
  delete(
    id: string,
    scope: BotScope,
    expectedRevision: number,
    retention: BotRetention,
  ): BotDeleteResult;
  stageAvatar(
    imageId: string,
    scope: BotScope,
    mediaType: BotAvatarMediaType,
    bytes: Uint8Array,
  ): BotAvatarImage;
  readAvatar(imageId: string, scope: BotScope): BotAvatarImage | null;
}
