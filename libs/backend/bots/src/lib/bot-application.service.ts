import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  BotRepositoryError,
  type BotRepository,
} from '@ptah-extension/persistence-sqlite';
import {
  BotsListParamsSchema,
  BotsGetParamsSchema,
  BotsCreateParamsSchema,
  BotsUpdateParamsSchema,
  BotsSetEnabledParamsSchema,
  BotsArchiveParamsSchema,
  BotsRestoreParamsSchema,
  BotsDeleteParamsSchema,
  BotAvatarUploadParamsSchema,
  BotAvatarGetParamsSchema,
  type BotScope,
  type BotEditable,
  type BotRecord,
  type BotDiagnostic,
  type BotsListResult,
  type BotsGetResult,
  type BotsWriteResult,
  type BotsDeleteResult,
  type BotAvatarUploadResult,
  type BotAvatarGetResult,
  type BotsPreviewImportResult,
} from '@ptah-extension/shared';
import type {
  BotCatalogPort,
  BotSourceReaderPort,
  BotWorkspaceAuthorizationPort,
} from './bot-ports';
import { validateBotAvatarUpload } from './bot-avatar-validation';
import {
  BotDomainError,
  upgradeBotDefinition,
  readStoredBot,
  unreadableStoredBot,
} from './bot-schema-upgrades';
import { BotImportPreviewService } from './bot-import-preview.service';

/** Phase 1 cannot atomically purge external stores: only explicit empty ownership is supported. */
export interface BotRetentionParticipant {
  inspect(bot: BotRecord): {
    memory: number;
    history: number;
    activeWork: boolean;
    supported: boolean;
  };
}
export interface BotApplicationDependencies {
  repository: BotRepository;
  catalog: BotCatalogPort;
  sourceReader: BotSourceReaderPort;
  workspaceAuthorization: BotWorkspaceAuthorizationPort;
  retentionParticipants: readonly BotRetentionParticipant[];
  now?: () => number;
  newId?: () => string;
  logger?: { debug(message: string): void };
}

export class BotApplicationService {
  private readonly preview: BotImportPreviewService;
  constructor(private readonly deps: BotApplicationDependencies) {
    this.preview = new BotImportPreviewService(
      deps.sourceReader,
      deps.catalog,
      deps.workspaceAuthorization,
    );
  }

  async list(input: unknown): Promise<BotsListResult> {
    const params = this.parse(BotsListParamsSchema, input);
    const scopes = await this.scopes(params.workspaceRoot);
    const records: BotRecord[] = [];
    const unreadable: BotsListResult['unreadable'] = [];
    let unidentified = 0;
    for (const scope of scopes) {
      if (params.scopeFilter === 'user' && scope.kind !== 'user') continue;
      if (params.scopeFilter === 'current' && scope.kind !== 'workspace')
        continue;
      for (const row of this.repository(() =>
        this.deps.repository.list(scope),
      )) {
        try {
          records.push(readStoredBot(row, scope));
        } catch (error: unknown) {
          if (!(error instanceof BotDomainError)) throw error;
          const item = unreadableStoredBot(row);
          if (item) unreadable.push(item);
          else unidentified++;
        }
      }
    }
    if (unidentified > 0)
      this.deps.logger?.debug(
        `${unidentified} stored bot row(s) have invalid storage identities.`,
      );
    const archivedCount = records.filter(
      (bot) => bot.archivedAt !== null,
    ).length;
    const search = params.search?.toLocaleLowerCase();
    return {
      executionAvailable: false,
      archivedCount,
      unreadable,
      unidentifiedRowCount: unidentified,
      summaries: records
        .filter(
          (bot) =>
            (params.includeArchived || bot.archivedAt === null) &&
            (!search ||
              `${bot.name}\n${bot.description}`
                .toLocaleLowerCase()
                .includes(search)),
        )
        .map(
          ({
            id,
            revision,
            name,
            description,
            scope,
            enabled,
            runtime,
            avatar,
            archivedAt,
            updatedAt,
          }) => ({
            id,
            revision,
            name,
            description,
            scope,
            enabled,
            runtime,
            avatar,
            archivedAt,
            updatedAt,
          }),
        ),
    };
  }

