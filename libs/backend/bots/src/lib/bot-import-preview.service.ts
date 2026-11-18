import { z } from 'zod';
import {
  BotsPreviewImportParamsSchema,
  BotEditableSchema,
  type BotScope,
  type BotPreviewItem,
  type BotDiagnostic,
  type BotsPreviewImportResult,
} from '@ptah-extension/shared';
import type {
  BotSourceReaderPort,
  BotCatalogPort,
  BotWorkspaceAuthorizationPort,
} from './bot-ports';
import { BotDomainError } from './bot-schema-upgrades';

// Audited HarnessSubagentDefinition format, not Markdown or provider configuration.
const LegacyItemSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  role: z.string(),
  instructions: z.string(),
  tools: z.array(z.string()),
  executionMode: z.enum(['background', 'on-demand', 'scheduled']),
  triggers: z.array(z.string()).optional(),
});

export class BotImportPreviewService {
  constructor(
    private readonly sourceReader: BotSourceReaderPort,
    private readonly catalog: BotCatalogPort,
    private readonly workspaceAuthorization: BotWorkspaceAuthorizationPort,
  ) {}

  async preview(input: unknown): Promise<BotsPreviewImportResult> {
    const parsed = BotsPreviewImportParamsSchema.safeParse(input);
    if (!parsed.success)
      throw new BotDomainError('INVALID_PARAMS', 'Invalid preview parameters.');
    const params = parsed.data;
    const targetScope = await this.authorize(params.targetScope);
    const source =
      params.source.kind === 'proposal'
        ? {
            ...params.source,
            workspaceRoot: await this.root(params.source.workspaceRoot),
          }
        : params.source;
    let snapshot;
    try {
      snapshot = await this.sourceReader.read(source);
    } catch (error: unknown) {
      if (error instanceof BotDomainError) throw error;
      throw new BotDomainError(
        'BOT_SOURCE_INVALID',
        error instanceof Error
          ? 'Bot source could not be read.'
          : 'Bot source unavailable.',
      );
    }
    const diagnostics = [...snapshot.diagnostics];
    const items = new Map<string, BotPreviewItem>();
    for (const item of snapshot.items) {
      const key = JSON.stringify(item.source);
      const existing = items.get(key);
      if (existing) {
        existing.status = 'ambiguous';
        existing.diagnostics.push({
          code: 'SOURCE_AMBIGUOUS',
          message: 'Duplicate source identity in one container.',
          severity: 'error',
        });
        continue;
      }
      const raw = LegacyItemSchema.safeParse(item.raw);
      const preview: BotPreviewItem = {
        source: item.source,
        fingerprint: item.fingerprint,
        originalRole: raw.success ? raw.data.role : '',
        originalInstructions: raw.success ? raw.data.instructions : '',
        status: 'invalid',
        diagnostics: [],
      };
      items.set(key, preview);
      const selected =
        source.kind === 'preset'
          ? item.source.kind === 'preset' &&
            item.source.presetId === source.presetId
          : item.source.kind === 'proposal' &&
            item.source.workspaceRoot === source.workspaceRoot &&
            item.source.sessionId === source.sessionId;
      if (!raw.success || !selected || raw.data.id !== item.source.itemId) {
        preview.diagnostics.push({
          code: 'SOURCE_INVALID',
          message: 'Malformed source item or mismatched source identity.',
          severity: 'error',
        });
        continue;
      }
      const legacy = raw.data;
      const definition = BotEditableSchema.safeParse({
        name: legacy.name,
        description: legacy.description,
        instructions: [legacy.role, legacy.instructions]
          .filter((text) => text.trim())
          .join('\n\n'),
        scope: targetScope,
        skills: [],
        runtime: { kind: 'default' },
        memoryScope: { kind: 'private' },
        toolRequirements: { allow: legacy.tools, deny: [] },
        triggers: [],
        approvalRules: { mode: 'ask' },
      });
      if (!definition.success) {
        preview.diagnostics.push({
          code: 'SOURCE_INVALID',
          message: 'Source does not produce a valid bot definition.',
          severity: 'error',
        });
        continue;
      }
      preview.definition = definition.data;
      preview.status = 'valid';
      preview.diagnostics.push({
        code: 'LEGACY_AUTOMATION_INACTIVE',
        message: JSON.stringify({
          inactiveModes: [legacy.executionMode],
          inactiveTriggers: legacy.triggers ?? [],
        }),
        severity: 'warning',
      });
      try {
        const catalog = await this.catalog.read(targetScope, definition.data);
        preview.diagnostics.push(...catalog.diagnostics);
        for (const tool of legacy.tools)
          if (!catalog.toolIds.includes(tool))
            preview.diagnostics.push({
              code: 'TOOL_UNRESOLVED',
              message: `Tool ${tool} is unavailable.`,
              severity: 'warning',
              field: 'toolRequirements',
            });
      } catch (error: unknown) {
        const diagnostic: BotDiagnostic = {
          code: 'CATALOG_UNAVAILABLE',
          message:
            error instanceof Error
              ? 'Bot catalog unavailable.'
              : 'Bot catalog failed.',
          severity: 'warning',
        };
        preview.diagnostics.push(diagnostic);
      }
    }
    return {
      executionAvailable: false,
      items: [...items.values()],
      diagnostics,
    };
  }
  private async root(root: string): Promise<string> {
    try {
      return await this.workspaceAuthorization.authorize(root);
    } catch (error: unknown) {
      if (error instanceof BotDomainError) throw error;
      throw new BotDomainError(
        'UNAUTHORIZED_WORKSPACE',
        'Workspace is not authorized.',
      );
    }
  }
  private async authorize(scope: BotScope): Promise<BotScope> {
    return scope.kind === 'workspace'
      ? {
          kind: 'workspace',
          workspaceRoot: await this.root(scope.workspaceRoot),
        }
      : scope;
  }
}
