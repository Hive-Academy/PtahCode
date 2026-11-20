import 'reflect-metadata';
import { container } from 'tsyringe';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { TOKENS } from '@ptah-extension/vscode-core';
import { AGENT_GENERATION_TOKENS } from '../di/tokens';
import { migrateWorkspaceAnalysisIndex } from './migrate-workspace-analysis-index';

describe('migrateWorkspaceAnalysisIndex startup boundary', () => {
  function fixture() {
    const scope = container.createChildContainer();
    const debug = jest.fn();
    const migrateLegacyBlock = jest.fn().mockResolvedValue({ written: false });
    scope.register(TOKENS.LOGGER, { useValue: { debug } });
    scope.register(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
      useValue: { getWorkspaceRoot: () => '/workspace/cli' },
    });
    scope.register(AGENT_GENERATION_TOKENS.ANALYSIS_CLAUDE_MD_LINKER, {
      useValue: { migrateLegacyBlock },
    });
    return { scope, debug, migrateLegacyBlock };
  }

  it('uses the explicit Electron workspace root', async () => {
    const { scope, migrateLegacyBlock } = fixture();
    await migrateWorkspaceAnalysisIndex(scope, '/workspace/electron');
    expect(migrateLegacyBlock).toHaveBeenCalledWith('/workspace/electron');
  });

  it('uses the CLI workspace provider when no root is supplied', async () => {
    const { scope, migrateLegacyBlock } = fixture();
    await migrateWorkspaceAnalysisIndex(scope);
    expect(migrateLegacyBlock).toHaveBeenCalledWith('/workspace/cli');
  });

  it('logs and continues when the linker rejects', async () => {
    const { scope, debug, migrateLegacyBlock } = fixture();
    migrateLegacyBlock.mockRejectedValueOnce(new Error('unavailable'));
    await expect(migrateWorkspaceAnalysisIndex(scope)).resolves.toBeUndefined();
    expect(debug).toHaveBeenCalledWith(expect.any(String), { error: 'unavailable' });
  });

  it('logs and continues when linker resolution fails', async () => {
    const { scope, debug } = fixture();
    scope.register(AGENT_GENERATION_TOKENS.ANALYSIS_CLAUDE_MD_LINKER, {
      useFactory: () => { throw new Error('resolution failed'); },
    });
    await expect(migrateWorkspaceAnalysisIndex(scope)).resolves.toBeUndefined();
    expect(debug).toHaveBeenCalledWith(expect.any(String), { error: 'resolution failed' });
  });
});
