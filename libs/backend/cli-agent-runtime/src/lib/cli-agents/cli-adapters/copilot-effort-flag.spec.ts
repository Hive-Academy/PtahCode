import { probeCliStdout } from './cli-stdout-probe';
import { probeCopilotEffortFlag } from './copilot-effort-flag';

jest.mock('./cli-stdout-probe', () => ({
  probeCliStdout: jest.fn(),
}));

const mockProbeCliStdout = jest.mocked(probeCliStdout);

describe('probeCopilotEffortFlag', () => {
  beforeEach(() => {
    mockProbeCliStdout.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefers reasoning-effort when both flags are available', async () => {
    mockProbeCliStdout.mockResolvedValue('  --effort <level>\n  --reasoning-effort=<level>');
    await expect(probeCopilotEffortFlag('/bin/preferred/copilot', '1.0'))
      .resolves.toBe('--reasoning-effort');
    expect(mockProbeCliStdout).toHaveBeenCalledWith('/bin/preferred/copilot', ['--help'], {
      spawner: undefined,
      timeoutMs: 5000,
      requireSuccess: true,
    });
  });

  it('falls back to effort when that is the only effort flag', async () => {
    mockProbeCliStdout.mockResolvedValue('  --effort <level>');
    await expect(probeCopilotEffortFlag('/bin/fallback/copilot', '1.0')).resolves.toBe('--effort');
  });

  it('caches successful help output containing no effort flag', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockProbeCliStdout.mockResolvedValue('  --effort-mode <mode>\n  --no-reasoning-effort');
    await expect(probeCopilotEffortFlag('/bin/unsupported/copilot', '1.0')).resolves.toBeUndefined();
    await expect(probeCopilotEffortFlag('/bin/unsupported/copilot', '1.0')).resolves.toBeUndefined();
    expect(mockProbeCliStdout).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('evicts a failed probe so the next call can discover support', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockProbeCliStdout.mockResolvedValueOnce(undefined).mockResolvedValueOnce('  --effort <level>');

    await expect(probeCopilotEffortFlag('/bin/unavailable/copilot', '1.0')).resolves.toBeUndefined();
    await expect(probeCopilotEffortFlag('/bin/unavailable/copilot', '1.0')).resolves.toBe('--effort');
    expect(mockProbeCliStdout).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls).toEqual([['[Copilot CLI] Could not probe effort flag support.']]);
  });

  it('keeps rejected probe details out of the warning', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockProbeCliStdout.mockRejectedValue(new Error('probe detail'));

    await expect(probeCopilotEffortFlag('/bin/rejected/copilot', '1.0')).resolves.toBeUndefined();
    expect(warn.mock.calls).toEqual([['[Copilot CLI] Could not probe effort flag support.']]);
  });

  it('shares an in-flight probe and probes again when the path or version changes', async () => {
    mockProbeCliStdout
      .mockResolvedValueOnce('  --effort <level>')
      .mockResolvedValueOnce('  --reasoning-effort <level>')
      .mockResolvedValueOnce('  --model <model>');

    const first = probeCopilotEffortFlag('/bin/a/copilot', '1.0');
    const concurrent = probeCopilotEffortFlag('/bin/a/copilot', '1.0');
    await expect(Promise.all([first, concurrent])).resolves.toEqual(['--effort', '--effort']);
    expect(mockProbeCliStdout).toHaveBeenCalledTimes(1);

    await expect(probeCopilotEffortFlag('/bin/a/copilot', '2.0')).resolves.toBe('--reasoning-effort');
    await expect(probeCopilotEffortFlag('/bin/b/copilot', '2.0')).resolves.toBeUndefined();
    await expect(probeCopilotEffortFlag('/bin/a/copilot', '1.0')).resolves.toBe('--effort');
    expect(mockProbeCliStdout).toHaveBeenCalledTimes(3);
  });
});
