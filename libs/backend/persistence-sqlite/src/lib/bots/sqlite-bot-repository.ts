import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { isDeepStrictEqual } from 'node:util';
import {
  BotDefinitionSchema,
  BotScopeSchema,
  BotIdSchema,
  RevisionSchema,
  BotRetentionSchema,
  BotAvatarMediaTypeSchema,
  type BotDefinition,
  type BotScope,
  type BotRetention,
  type BotAvatarMediaType,
} from '@ptah-extension/shared';
import { SqliteConnectionService } from '../sqlite-connection.service';
import { PERSISTENCE_TOKENS } from '../di/tokens';
import {
  BotRepositoryError,
  type BotRepository,
  type StoredBot,
  type BotRevision,
  type InvalidBotRevision,
  type BotAvatarImage,
  type BotWriteResult,
  type BotDeleteResult,
} from './bot-repository';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const rowSchema = z.object({
  id: BotIdSchema,
  schema_version: RevisionSchema,
  revision: RevisionSchema,
  definition_json: z.string().nullable(),
  scope_kind: z.enum(['user', 'workspace']),
  workspace_root: z.string().nullable(),
  name: z.string().nullable(),
  enabled: z.union([z.literal(0), z.literal(1)]),
  created_at: integer,
  updated_at: integer,
  archived_at: integer.nullable(),
  deleted_at: integer.nullable(),
  retain_memory: z.number().nullable(),
  retain_history: z.number().nullable(),
});
const imageSchema = z.object({
  image_id: BotIdSchema,
  media_type: BotAvatarMediaTypeSchema,
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.length > 0 && bytes.length <= 2097152),
  owner_bot_id: BotIdSchema.nullable(),
  expires_at: integer.nullable(),
});
const revisionSchema = z.object({
  bot_id: BotIdSchema,
  revision: RevisionSchema,
  schema_version: RevisionSchema,
  definition_json: z.string(),
  created_at: integer,
});
const DAY = 24 * 60 * 60 * 1000;
const QUOTA = 20 * 1024 * 1024;
function root(scope: BotScope): string | null {
  return scope.kind === 'workspace' ? scope.workspaceRoot : null;
}
function content(definition: BotDefinition): unknown {
  const { revision, updatedAt, ...rest } = definition;
  void revision;
  void updatedAt;
  return rest;
}

@injectable()
export class SqliteBotRepository implements BotRepository {
  private now: () => number = Date.now;
  constructor(
    @inject(PERSISTENCE_TOKENS.SQLITE_CONNECTION)
    private readonly connection: Pick<SqliteConnectionService, 'db'>,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'debug'>,
  ) {}

  /** Set before use; no timers or host dependencies. */
  configure(options: { now: () => number }): void {
    this.now = options.now;
  }

  list(scope: BotScope): StoredBot[] {
    this.parse(BotScopeSchema, scope);
    return this.connection.db
      .prepare(
        'SELECT * FROM bots WHERE scope_kind = ? AND workspace_root IS ? AND deleted_at IS NULL ORDER BY name, id',
      )
      .all(scope.kind, root(scope))
      .map((raw) => this.decode(raw));
  }

  get(id: string, scope: BotScope): StoredBot | null {
    this.parse(BotIdSchema, id);
    this.parse(BotScopeSchema, scope);
    const raw = this.connection.db
      .prepare(
        'SELECT * FROM bots WHERE id = ? AND scope_kind = ? AND workspace_root IS ? AND deleted_at IS NULL',
      )
      .get(id, scope.kind, root(scope));
    return raw === undefined ? null : this.decode(raw);
  }

  revisions(id: string, scope: BotScope): (BotRevision | InvalidBotRevision)[] {
    if (!this.get(id, scope)) return [];
    return this.connection.db
      .prepare('SELECT * FROM bot_revisions WHERE bot_id = ? ORDER BY revision')
      .all(id)
      .map((raw) => {
        const parsed = revisionSchema.safeParse(raw);
        if (!parsed.success) return { raw, diagnostics: ['invalid-revision'] };
        const row = parsed.data;
        return {
          botId: row.bot_id,
          revision: row.revision,
          schemaVersion: row.schema_version,
          definitionJson: row.definition_json,
          createdAt: row.created_at,
        };
      });
  }

