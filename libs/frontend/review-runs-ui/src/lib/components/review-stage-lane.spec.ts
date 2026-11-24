import type { StageRecord } from '@ptah-extension/review-contracts';
import { fallbackNotes, laneLine } from './review-stage-lane';

const stage = (overrides: Partial<StageRecord>): StageRecord => ({
  name: 'triage', status: 'succeeded', family: 'claude', scope: null, durationMs: 100, error: null, artifactPath: null,
  ...overrides,
});

describe('laneLine', () => {
  it('gives lane, model and, when asked, the family', () => {
    expect(laneLine(stage({ lane: 'claude', model: 'claude-sonnet-4-5' }), true)).toEqual({ lane: 'claude', model: 'claude-sonnet-4-5', family: 'claude' });
    expect(laneLine(stage({ lane: 'claude', model: 'claude-sonnet-4-5' }), false)).toEqual({ lane: 'claude', model: 'claude-sonnet-4-5', family: null });
  });

  it('gives a null model for the lane default', () => {
    expect(laneLine(stage({ lane: 'codex', model: null }), false)?.model).toBeNull();
    expect(laneLine(stage({ lane: 'codex' }), false)?.model).toBeNull();
  });

  it('gives nothing for older and lane-less records', () => {
    expect(laneLine(stage({}), true)).toBeNull();
    expect(laneLine(stage({ lane: null, model: null, fallback: null }), true)).toBeNull();
  });
});

describe('fallbackNotes', () => {
  it('writes the pin sentence with and without a model', () => {
    expect(fallbackNotes(stage({ lane: 'codex', fallback: [
      { source: 'pin', lane: 'gemini', model: 'gemini-2.5-pro', reason: 'lane-not-listed' },
    ] }))).toEqual(['Fallback: pinned gemini / gemini-2.5-pro was unavailable (lane not listed). Ran on codex.']);
    expect(fallbackNotes(stage({ lane: 'codex', fallback: [
      { source: 'pin', lane: 'gemini', model: null, reason: 'at-limit' },
    ] }))).toEqual(['Fallback: pinned gemini was unavailable (at limit). Ran on codex.']);
  });

  it('writes one pool sentence per skipped entry', () => {
    expect(fallbackNotes(stage({ lane: 'claude', fallback: [
      { source: 'pool', lane: 'copilot', model: 'gpt-5', reason: 'model-blocked' },
      { source: 'pool', lane: 'gemini', model: 'gemini-2.5-pro', reason: 'model-not-offered' },
    ] }))).toEqual([
      'Fallback: pool entry copilot skipped (model blocked). Ran on claude.',
      'Fallback: pool entry gemini skipped (model not offered). Ran on claude.',
    ]);
  });

  it('says no lane ran when every entry was skipped', () => {
    expect(fallbackNotes(stage({ lane: null, fallback: [{ source: 'pool', lane: 'codex', model: null, reason: 'at-limit' }] })))
      .toEqual(['Fallback: pool entry codex skipped (at limit). No lane ran.']);
  });

  it('gives no notes for older records', () => {
    expect(fallbackNotes(stage({}))).toEqual([]);
    expect(fallbackNotes(stage({ fallback: null }))).toEqual([]);
  });
});
