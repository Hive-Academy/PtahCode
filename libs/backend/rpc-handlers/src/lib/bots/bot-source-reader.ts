import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import {
  BOTS_TOKENS,
  type BotSourceReaderPort,
  type BotSourceSnapshot,
  type BotWorkspaceAuthorizationPort,
} from '@ptah-extension/bots';
import {
  BotsPreviewImportParamsSchema,
  type BotsPreviewImportParams,
  type BotSourceRef,
} from '@ptah-extension/shared';
import { HarnessProposalSchema } from '@ptah-extension/shared/schemas';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import { BUILTIN_HARNESS_PRESETS } from '../harness/config/builtin-presets';
import { sameWorkspaceRoot } from '../utils/workspace-authorization';

// Matches HarnessProposalStore RETENTION_MS; real-store regression covers expiry.
const PROPOSAL_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const ContainerSchema = z.looseObject({
  agents: z.looseObject({ harnessSubagents: z.array(z.unknown()) }).optional(),
});
const PresetSchema = z.looseObject({
  id: z.string().min(1),
  config: ContainerSchema,
});
const ItemIdentitySchema = z.looseObject({ id: z.string().min(1) });
const VersionSchema = z.looseObject({ version: z.unknown().optional() });
export interface BotSourceFiles {
  readFile(file: string): Promise<string>;
  stamp(file: string): Promise<string>;
}
const disk: BotSourceFiles = {
  readFile: (file) => fs.readFile(file, 'utf8'),
  stamp: async (file) => {
    const stat = await fs.stat(file);
    return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  },
};

/** Reads the writer's containers directly: store.get prunes and is not read-only. */
@injectable()
export class BotSourceReader implements BotSourceReaderPort {
  constructor(
    @inject(BOTS_TOKENS.WORKSPACE_AUTHORIZATION)
    private readonly authorization: BotWorkspaceAuthorizationPort,
    @inject(TOKENS.LOGGER) private readonly logger: Pick<Logger, 'debug'>,
    private readonly files: BotSourceFiles = disk,
  ) {}

  async read(
    input: BotsPreviewImportParams['source'],
  ): Promise<BotSourceSnapshot> {
    const source = BotsPreviewImportParamsSchema.shape.source.parse(input);
    const sessionId =
      source.kind === 'proposal' ? source.sessionId.trim() : undefined;
    let root: string | undefined;
    let file: string;
    if (source.kind === 'proposal') {
      root = await this.authorization.authorize(source.workspaceRoot);
      file = path.join(
        root,
        '.ptah',
        'harness',
        'proposals',
        `${this.hash(sessionId ?? '')}.json`,
      );
    } else {
      if (!/^[A-Za-z0-9_-]+$/.test(source.presetId))
        return this.failure(
          'SOURCE_UNSUPPORTED',
          'Unsupported preset identity.',
        );
      file = path.join(
        os.homedir(),
        '.ptah',
        'harnesses',
        `${source.presetId}.json`,
      );
    }
    let raw: unknown;
    try {
      const before = await this.files.stamp(file);
      const contents = await this.files.readFile(file);
      if (before !== (await this.files.stamp(file)))
        return this.failure(
          'SOURCE_CHANGED',
          'Source changed while being read.',
        );
      raw = JSON.parse(contents);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        const builtin =
          source.kind === 'preset'
            ? BUILTIN_HARNESS_PRESETS.find(
                (preset) => preset.id === source.presetId,
              )
            : undefined;
        if (builtin) raw = builtin;
        else return this.failure('SOURCE_MISSING', 'Source no longer exists.');
      } else {
        this.logger.debug('Bot source read failed', { kind: source.kind });
        return this.failure(
          error instanceof SyntaxError
            ? 'SOURCE_MALFORMED'
            : 'SOURCE_UNAVAILABLE',
          'Source could not be read.',
        );
      }
    }
    let container: z.infer<typeof ContainerSchema>;
    if (source.kind === 'preset') {
      const parsed = PresetSchema.safeParse(raw);
      if (!parsed.success)
        return this.failure('SOURCE_MALFORMED', 'Malformed preset container.');
      if (parsed.data.id !== source.presetId)
        return this.failure('SOURCE_CHANGED', 'Preset identity changed.');
      container = parsed.data.config;
    } else {
      const version = VersionSchema.safeParse(raw);
      if (version.success && version.data.version !== 1)
        return this.failure(
          'SOURCE_UNSUPPORTED',
          'Unsupported proposal version.',
        );
      const parsed = HarnessProposalSchema.safeParse(raw);
      if (!parsed.success)
        return this.failure(
          'SOURCE_MALFORMED',
          'Malformed proposal container.',
        );
      if (
        parsed.data.sessionId !== sessionId ||
        !root ||
        !sameWorkspaceRoot(parsed.data.workspaceRoot, root)
      )
        return this.failure('SOURCE_CHANGED', 'Proposal identity changed.');
      if (
        Date.parse(parsed.data.updatedAt) <
        Date.now() - PROPOSAL_RETENTION_MS
      )
        return this.failure('SOURCE_MISSING', 'Proposal has expired.');
      const config = ContainerSchema.safeParse(parsed.data.configUpdates);
      if (!config.success)
        return this.failure('SOURCE_MALFORMED', 'Malformed proposal agents.');
      container = config.data;
    }
    const items = container.agents?.harnessSubagents;
    if (!items?.length)
      return this.failure(
        'SOURCE_UNSUPPORTED',
        'Source contains no bot items.',
      );
    return {
      diagnostics: [],
      items: items.map((item, index) => {
        const identity = ItemIdentitySchema.safeParse(item);
        const itemId = identity.success ? identity.data.id : `invalid-${index}`;
        const ref: BotSourceRef =
          source.kind === 'preset'
            ? {
                ...source,
                sourceLocationId: `harnesses/${source.presetId}.json`,
                itemId,
              }
            : {
                ...source,
                sessionId: sessionId ?? source.sessionId,
                workspaceRoot: root ?? source.workspaceRoot,
                itemId,
              };
        return {
          source: ref,
          raw: item,
          fingerprint: this.hash(JSON.stringify(item)),
        };
      }),
    };
  }
  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }
  private failure(code: string, message: string): BotSourceSnapshot {
    return { items: [], diagnostics: [{ code, message, severity: 'error' }] };
  }
}