  save(input: BotDefinition, expectedRevision: number | null): BotWriteResult {
    const definition = this.parse(BotDefinitionSchema, input);
    if (expectedRevision !== null) this.parse(RevisionSchema, expectedRevision);
    return this.atomic(() => {
      const raw = this.connection.db
        .prepare('SELECT * FROM bots WHERE id = ?')
        .get(definition.id);
      if (raw === undefined) {
        if (expectedRevision !== null || definition.revision !== 1)
          this.fail('conflict');
        this.connection.db
          .prepare(
            `INSERT INTO bots
          (id, schema_version, revision, definition_json, scope_kind, workspace_root, name, enabled,
           created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            definition.id,
            definition.schemaVersion,
            1,
            JSON.stringify(definition),
            definition.scope.kind,
            root(definition.scope),
            definition.name,
            Number(definition.enabled),
            definition.createdAt,
            definition.updatedAt,
            definition.archivedAt,
          );
      } else {
        const current = this.parse(rowSchema, raw);
        if (
          current.scope_kind !== definition.scope.kind ||
          current.workspace_root !== root(definition.scope)
        )
          this.fail('scope-denied');
        if (
          current.deleted_at !== null ||
          current.revision !== expectedRevision
        )
          this.fail('conflict');
        const stored = this.decode(raw);
        if (!stored.definition) this.fail('invalid');
        if (
          definition.createdAt !== current.created_at ||
          definition.schemaVersion < current.schema_version
        )
          this.fail('invalid');
        if (isDeepStrictEqual(content(stored.definition), content(definition)))
          return { changed: false, definition: stored.definition };
        if (definition.revision !== current.revision + 1) this.fail('conflict');
        const changed = this.connection.db
          .prepare(
            `UPDATE bots SET schema_version = ?, revision = ?, definition_json = ?,
          name = ?, enabled = ?, updated_at = ?, archived_at = ? WHERE id = ? AND revision = ? AND deleted_at IS NULL`,
          )
          .run(
            definition.schemaVersion,
            definition.revision,
            JSON.stringify(definition),
            definition.name,
            Number(definition.enabled),
            definition.updatedAt,
            definition.archivedAt,
            definition.id,
            expectedRevision,
          );
        if (changed.changes !== 1) this.fail('conflict');
      }
      if (
        definition.schemaVersion === 2 &&
        definition.avatar?.kind === 'image'
      ) {
        this.claim(definition.avatar.imageId, definition.id, definition.scope);
      }
      this.connection.db
        .prepare(
          `INSERT INTO bot_revisions
        (bot_id, revision, schema_version, definition_json, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          definition.id,
          definition.revision,
          definition.schemaVersion,
          JSON.stringify(definition),
          definition.updatedAt,
        );
      return { changed: true, definition };
    });
  }

  delete(
    id: string,
    scope: BotScope,
    expectedRevision: number,
    retention: BotRetention,
  ): BotDeleteResult {
    this.parse(BotIdSchema, id);
    this.parse(BotScopeSchema, scope);
    this.parse(RevisionSchema, expectedRevision);
    this.parse(BotRetentionSchema, retention);
    return this.atomic(() => {
      const stored = this.get(id, scope);
      if (!stored) this.fail('not-found');
      const row = this.parse(rowSchema, stored.raw);
      if (row.revision !== expectedRevision || row.deleted_at !== null)
        this.fail('conflict');
      let revisionsRemoved = 0;
      let imagesRemoved = 0;
      if (retention.history === 'purge') {
        revisionsRemoved = this.connection.db
          .prepare('DELETE FROM bot_revisions WHERE bot_id = ?')
          .run(id).changes;
        imagesRemoved = this.connection.db
          .prepare('DELETE FROM bot_avatar_images WHERE owner_bot_id = ?')
          .run(id).changes;
      }
      const now = this.now();
      const changed = this.connection.db
        .prepare(
          `UPDATE bots SET definition_json = NULL, enabled = 0, deleted_at = ?, updated_at = ?,
        revision = revision + 1, retain_memory = ?, retain_history = ?, name = ? WHERE id = ? AND revision = ?`,
        )
        .run(
          now,
          now,
          Number(retention.memory === 'keep'),
          Number(retention.history === 'keep'),
          retention.history === 'keep' ? row.name : null,
          id,
          expectedRevision,
        );
      if (changed.changes !== 1) this.fail('conflict');
      return { revisionsRemoved, imagesRemoved };
    });
  }

  stageAvatar(
    imageId: string,
    scope: BotScope,
    mediaType: BotAvatarMediaType,
    bytes: Uint8Array,
  ): BotAvatarImage {
    this.parse(BotIdSchema, imageId);
    this.parse(BotScopeSchema, scope);
    this.parse(BotAvatarMediaTypeSchema, mediaType);
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length === 0 ||
      bytes.length > 2097152
    )
      this.fail('invalid');
    return this.atomic(() => {
      const now = this.now();
      this.connection.db
        .prepare(
          'DELETE FROM bot_avatar_images WHERE owner_bot_id IS NULL AND expires_at <= ?',
        )
        .run(now);
      const total = z.object({ total: integer }).parse(
        this.connection.db
          .prepare(
            `SELECT COALESCE(SUM(length(bytes)), 0) AS total
        FROM bot_avatar_images WHERE owner_bot_id IS NULL AND scope_kind = ? AND workspace_root IS ?`,
          )
          .get(scope.kind, root(scope)),
      ).total;
      if (total + bytes.length > QUOTA) this.fail('quota');
      this.connection.db
        .prepare(
          `INSERT INTO bot_avatar_images
        (image_id, media_type, bytes, scope_kind, workspace_root, owner_bot_id, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          imageId,
          mediaType,
          Buffer.from(bytes),
          scope.kind,
          root(scope),
          now,
          now + DAY,
        );
      return {
        imageId,
        mediaType,
        bytes: Uint8Array.from(bytes),
        ownerBotId: null,
        expiresAt: now + DAY,
      };
    });
  }

  readAvatar(imageId: string, scope: BotScope): BotAvatarImage | null {
    this.parse(BotIdSchema, imageId);
    this.parse(BotScopeSchema, scope);
    const raw = this.connection.db
      .prepare(
        `SELECT * FROM bot_avatar_images WHERE image_id = ? AND scope_kind = ?
      AND workspace_root IS ? AND (owner_bot_id IS NOT NULL OR expires_at > ?)`,
      )
      .get(imageId, scope.kind, root(scope), this.now());
    if (raw === undefined) return null;
    const row = this.parse(imageSchema, raw);
    return {
      imageId: row.image_id,
      mediaType: row.media_type,
      bytes: Uint8Array.from(row.bytes),
      ownerBotId: row.owner_bot_id,
      expiresAt: row.expires_at,
    };
  }

  private claim(imageId: string, botId: string, scope: BotScope): void {
    const image = this.readAvatar(imageId, scope);
    if (!image) {
      const raw = this.connection.db
        .prepare(
          'SELECT scope_kind, workspace_root FROM bot_avatar_images WHERE image_id = ?',
        )
        .get(imageId);
      if (raw !== undefined) {
        const stored = this.parse(
          z.object({
            scope_kind: z.enum(['user', 'workspace']),
            workspace_root: z.string().nullable(),
          }),
          raw,
        );
        if (
          stored.scope_kind !== scope.kind ||
          stored.workspace_root !== root(scope)
        )
          this.fail('scope-denied');
      }
      this.fail('not-found');
    }
    if (image.ownerBotId !== null && image.ownerBotId !== botId)
      this.fail('scope-denied');
    this.connection.db
      .prepare(
        'UPDATE bot_avatar_images SET owner_bot_id = ?, expires_at = NULL WHERE image_id = ?',
      )
      .run(botId, imageId);
  }

  private decode(raw: unknown): StoredBot {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success)
      return { raw, definition: null, diagnostics: ['invalid-row'] };
    const row = parsed.data;
    if (row.deleted_at !== null)
      return { raw, definition: null, diagnostics: [] };
    if (row.schema_version > 2)
      return {
        raw,
        definition: null,
        diagnostics: ['unsupported-schema-version'],
      };
    let json: unknown;
    try {
      json = JSON.parse(row.definition_json ?? 'null');
    } catch (error: unknown) {
      if (error instanceof SyntaxError)
        return {
          raw,
          definition: null,
          diagnostics: ['invalid-definition-json'],
        };
      throw error;
    }
    const definition = BotDefinitionSchema.safeParse(json);
    if (!definition.success)
      return { raw, definition: null, diagnostics: ['invalid-definition'] };
    const value = definition.data;
    if (
      value.id !== row.id ||
      value.schemaVersion !== row.schema_version ||
      value.revision !== row.revision ||
      value.scope.kind !== row.scope_kind ||
      root(value.scope) !== row.workspace_root ||
      value.name !== row.name ||
      Number(value.enabled) !== row.enabled ||
      value.createdAt !== row.created_at ||
      value.updatedAt !== row.updated_at ||
      value.archivedAt !== row.archived_at
    )
      return { raw, definition: null, diagnostics: ['snapshot-mismatch'] };
    return {
      raw,
      definition: value,
      diagnostics: value.schemaVersion === 1 ? ['upgrade-required'] : [],
    };
  }

  private atomic<T>(work: () => T): T {
    const db = this.connection.db;
    // Acquire the writer reservation before reading CAS/quota state. No retries.
    if (db.inTransaction)
      throw new BotRepositoryError('invalid', 'Nested bot transaction');
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error: unknown) {
      if (db.inTransaction) {
        try {
          db.exec('ROLLBACK');
        } catch (rollbackError: unknown) {
          // degradation-audit: reported ? retain the original operation error.
          this.logger.debug(
            '[bots] rollback failed; preserving original error',
            {
              errorType:
                rollbackError instanceof Error ? rollbackError.name : 'unknown',
            },
          );
        }
      }
      throw this.normalize(error);
    }
  }

  private parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) this.fail('invalid');
    return result.data;
  }

  private normalize(error: unknown): unknown {
    const details = z
      .object({ code: z.string().optional(), errcode: z.number().optional() })
      .safeParse(error);
    if (
      error instanceof z.ZodError ||
      (details.success &&
        (details.data.code?.startsWith('SQLITE_CONSTRAINT') ||
          (details.data.errcode !== undefined &&
            (details.data.errcode & 255) === 19)))
    ) {
      return new BotRepositoryError('invalid', 'Bot repository: invalid');
    }
    return error;
  }

  private fail(
    code: ConstructorParameters<typeof BotRepositoryError>[0],
  ): never {
    throw new BotRepositoryError(code, `Bot repository: ${code}`);
  }
}
