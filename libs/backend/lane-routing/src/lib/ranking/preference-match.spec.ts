import type { CliDetectionResult } from '@ptah-extension/shared';
import {
  candidateDisplayName,
  toLaneCandidate,
  toPhaseSubagentCandidate,
  toSubagentCandidate,
} from './candidate.types';
import { resolvePreferences, selectPreferences } from './preference-match';

function lane(row: Pick<CliDetectionResult, 'cli' | 'ptahCliId' | 'ptahCliName' | 'family'>) {
  return toLaneCandidate({ installed: true, messagingMode: 'none', ...row }, null);
}

const kimi = lane({ cli: 'ptah-cli', ptahCliId: 'pc-kimi', ptahCliName: 'Kimi Code', family: 'kimi' });
const ollama = lane({ cli: 'ptah-cli', ptahCliId: 'pc-ollama', ptahCliName: 'Ollama Code', family: 'ollama' });

describe('resolvePreferences', () => {
  it('gives an exact id priority over a colliding display name', () => {
    const codex = lane({ cli: 'codex' });
    const alias = lane({ cli: 'ptah-cli', ptahCliId: 'pc-codex', ptahCliName: 'codex' });
    expect(resolvePreferences(['codex'], [alias, codex])).toEqual([
      { entry: 'codex', rank: 1, ids: ['codex'], via: 'id', status: 'matched' },
    ]);
  });

  it('trims and folds Kimi and Ollama display names before matching families', () => {
    const alias = lane({ cli: 'codex', family: 'kimi code' });
    expect(resolvePreferences(['  kimi CODE  ', 'ollama CODE'], [alias, kimi, ollama])).toEqual([
      { entry: '  kimi CODE  ', rank: 1, ids: ['pc-kimi'], via: 'displayName', status: 'matched' },
      { entry: 'ollama CODE', rank: 2, ids: ['pc-ollama'], via: 'displayName', status: 'matched' },
    ]);
  });

  it('reports every id in an ambiguous family or CLI tier', () => {
    const second = lane({ cli: 'ptah-cli', ptahCliId: 'pc-second', ptahCliName: 'Another Kimi', family: 'kimi' });
    expect(resolvePreferences(['KIMI', 'PTAH-CLI'], [second, ollama, kimi])).toEqual([
      { entry: 'KIMI', rank: 1, ids: ['pc-kimi', 'pc-second'], via: 'family', status: 'ambiguous' },
      { entry: 'PTAH-CLI', rank: 2, ids: ['pc-kimi', 'pc-ollama', 'pc-second'], via: 'cli', status: 'ambiguous' },
    ]);
  });

  it('keeps entry positions and reports unknown, duplicate and ineligible selectors', () => {
    expect(resolvePreferences(
      ['missing', 'pc-kimi', 'KIMI', 'ollama'],
      [kimi, ollama],
      new Set([kimi.id]),
    )).toEqual([
      { entry: 'missing', rank: 1, ids: [], status: 'unknown' },
      { entry: 'pc-kimi', rank: 2, ids: ['pc-kimi'], via: 'id', status: 'matched' },
      { entry: 'KIMI', rank: 3, ids: ['pc-kimi'], via: 'family', status: 'duplicate' },
      { entry: 'ollama', rank: 4, ids: ['pc-ollama'], via: 'family', status: 'ineligible' },
    ]);
  });

  it('uses CLI, role and phase kind labels when there is no configured display name', () => {
    const codex = lane({ cli: 'codex' });
    const designer = toSubagentCandidate('designer');
    const design = toPhaseSubagentCandidate('design');
    expect([codex, designer, design].map(candidateDisplayName)).toEqual(['codex', 'designer', 'design']);
    expect(resolvePreferences(['DESIGNER'], [codex, designer, design])).toMatchObject([
      { ids: ['subagent:designer'], via: 'displayName', status: 'matched' },
    ]);
  });

  it('ignores blank selectors and trims or replaces directly supplied display names', () => {
    const padded = { ...kimi, displayName: '  Kimi Code  ' };
    const blank = { ...ollama, displayName: ' \t ', family: '' };
    expect([padded, blank].map(candidateDisplayName)).toEqual(['Kimi Code', ollama.id]);
    expect(resolvePreferences([' \t ', ' kimi CODE ', ollama.id], [padded, blank])).toEqual([
      { entry: ' \t ', rank: 1, ids: [], status: 'unknown', detail: 'blank selector, ignored' },
      { entry: ' kimi CODE ', rank: 2, ids: [kimi.id], via: 'displayName', status: 'matched' },
      { entry: ollama.id, rank: 3, ids: [ollama.id], via: 'id', status: 'matched' },
    ]);
  });
});

describe('selectPreferences', () => {
  const configured = [{ ...kimi, preferredRank: 1 }, { ...ollama, preferredRank: 1 }];
  const eligible = new Set([kimi.id, ollama.id]);

  it('reports an empty rule and uses the call list ahead of configured ranks', () => {
    expect(selectPreferences([], [ollama.id], configured, eligible)).toMatchObject({
      source: 'call',
      overridden: ['configured'],
      matches: [
        { source: 'rule', status: 'empty, ignored' },
        { entry: ollama.id, status: 'matched' },
      ],
      ranks: new Map([[ollama.id, 1]]),
    });
  });

  it('reports empty explicit lists and orders tied configured ranks by ordinal id', () => {
    const inventory = [{ ...kimi, preferredRank: 2 }, configured[1], { ...ollama, id: 'Z', preferredRank: 1 }];
    const expected = {
      source: 'configured',
      overridden: [],
      matches: [
        { source: 'rule', status: 'empty, ignored' },
        { source: 'call', status: 'empty, ignored' },
        { entry: 'Z', rank: 1 },
        { entry: ollama.id, rank: 1 },
        { entry: kimi.id, rank: 2 },
      ],
    };
    const eligibleIds = new Set(inventory.map(({ id }) => id));
    expect(selectPreferences([], [], inventory, eligibleIds)).toMatchObject(expected);
    expect(selectPreferences([], [], [...inventory].reverse(), eligibleIds)).toMatchObject(expected);
  });
});
