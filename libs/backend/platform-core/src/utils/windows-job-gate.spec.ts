import { shouldUseWindowsJob } from './windows-job-gate';

describe('shouldUseWindowsJob', () => {
  const base = { policy: 'job' as const, settingEnabled: true, platform: 'win32' as const, arch: 'x64' };
  it('accepts the setting or environment switch', () => {
    expect(shouldUseWindowsJob(base)).toBe(true);
    expect(shouldUseWindowsJob({ ...base, settingEnabled: false, env: '1' })).toBe(true);
  });
  it('requires policy, platform, architecture, and a switch', () => {
    for (const change of [
      { policy: 'no-job' as const }, { policy: undefined },
      { platform: 'linux' as const }, { arch: 'arm64' },
      { settingEnabled: false },
    ]) expect(shouldUseWindowsJob({ ...base, ...change })).toBe(false);
  });
});
