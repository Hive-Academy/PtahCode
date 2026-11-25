import 'reflect-metadata';
import type { ReviewLaneCatalog, ReviewLaneSettings } from '@ptah-extension/review-contracts';
import { ReviewLaneListingService } from './review-lane-listing.service';
import type { ReviewLaneSource } from './review-lane-selection';
import type { ReviewLaneCandidate } from './review-lane-list';

const saved: ReviewLaneSettings = {
  pool: [{ lane: 'codex', model: 'gpt-5.3-codex' }, { lane: 'claude', model: null }],
  pins: { verifier: { lane: 'gemini', model: 'gemini-3-pro' }, triage: { lane: 'codex', model: 'gpt-5.3-codex' } },
};
const failed: ReviewLaneCatalog = { status: 'failed', models: [], truncated: false, verifiable: false };

function setup(lanes: ReviewLaneCandidate[]) {
  const source = {
    list: jest.fn(async () => ({ lanes, maxConcurrentAgents: 4 })),
    listModels: jest.fn<Promise<Record<string, ReviewLaneCatalog>>, [readonly string[], AbortSignal]>(async () => ({})),
    modelBlocked: jest.fn((_model: string) => false),
  } satisfies ReviewLaneSource;
  const settings = { get: jest.fn(async () => saved) };
  const logger = { warn: jest.fn() };
  return { source, settings, logger, service: new ReviewLaneListingService(source, settings, logger) };
}

describe('ReviewLaneListingService', () => {
  it('lists lanes with their catalogs, a failed catalog for unread lanes, blocked saved models and a blocked default', async () => {
    const { service, source } = setup([
      { id: 'codex', label: 'Codex', family: 'codex', limitState: 'confirmed-room' },
      { id: 'ptah-cli:pc-1', label: 'My CLI', family: 'claude', limitState: 'at-limit', defaultModelBlocked: true },
    ]);
    const read: ReviewLaneCatalog = { status: 'read', models: ['gpt-5.3-codex'], truncated: false, verifiable: true };
    source.listModels.mockResolvedValue({ codex: read });
    source.modelBlocked.mockImplementation((model) => model === 'gemini-3-pro');
    const listing = await service.list();
    expect(listing).toEqual({
      lanes: [
        { id: 'codex', label: 'Codex', family: 'codex', limitState: 'confirmed-room', catalog: read },
        { id: 'ptah-cli:pc-1', label: 'My CLI', family: 'claude', limitState: 'at-limit', catalog: failed, defaultModelBlocked: true },
      ],
      blockedModels: ['gemini-3-pro'],
    });
    // An unblocked default carries no key at all (8.1).
    expect(Object.prototype.hasOwnProperty.call(listing.lanes[0], 'defaultModelBlocked')).toBe(false);
    expect(source.listModels).toHaveBeenCalledWith(['codex', 'ptah-cli:pc-1'], expect.any(AbortSignal));
    // Each distinct saved model is checked once.
    expect(source.modelBlocked.mock.calls.map(([model]) => model)).toEqual(['gpt-5.3-codex', 'gemini-3-pro']);
  });

  it('marks every catalog failed and warns when the catalog read rejects', async () => {
    const { service, source, logger } = setup([{ id: 'codex', label: 'Codex', family: 'codex', limitState: 'unknown' }]);
    source.listModels.mockRejectedValue(new Error('token ghp_secret'));
    await expect(service.list()).resolves.toEqual({
      lanes: [{ id: 'codex', label: 'Codex', family: 'codex', limitState: 'unknown', catalog: failed }],
      blockedModels: [],
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('ghp_secret');
  });

  it('drops a lane row the contract cannot carry and an invalid catalog, keeping the other lanes', async () => {
    const { service, source, logger } = setup([
      { id: '../codex', label: 'Bad', family: 'codex', limitState: 'unknown' },
      { id: 'constructor', label: 'Odd', family: 'x', limitState: 'unknown' },
      { id: 'codex', label: 'Codex', family: 'codex', limitState: 'unknown' },
    ]);
    source.listModels.mockResolvedValue({ codex: { status: 'read', models: 'nope' } as unknown as ReviewLaneCatalog });
    const listing = await service.list();
    expect(listing.lanes.map((lane) => [lane.id, lane.catalog.status])).toEqual([['constructor', 'failed'], ['codex', 'failed']]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('left out'), { dropped: 1 });
  });

  it('propagates a lane list failure', async () => {
    const { service, source } = setup([]);
    source.list.mockRejectedValue(new Error('list down'));
    await expect(service.list()).rejects.toThrow('list down');
  });
});
