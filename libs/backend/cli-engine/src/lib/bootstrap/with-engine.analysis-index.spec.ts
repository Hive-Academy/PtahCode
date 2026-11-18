import 'reflect-metadata';
import { container } from 'tsyringe';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { SETTINGS_TOKENS } from '@ptah-extension/settings-core';
import { createMockLogger } from '@ptah-extension/shared/testing';

jest.mock('@ptah-extension/agent-generation', () => ({
  ...jest.requireActual<object>('../../../../agent-generation/src/lib/di/tokens'),
  migrateWorkspaceAnalysisIndex: jest.fn(
    jest.requireActual<typeof import('../../../../agent-generation/src/lib/services/migrate-workspace-analysis-index')>(
      '../../../../agent-generation/src/lib/services/migrate-workspace-analysis-index',
    ).migrateWorkspaceAnalysisIndex,
  ),
}));
jest.mock('../container.js', () => ({ CliDIContainer: {} }));
jest.mock('@ptah-extension/rpc-handlers', () => ({
  runCursorApiKeyMigration: jest.fn(async () => undefined),
}));
jest.mock('./thoth-runtime.js', () => ({}));
jest.mock('./shutdown-host-runtime.js', () => ({
  shutdownHostRuntime: jest.fn(async () => undefined),
}));

import { AGENT_GENERATION_TOKENS, migrateWorkspaceAnalysisIndex } from '@ptah-extension/agent-generation';
import { withEngine } from './with-engine';
import { CliMessageTransport } from '../transport/cli-message-transport';
import { CliWebviewManagerAdapter } from '../transport/cli-webview-manager-adapter';
import { CliFireAndForgetHandler } from '../transport/cli-fire-and-forget-handler';

function fixture() {
  const scope = container.createChildContainer();
  const logger = createMockLogger();
  const migrateLegacyBlock = jest.fn(async () => ({ written: false }));
  scope.register(TOKENS.LOGGER, { useValue: logger });
  scope.register(TOKENS.RPC_HANDLER, { useValue: {} });
  scope.register(SETTINGS_TOKENS.MIGRATION_RUNNER, {
    useValue: { runMigrations: jest.fn(async () => undefined) },
  });
  scope.register(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {
    useValue: { getWorkspaceRoot: () => '/workspace/cli', getConfiguration: () => undefined },
  });
  scope.register(AGENT_GENERATION_TOKENS.ANALYSIS_CLAUDE_MD_LINKER, {
    useValue: { migrateLegacyBlock },
  });
  const bootstrap = () => ({
    container: scope,
    logger: scope.resolve<Logger>(TOKENS.LOGGER),
    transport: new CliMessageTransport(scope),
    pushAdapter: new CliWebviewManagerAdapter(),
    fireAndForget: new CliFireAndForgetHandler(scope),
    workspaceReady: Promise.resolve(),
  });
  return { scope, bootstrap, migrateLegacyBlock };
}

beforeEach(() => jest.clearAllMocks());

describe('withEngine analysis index startup migration', () => {
  it.each(['full', 'minimal'] as const)('runs migration only in full mode: %s', async (mode) => {
    const { scope, bootstrap, migrateLegacyBlock } = fixture();
    await expect(withEngine({}, { mode, requireSdk: false, bootstrap }, async () => 'ready'))
      .resolves.toBe('ready');
    if (mode === 'full') {
      expect(migrateWorkspaceAnalysisIndex).toHaveBeenCalledWith(scope);
      expect(migrateLegacyBlock).toHaveBeenCalledWith('/workspace/cli');
    } else {
      expect(migrateWorkspaceAnalysisIndex).not.toHaveBeenCalled();
      expect(migrateLegacyBlock).not.toHaveBeenCalled();
    }
  });

  it('continues boot and runs the command while the linker never resolves', async () => {
    const { bootstrap, migrateLegacyBlock } = fixture();
    migrateLegacyBlock.mockImplementationOnce(() => new Promise(() => undefined));
    const command = jest.fn(async () => 'ready');
    await expect(withEngine({}, { mode: 'full', requireSdk: false, bootstrap }, command))
      .resolves.toBe('ready');
    expect(migrateLegacyBlock).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledTimes(1);
  });
});