  async get(
    input: unknown,
    workspaceRoots: readonly string[] | string = [],
  ): Promise<BotsGetResult> {
    const params = this.parse(BotsGetParamsSchema, input);
    const current = await this.find(params.id, workspaceRoots);
    let record = current;
    if (params.revision !== undefined && params.revision !== current.revision) {
      const rows = this.repository(() =>
        this.deps.repository.revisions(current.id, current.scope),
      );
      const row = rows.find(
        (row) => 'definitionJson' in row && row.revision === params.revision,
      );
      if (!row) {
        if (rows.some((row) => !('definitionJson' in row)))
          throw new BotDomainError(
            'BOT_SCHEMA_UNSUPPORTED',
            'Stored revision contains invalid data.',
          );
        throw new BotDomainError('BOT_NOT_FOUND', 'Bot revision not found.');
      }
      if (!('definitionJson' in row))
        throw new BotDomainError(
          'BOT_SCHEMA_UNSUPPORTED',
          'Invalid bot revision.',
        );
      let raw: unknown;
      try {
        raw = JSON.parse(row.definitionJson);
      } catch (error: unknown) {
        throw new BotDomainError(
          'BOT_SCHEMA_UNSUPPORTED',
          error instanceof Error
            ? 'Invalid bot revision JSON.'
            : 'Invalid bot revision.',
        );
      }
      record = upgradeBotDefinition(raw);
      if (
        record.id !== current.id ||
        record.revision !== params.revision ||
        JSON.stringify(record.scope) !== JSON.stringify(current.scope)
      )
        throw new BotDomainError(
          'BOT_SCHEMA_UNSUPPORTED',
          'Bot revision identity mismatch.',
        );
    }
    return {
      executionAvailable: false,
      record,
      diagnostics: await this.diagnostics(record),
    };
  }

  async create(
    input: unknown,
    workspaceRoot?: string,
  ): Promise<BotsWriteResult> {
    // Only creation may supply a missing scope from the caller's authorized workspace context.
    const envelope = z
      .object({ definition: z.record(z.string(), z.unknown()) })
      .passthrough()
      .safeParse(input);
    const candidate =
      envelope.success &&
      envelope.data.definition['scope'] === undefined &&
      workspaceRoot !== undefined
        ? {
            ...envelope.data,
            definition: {
              ...envelope.data.definition,
              scope: { kind: 'workspace', workspaceRoot },
            },
          }
        : input;
    const params = this.parse(BotsCreateParamsSchema, candidate);
    const editable = await this.editable(params.definition);
    const diagnostics = await this.diagnostics(editable, editable.skills);
    const now = (this.deps.now ?? Date.now)();
    const record = upgradeBotDefinition({
      ...editable,
      schemaVersion: 2,
      id: (this.deps.newId ?? randomUUID)(),
      revision: 1,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      origin: params.source ?? { kind: 'manual' },
    });
    const saved = this.repository(() =>
      this.deps.repository.save(record, null),
    );
    return { record: upgradeBotDefinition(saved.definition), diagnostics };
  }

  async update(
    input: unknown,
    workspaceRoots: readonly string[] | string = [],
  ): Promise<BotsWriteResult> {
    const params = this.parse(BotsUpdateParamsSchema, input);
    const current = await this.current(params, workspaceRoots);
    this.writable(current);
    const editable = await this.editable(params.definition);
    if (JSON.stringify(editable.scope) !== JSON.stringify(current.scope))
      throw new BotDomainError(
        'UNAUTHORIZED_WORKSPACE',
        'Bot scope cannot be moved.',
      );
    const diagnostics = await this.diagnostics(
      editable,
      editable.skills.filter(
        (skill) => !current.skills.some((saved) => saved.id === skill.id),
      ),
    );
    return this.save(
      { ...current, ...editable, avatar: editable.avatar },
      params.expectedRevision,
      diagnostics,
      current,
    );
  }

