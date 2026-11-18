import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  BotSourceRef,
  BotsPreviewImportParams,
} from '@ptah-extension/shared';
import type {
  BotCatalogPort,
  BotSourceItem,
  BotSourceReaderPort,
} from './bot-ports';
import { BotImportPreviewService } from './bot-import-preview.service';

// SYNTHETIC-PRESET / SYNTHETIC-INVALID-IMPORT (audit N1/N2/N6).
// The reader is a typed port fixture, not an integration test of the B05 adapter.
const legacy = {
  id: 'reviewer',
  name: 'Reviewer',
  description: 'Review changes',
  role: '  Careful reviewer  ',
  instructions: '\nKeep exact instructions.\n',
  tools: ['missing-tool'],
  executionMode: 'background',
  triggers: ['on-commit', 'unknown-trigger'],
};
const preset: BotSourceRef = {
  kind: 'preset',
  presetId: 'preset-a',
  sourceLocationId: 'user-profile',
  itemId: legacy.id,
};
const params: BotsPreviewImportParams = {
  source: { kind: 'preset', presetId: 'preset-a' },
  targetScope: { kind: 'user' },
};
const catalog: BotCatalogPort = {
  read: async () => ({
    status: 'available',
    mainProviders: [],
    lanes: [],
    skills: [],
    toolIds: [],
    diagnostics: [],
  }),
};
const fingerprint = (bytes: string) =>
  createHash('sha256').update(bytes).digest('hex');
const item = (
  source: BotSourceRef = preset,
  raw: unknown = legacy,
): BotSourceItem => ({
  source,
  raw,
  fingerprint: fingerprint(JSON.stringify(raw)),
});
function fixture(items: readonly BotSourceItem[]) {
  const read = jest.fn(async () => ({ items, diagnostics: [] }));
  return {
    read,
    service: new BotImportPreviewService({ read }, catalog, {
      authorize: async (root) => root,
    }),
  };
}

