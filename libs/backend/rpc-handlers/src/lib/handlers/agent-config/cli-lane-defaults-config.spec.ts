import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import { PTAH_CLI_PERMISSION_CAPABILITIES } from '@ptah-extension/shared';
import { readCliLaneDefaults, saveCliLaneDefaults } from './cli-lane-defaults-config';

const defaultsKey = 'ptah.agentOrchestration.cliLaneDefaults';
const legacyKey = 'ptah.agentOrchestration.codexSandboxMode';

function makeWorkspace() {
  const settings = new Map<string, unknown>();
  const getConfiguration = jest.fn((section: string, key: string, fallback: unknown) =>
    settings.has(`${section}.${key}`) ? settings.get(`${section}.${key}`) : fallback);
  const setConfiguration = jest.fn(async (section: string, key: string, value: unknown) => {
    if (value === undefined) settings.delete(`${section}.${key}`);
    else settings.set(`${section}.${key}`, value);
  });
  const workspace = { getConfiguration, setConfiguration } as unknown as IWorkspaceProvider;
  return { settings, workspace, setConfiguration };
}

const capabilities: Parameters<typeof saveCliLaneDefaults>[3] = () => PTAH_CLI_PERMISSION_CAPABILITIES;

describe('CLI lane defaults settings precedence', () => {
  it('reads a saved Codex row ahead of an explicit stale legacy Plan value after reload', async () => {
    const { settings, workspace } = makeWorkspace();
    await saveCliLaneDefaults(workspace, { codex: { permission: 'auto-edit', network: 'allow' } }, undefined, capabilities);
    settings.set(legacyKey, 'read-only');

    expect(readCliLaneDefaults(workspace).codex).toEqual({ permission: 'auto-edit', network: 'allow' });
  });

  it('uses explicit legacy read-only as Plan only when the Codex row is absent', () => {
    const { settings, workspace } = makeWorkspace();
    settings.set(legacyKey, 'read-only');

    expect(readCliLaneDefaults(workspace).codex).toEqual({ permission: 'plan', network: 'deny' });
  });

  it('round trips a non-Codex row without writing the legacy Codex key', async () => {
    const { settings, workspace, setConfiguration } = makeWorkspace();
    settings.set(legacyKey, 'read-only');
    await saveCliLaneDefaults(workspace, { 'ptah-cli': { permission: 'auto-edit', network: 'allow' } }, undefined, capabilities);

    expect(settings.get(defaultsKey)).toEqual({ 'ptah-cli': { permission: 'auto-edit', network: 'allow' } });
    expect(readCliLaneDefaults(workspace)['ptah-cli']).toEqual({ permission: 'auto-edit', network: 'allow' });
    expect(settings.get(legacyKey)).toBe('read-only');
    expect(setConfiguration).not.toHaveBeenCalledWith('ptah', 'agentOrchestration.codexSandboxMode', expect.anything());
  });
});