  async setEnabled(
    input: unknown,
    workspaceRoots: readonly string[] | string = [],
  ): Promise<BotsWriteResult> {
    const params = this.parse(BotsSetEnabledParamsSchema, input);
    const current = await this.current(params, workspaceRoots);
    this.writable(current);
    return this.save(
      { ...current, enabled: params.enabled },
      params.expectedRevision,
      await this.diagnostics(current),
      current,
    );
  }

  async archive(
    input: unknown,
    workspaceRoots: readonly string[] | string = [],
  ): Promise<BotsWriteResult> {
    const params = this.parse(BotsArchiveParamsSchema, input);
    const current = await this.current(params, workspaceRoots);
    if (current.archivedAt !== null)
      return { record: current, diagnostics: await this.diagnostics(current) };
    return this.save(
      {
        ...current,
        enabled: false,
        archivedAt: current.archivedAt ?? (this.deps.now ?? Date.now)(),
      },
      params.expectedRevision,
      await this.diagnostics(current),
    );
  }

  async restore(
    input: unknown,
    workspaceRoots: readonly string[] | string = [],
  ): Promise<BotsWriteResult> {
    const params = this.parse(BotsRestoreParamsSchema, input);
    const current = await this.current(params, workspaceRoots);
    if (current.archivedAt === null)
      return { record: current, diagnostics: await this.diagnostics(current) };
    return this.save(
      {
        ...current,
        archivedAt: null,
        enabled: current.archivedAt === null ? current.enabled : false,
      },
      params.expectedRevision,
      await this.diagnostics(current),
    );
  }

  async delete(
    input: unknown,
    workspaceRoots: readonly string[] | string = [],
  ): Promise<BotsDeleteResult> {
    const params = this.parse(BotsDeleteParamsSchema, input);
    const current = await this.current(params, workspaceRoots);
    for (const participant of this.deps.retentionParticipants) {
      let ownership;
      try {
        ownership = participant.inspect(current);
      } catch (error: unknown) {
        this.deps.logger?.debug(
          error instanceof Error
            ? 'Bot retention inspection failed.'
            : 'Bot retention inspection returned an unknown failure.',
        );
        throw new BotDomainError(
          'BOT_RETENTION_UNAVAILABLE',
          'Bot retention ownership could not be inspected.',
        );
      }
      if (ownership.activeWork)
        throw new BotDomainError('BOT_ACTIVE_WORK', 'Bot has active work.');
      if (
        !ownership.supported ||
        ownership.memory !== 0 ||
        ownership.history !== 0
      )
        throw new BotDomainError(
          'BOT_RETENTION_UNAVAILABLE',
          'External bot ownership cannot be deleted transactionally in phase 1.',
        );
    }
    // Active work could start after inspect; phase 1 has no executor yet.
    const removed = this.repository(() =>
      this.deps.repository.delete(
        current.id,
        current.scope,
        params.expectedRevision,
        params.retention,
      ),
    );
    return {
      id: current.id,
      tombstoned: true,
      retention: params.retention,
      removed: {
        memory: 0,
        history: removed.revisionsRemoved,
        avatars: removed.imagesRemoved,
      },
    };
  }

  previewImport(input: unknown): Promise<BotsPreviewImportResult> {
    return this.preview.preview(input);
  }

  async uploadAvatar(input: unknown): Promise<BotAvatarUploadResult> {
    const params = this.parse(BotAvatarUploadParamsSchema, input);
    const scope = await this.authorize(params.scope);
    const validated = validateBotAvatarUpload(params);
    if (!validated.ok)
      throw new BotDomainError('INVALID_PARAMS', validated.message);
    const imageId = (this.deps.newId ?? randomUUID)();
    this.repository(() =>
      this.deps.repository.stageAvatar(
        imageId,
        scope,
        validated.mediaType,
        validated.bytes,
      ),
    );
    return { imageId };
  }

