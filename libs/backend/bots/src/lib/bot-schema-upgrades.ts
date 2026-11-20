import { z } from 'zod';
import type { StoredBot } from '@ptah-extension/persistence-sqlite';
import {
  BotDefinitionSchema,
  BotDefinitionSchemaV2,
  BotIdSchema,
  type BotScope,
  type BotsListResult,
  type BotRecord,
  type RpcUserErrorCode,
} from '@ptah-extension/shared';

export class BotDomainError extends Error {
  constructor(
    readonly code: RpcUserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BotDomainError';
  }
}

/** Pure upgrade: immutable historical snapshots are never rewritten. */
export function upgradeBotDefinition(raw: unknown): BotRecord {
  const parsed = BotDefinitionSchema.safeParse(raw);
  if (!parsed.success)
    throw new BotDomainError(
      'BOT_SCHEMA_UNSUPPORTED',
      'Invalid or unsupported bot snapshot.',
    );
  const definition = parsed.data;
  if (definition.schemaVersion === 2) return definition;
  const upgraded = BotDefinitionSchemaV2.safeParse({
    ...definition,
    schemaVersion: 2,
    origin: { kind: 'manual' },
    runtime: {
      kind: 'main',
      providerId: definition.runtime.providerId,
      model: definition.runtime.modelId,
      ...(definition.runtime.effort === undefined
        ? {}
        : { effort: definition.runtime.effort }),
    },
  });
  if (!upgraded.success)
    throw new BotDomainError(
      'BOT_SCHEMA_UNSUPPORTED',
      'Invalid or unsupported bot snapshot.',
    );
  return upgraded.data;
}

const StorageMetadataSchema = z.object({
  id: BotIdSchema,
  schema_version: z.unknown().optional(),
  schemaVersion: z.unknown().optional(),
});

/** SQL identity is authoritative; never trust an embedded JSON identity. */
export function readStoredBot(
  row: StoredBot,
  scope: BotScope,
  id?: string,
): BotRecord {
  const metadata = StorageMetadataSchema.safeParse(row.raw);
  const record = upgradeBotDefinition(row.definition ?? row.raw);
  if (
    !metadata.success ||
    record.id !== metadata.data.id ||
    (id !== undefined && record.id !== id) ||
    JSON.stringify(record.scope) !== JSON.stringify(scope)
  )
    throw new BotDomainError(
      'BOT_SCHEMA_UNSUPPORTED',
      'Stored bot identity mismatch.',
    );
  return record;
}

/** Null indicates unusable SQL identity, counted separately by the application. */
export function unreadableStoredBot(
  row: StoredBot,
): BotsListResult['unreadable'][number] | null {
  const metadata = StorageMetadataSchema.safeParse(row.raw);
  if (!metadata.success) return null;
  const version = z
    .number()
    .int()
    .positive()
    .safeParse(metadata.data.schema_version ?? metadata.data.schemaVersion);
  const messages: Readonly<Record<string, string>> = {
    'invalid-row': 'Stored bot metadata is invalid.',
    'unsupported-schema-version': 'Stored bot schema version is unsupported.',
    'invalid-definition-json': 'Stored bot definition JSON is malformed.',
    'invalid-definition': 'Stored bot definition is invalid.',
    'snapshot-mismatch': 'Stored bot snapshot does not match its metadata.',
  };
  return {
    id: metadata.data.id,
    ...(version.success ? { schemaVersion: version.data } : {}),
    diagnostics: (row.diagnostics.length
      ? row.diagnostics
      : ['snapshot-mismatch']
    ).map((code) => ({
      code: 'BOT_SCHEMA_UNSUPPORTED',
      message: Object.hasOwn(messages, code)
        ? messages[code]
        : 'Stored bot item is unreadable.',
      severity: 'error',
    })),
  };
}
