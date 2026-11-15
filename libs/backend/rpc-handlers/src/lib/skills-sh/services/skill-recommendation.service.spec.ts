import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SkillShEntry } from '@ptah-extension/shared';
import { SkillRecommendationService } from './skill-recommendation.service';

const entry: SkillShEntry = { source: 'owner/repo', skillId: 'angular', name: 'Angular', description: 'Angular patterns', installs: 10, isInstalled: false };
const logger = { warn: jest.fn(), debug: jest.fn() } as Pick<Logger, 'warn' | 'debug'>;
const service = new SkillRecommendationService(logger as Logger);

describe('SkillRecommendationService.recommendAnalysis', () => {
  const item = { kind: 'framework' as const, name: 'Angular', evidence: 'package.json', sourcePhase: 'project-profile' };

  it('matches, deduplicates, and carries the detected name as evidence', async () => {
    const result = await service.recommendAnalysis({ items: [item, item], summarySource: 'structured', search: async () => [entry] });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].evidence).toBe('Angular');
    expect(result.unmatchedItems).toEqual([]);
  });

  it('separates a search failure from an unmatched term', async () => {
    const result = await service.recommendAnalysis({ items: [item], summarySource: 'legacy', search: async () => { throw new Error('offline'); } });
    expect(result.searchFailures).toEqual([{ item: 'Angular', reason: 'Search failed' }]);
    expect(result.unmatchedItems).toEqual([]);
  });

  it('leaves one-character terms unmatched and requires a full token for two-character terms', async () => {
    const items = [
      { ...item, name: 'R' },
      { ...item, name: 'Go' },
    ];
    const result = await service.recommendAnalysis({
      items, summarySource: 'structured',
      search: async () => [{ ...entry, skillId: 'gopher', name: 'Gopher' }],
    });
    expect(result.skills).toEqual([]);
    expect(result.unmatchedItems).toEqual(items);
  });

  it('matches a two-character term when it is a full token', async () => {
    const result = await service.recommendAnalysis({
      items: [{ ...item, name: 'Go' }], summarySource: 'structured',
      search: async () => [{ ...entry, skillId: 'go-patterns', name: 'Go patterns' }],
    });
    expect(result.skills).toHaveLength(1);
    expect(result.unmatchedItems).toEqual([]);
  });
});