  async getAvatar(
    input: unknown,
    workspaceRoots: readonly string[] | string = [],
  ): Promise<BotAvatarGetResult> {
    const params = this.parse(BotAvatarGetParamsSchema, input);
    const current = await this.find(params.botId, workspaceRoots);
    const image = this.repository(() =>
      this.deps.repository.readAvatar(params.imageId, current.scope),
    );
    if (!image || image.ownerBotId !== current.id)
      throw new BotDomainError('BOT_NOT_FOUND', 'Bot image not found.');
    return {
      mediaType: image.mediaType,
      dataBase64: Buffer.from(image.bytes).toString('base64'),
    };
  }

  private parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      throw new BotDomainError('INVALID_PARAMS', 'Invalid bot parameters.');
    return parsed.data;
  }
  private async authorize(scope: BotScope): Promise<BotScope> {
    if (scope.kind === 'user') return scope;
    try {
      return {
        kind: 'workspace',
        workspaceRoot: await this.deps.workspaceAuthorization.authorize(
          scope.workspaceRoot,
        ),
      };
    } catch (error: unknown) {
      if (error instanceof BotDomainError) throw error;
      throw new BotDomainError(
        'UNAUTHORIZED_WORKSPACE',
        'Workspace is not authorized.',
      );
    }
  }
  private async scopes(workspaceRoot: string): Promise<BotScope[]> {
    return [
      await this.authorize({ kind: 'workspace', workspaceRoot }),
      { kind: 'user' },
    ];
  }
  private async find(
    id: string,
    workspaceRoots: readonly string[] | string,
  ): Promise<BotRecord> {
    const roots =
      typeof workspaceRoots === 'string' ? [workspaceRoots] : workspaceRoots;
    const scopes: BotScope[] = [{ kind: 'user' }];
    const authorizedRoots = new Set<string>();
    for (const workspaceRoot of roots) {
      const scope = await this.authorize({ kind: 'workspace', workspaceRoot });
      if (
        scope.kind === 'workspace' &&
        !authorizedRoots.has(scope.workspaceRoot)
      ) {
        authorizedRoots.add(scope.workspaceRoot);
        scopes.push(scope);
      }
    }
    let match: BotRecord | undefined;
    for (const scope of scopes) {
      const row = this.repository(() => this.deps.repository.get(id, scope));
      if (!row) continue;
      if (match)
        throw new BotDomainError(
          'BOT_REVISION_CONFLICT',
          'Bot identity is ambiguous across open scopes.',
        );
      match = readStoredBot(row, scope, id);
    }
    if (match) return match;
    throw new BotDomainError('BOT_NOT_FOUND', 'Bot not found.');
  }
  private async current(
    key: { id: string; expectedRevision: number },
    workspaceRoots: readonly string[] | string = [],
  ): Promise<BotRecord> {
    const current = await this.find(key.id, workspaceRoots);
    if (current.revision !== key.expectedRevision)
      throw new BotDomainError(
        'BOT_REVISION_CONFLICT',
        'Bot revision changed.',
      );
    return current;
  }
  private writable(current: BotRecord): void {
    if (current.archivedAt !== null)
      throw new BotDomainError('BOT_ARCHIVED', 'Archived bots are read-only.');
  }
  private async editable(definition: BotEditable): Promise<BotEditable> {
    const scope = await this.authorize(definition.scope);
    let memoryScope = definition.memoryScope;
    if (memoryScope.kind === 'workspace') {
      if (scope.kind !== 'workspace')
        throw new BotDomainError(
          'UNAUTHORIZED_WORKSPACE',
          'User bots require private memory.',
        );
      const authorized = await this.authorize({
        kind: 'workspace',
        workspaceRoot: memoryScope.workspaceRoot,
      });
      if (
        authorized.kind !== 'workspace' ||
        authorized.workspaceRoot !== scope.workspaceRoot
      )
        throw new BotDomainError(
          'UNAUTHORIZED_WORKSPACE',
          'Workspace memory must use the bot root.',
        );
      memoryScope = authorized;
    }
    return { ...definition, scope, memoryScope };
  }
  private async diagnostics(
    definition: BotEditable,
    newSkills: readonly BotEditable['skills'][number][] = [],
  ): Promise<BotDiagnostic[]> {
    let catalog;
    try {
      catalog = await this.deps.catalog.read(definition.scope, definition);
    } catch (error: unknown) {
      if (newSkills.length)
        throw new BotDomainError(
          'PERSISTENCE_UNAVAILABLE',
          'Installed skills could not be verified.',
        );
      return [
        {
          code: 'CATALOG_UNAVAILABLE',
          message:
            error instanceof Error
              ? 'Bot catalog unavailable.'
              : 'Bot catalog failed.',
          severity: 'warning',
        },
      ];
    }
    if (catalog.status === 'unavailable' && newSkills.length)
      throw new BotDomainError(
        'PERSISTENCE_UNAVAILABLE',
        'Installed skills could not be verified.',
      );
    const diagnostics: BotDiagnostic[] = [...catalog.diagnostics];
    if (catalog.status !== 'available')
      diagnostics.push({
        code: 'CATALOG_UNAVAILABLE',
        message: 'Bot catalog is incomplete or unavailable.',
        severity: 'warning',
      });
    for (const skill of definition.skills)
      if (!catalog.skills.some((choice) => choice.id === skill.id)) {
        if (newSkills.some((choice) => choice.id === skill.id))
          throw new BotDomainError(
            catalog.status === 'partial'
              ? 'PERSISTENCE_UNAVAILABLE'
              : 'INVALID_PARAMS',
            catalog.status === 'partial'
              ? 'Installed skills could not be verified.'
              : 'Choose an installed skill.',
          );
        diagnostics.push({
          code: 'SKILL_UNRESOLVED',
          message: `Skill ${skill.id} is not installed.`,
          field: 'skills',
          severity: 'warning',
        });
      }
    const runtime = definition.runtime;
    if (
      (runtime.kind === 'main' &&
        !catalog.mainProviders.some(
          (choice) => choice.providerId === runtime.providerId,
        )) ||
      (runtime.kind === 'lane' &&
        !catalog.lanes.some(
          (choice) =>
            choice.available &&
            JSON.stringify(choice.target) === JSON.stringify(runtime.target),
        ))
    )
      diagnostics.push({
        code: 'RUNTIME_UNRESOLVED',
        message: 'Selected runtime is unavailable.',
        field: 'runtime',
        severity: 'warning',
      });
    for (const tool of [
      ...definition.toolRequirements.allow,
      ...definition.toolRequirements.deny,
    ])
      if (!catalog.toolIds.includes(tool))
        diagnostics.push({
          code: 'TOOL_UNRESOLVED',
          message: `Tool ${tool} is unavailable.`,
          field: 'toolRequirements',
          severity: 'warning',
        });
    return diagnostics;
  }
  private save(
    record: BotRecord,
    expectedRevision: number,
    diagnostics: BotDiagnostic[],
    current?: BotRecord,
  ): BotsWriteResult {
    if (current && JSON.stringify(record) === JSON.stringify(current))
      return { record: current, diagnostics };
    const saved = this.repository(() =>
      this.deps.repository.save(
        upgradeBotDefinition(
          JSON.parse(
            JSON.stringify({
              ...record,
              revision: expectedRevision + 1,
              updatedAt: (this.deps.now ?? Date.now)(),
            }),
          ),
        ),
        expectedRevision,
      ),
    );
    return { record: upgradeBotDefinition(saved.definition), diagnostics };
  }
  private repository<T>(action: () => T): T {
    try {
      return action();
    } catch (error: unknown) {
      if (error instanceof BotDomainError) throw error;
      if (error instanceof BotRepositoryError) {
        const codes = {
          conflict: 'BOT_REVISION_CONFLICT',
          'not-found': 'BOT_NOT_FOUND',
          invalid: 'INVALID_PARAMS',
          'scope-denied': 'UNAUTHORIZED_WORKSPACE',
          quota: 'INVALID_PARAMS',
        } as const;
        throw new BotDomainError(
          codes[error.code],
          'Bot storage refused the operation.',
        );
      }
      throw new BotDomainError(
        'PERSISTENCE_UNAVAILABLE',
        'Bot storage is unavailable.',
      );
    }
  }
}