describe('BotImportPreviewService non-destructive fixtures', () => {
  it('deduplicates a stable source tuple regardless of object property order', async () => {
    const reordered: BotSourceRef = {
      itemId: legacy.id,
      sourceLocationId: 'user-profile',
      presetId: 'preset-a',
      kind: 'preset',
    };
    const { service } = fixture([item(), item(reordered)]);
    const result = await service.preview(params);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.status).toBe('ambiguous');
  });
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bot-preview-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('repeated preview preserves source bytes, stable tuples and fingerprints; changed content is detectable', async () => {
    const path = join(dir, 'synthetic-preset.json');
    const initial = JSON.stringify({ agents: [legacy] }, null, 2);
    writeFileSync(path, initial);
    const reader: BotSourceReaderPort = {
      read: async () => {
        const bytes = readFileSync(path, 'utf8');
        const parsed = z
          .object({ agents: z.array(z.unknown()) })
          .parse(JSON.parse(bytes));
        return {
          items: parsed.agents.map((raw) => ({
            source: preset,
            raw,
            fingerprint: fingerprint(bytes),
          })),
          diagnostics: [],
        };
      },
    };
    const service = new BotImportPreviewService(reader, catalog, {
      authorize: async (root) => root,
    });
    const first = await service.preview(params);
    expect(await service.preview(params)).toEqual(first);
    expect(readFileSync(path, 'utf8')).toBe(initial);
    // Simulate a user edit to the source between previews; no import commit exists in phase 1.
    const changed = JSON.stringify({
      agents: [{ ...legacy, name: 'Renamed', instructions: 'Edited' }],
    });
    writeFileSync(path, changed);
    const second = await service.preview(params);
    expect(second.items[0]?.source).toEqual(first.items[0]?.source);
    expect(second.items[0]?.fingerprint).not.toBe(first.items[0]?.fingerprint);
    expect(second.items[0]?.definition?.name).toBe('Renamed');
    expect(readFileSync(path, 'utf8')).toBe(changed);
  });

  it('deduplicates an identical container identity and marks it ambiguous', async () => {
    const { service } = fixture([
      item(),
      item(preset, { ...legacy, name: 'Collision' }),
    ]);
    const result = await service.preview(params);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      source: preset,
      status: 'ambiguous',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'SOURCE_AMBIGUOUS' }),
      ]),
    });
  });

  it('keeps the same item id distinct across source locations', async () => {
    const other: BotSourceRef = {
      ...preset,
      sourceLocationId: 'other-profile',
    };
    const { service } = fixture([item(), item(other)]);
    expect(
      (await service.preview(params)).items.map((row) => row.source),
    ).toEqual([preset, other]);
  });

  it.each(['background', 'on-demand', 'scheduled'])(
    'retains exact role/instructions and inactive %s mode/triggers',
    async (executionMode) => {
      const { service } = fixture([item(preset, { ...legacy, executionMode })]);
      const result = await service.preview(params);
      expect(result.executionAvailable).toBe(false);
      expect(result.items[0]).toMatchObject({
        status: 'valid',
        originalRole: legacy.role,
        originalInstructions: legacy.instructions,
        definition: {
          instructions: `${legacy.role}\n\n${legacy.instructions}`,
          runtime: { kind: 'default' },
          triggers: [],
        },
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            code: 'LEGACY_AUTOMATION_INACTIVE',
            message: JSON.stringify({
              inactiveModes: [executionMode],
              inactiveTriggers: legacy.triggers,
            }),
          }),
          expect.objectContaining({ code: 'TOOL_UNRESOLVED' }),
        ]),
      });
    },
  );

  it('namespaces proposal identities by workspace and session and rejects foreign containers', async () => {
    const source: BotSourceRef = {
      kind: 'proposal',
      workspaceRoot: 'C:\\Project',
      sessionId: 'session-a',
      itemId: legacy.id,
    };
    const foreignRoot: BotSourceRef = { ...source, workspaceRoot: 'C:\\Other' };
    const foreignSession: BotSourceRef = { ...source, sessionId: 'session-b' };
    const { service } = fixture([
      item(source),
      item(foreignRoot),
      item(foreignSession),
      item(),
    ]);
    const result = await service.preview({
      source: {
        kind: 'proposal',
        workspaceRoot: source.workspaceRoot,
        sessionId: source.sessionId,
      },
      targetScope: { kind: 'user' },
    });
    expect(result.items.map((row) => row.status)).toEqual([
      'valid',
      'invalid',
      'invalid',
      'invalid',
    ]);
    expect(result.items.map((row) => row.source)).toEqual([
      source,
      foreignRoot,
      foreignSession,
      preset,
    ]);
  });

  it.each([
    { ...legacy, instructions: undefined },
    { ...legacy, executionMode: 'automatic' },
    { ...legacy, tools: 'shell' },
    { ...legacy, schemaVersion: 99 },
    { ...legacy, id: 'foreign' },
  ])(
    'rejects malformed or mismatched legacy content without mutation: %j',
    async (raw) => {
      const before = JSON.stringify(raw);
      const { service } = fixture([item(preset, raw)]);
      expect((await service.preview(params)).items[0]?.status).toBe('invalid');
      expect(JSON.stringify(raw)).toBe(before);
    },
  );

  it('preserves malformed source bytes on reader failure', async () => {
    const path = join(dir, 'invalid.json');
    writeFileSync(path, '{invalid JSON');
    const reader: BotSourceReaderPort = {
      read: async () => {
        const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
        return { items: [item(preset, raw)], diagnostics: [] };
      },
    };
    const service = new BotImportPreviewService(reader, catalog, {
      authorize: async (root) => root,
    });
    await expect(service.preview(params)).rejects.toMatchObject({
      code: 'BOT_SOURCE_INVALID',
    });
    expect(readFileSync(path, 'utf8')).toBe('{invalid JSON');
  });

  it('canonicalizes changed-case Windows proposal and target roots before reading', async () => {
    const source: BotSourceRef = {
      kind: 'proposal',
      workspaceRoot: 'C:\\Project',
      sessionId: 's',
      itemId: legacy.id,
    };
    const read = jest.fn(async () => ({
      items: [item(source)],
      diagnostics: [],
    }));
    const service = new BotImportPreviewService({ read }, catalog, {
      authorize: async () => 'C:\\Project',
    });
    const result = await service.preview({
      source: {
        kind: 'proposal',
        workspaceRoot: 'c:\\project',
        sessionId: 's',
      },
      targetScope: { kind: 'workspace', workspaceRoot: 'c:\\project' },
    });
    expect(read).toHaveBeenCalledWith({
      kind: 'proposal',
      workspaceRoot: 'C:\\Project',
      sessionId: 's',
    });
    expect(result.items[0]?.definition?.scope).toEqual({
      kind: 'workspace',
      workspaceRoot: 'C:\\Project',
    });
  });
});
