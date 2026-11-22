import { closestLiveModel } from './closest-live-model';

describe('closestLiveModel', () => {
  it('prefers the nearest successor over a later version', () => {
    expect(
      closestLiveModel('claude-opus-5-5', [
        'claude-opus-6-0',
        'claude-opus-5-6',
      ]),
    ).toBe('claude-opus-5-6');
  });

  it('never crosses families: glm-5.3-flash does not match glm-5.4', () => {
    expect(closestLiveModel('glm-5.3-flash', ['glm-5.4'])).toBeNull();
  });

  it('matches an id with no version only exactly', () => {
    expect(
      closestLiveModel('kimi-for-coding', ['kimi-for-coding-highspeed', 'k3']),
    ).toBeNull();
    expect(closestLiveModel('kimi-for-coding', ['kimi-for-coding'])).toBe(
      'kimi-for-coding',
    );
  });

  it('matches an id with no family token only exactly', () => {
    expect(closestLiveModel('5.5', ['5.6'])).toBeNull();
  });

  it('moves gpt-oss:20b to gpt-oss:30b when 20b is gone', () => {
    expect(closestLiveModel('gpt-oss:20b', ['gpt-oss:30b', 'qwen3:32b'])).toBe(
      'gpt-oss:30b',
    );
  });

  it('returns the preferred id when it is live', () => {
    expect(
      closestLiveModel('claude-opus-5-5', [
        'claude-opus-5-5',
        'claude-opus-5-6',
      ]),
    ).toBe('claude-opus-5-5');
  });

  it('falls back to the greatest smaller version when no successor is live', () => {
    expect(
      closestLiveModel('claude-opus-5-5', [
        'claude-opus-4-1',
        'claude-opus-5-1',
        'claude-sonnet-6-0',
      ]),
    ).toBe('claude-opus-5-1');
  });

  it('re-appends the suffix only when the suffixed id is live', () => {
    expect(closestLiveModel('k3.1-pro[1m]', ['k3.2-pro', 'k3.2-pro[1m]'])).toBe(
      'k3.2-pro[1m]',
    );
    expect(closestLiveModel('k3.1-pro[1m]', ['k3.2-pro'])).toBe('k3.2-pro');
  });

  it('never returns a suffixed live id as a bare candidate', () => {
    expect(closestLiveModel('k3.1-pro', ['k3.2-pro[1m]'])).toBeNull();
  });

  it('prefers the same version under the suffix over a successor', () => {
    expect(closestLiveModel('k3.1-pro[1m]', ['k3.1-pro', 'k3.2-pro'])).toBe(
      'k3.1-pro',
    );
  });

  it('breaks ties by id ascending, independent of input order', () => {
    const live = ['claude_opus_5_6', 'claude-opus-5-6'];
    expect(closestLiveModel('claude-opus-5-5', live)).toBe('claude-opus-5-6');
    expect(closestLiveModel('claude-opus-5-5', [...live].reverse())).toBe(
      'claude-opus-5-6',
    );
  });

  it('is total over odd strings', () => {
    for (const odd of ['', '[]', '-', '[1m]', '9'.repeat(400), 'a--b..1']) {
      expect(() =>
        closestLiveModel(odd, [odd + 'x', '', '[x', 'a-b-2']),
      ).not.toThrow();
    }
    expect(closestLiveModel('a--b..1', ['a-b-2'])).toBe('a-b-2');
  });
});
