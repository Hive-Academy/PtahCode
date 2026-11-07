import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { container } from 'tsyringe';
import { PLATFORM_TOKENS, type IUserInteraction } from '@ptah-extension/platform-core';
import { SETTINGS_TOKENS, type ISettingsMigrator } from '@ptah-extension/settings-core';
import { ElectronWorkspaceProvider } from '../implementations/electron-workspace-provider';
import { registerElectronSettings } from './electron-settings-registration';

describe('registerElectronSettings migrations', () => {
  const originalEnv = process.env['PTAH_SETTINGS_DIR'];
  const originalMode = process.env['NODE_ENV'];

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['PTAH_SETTINGS_DIR'];
    else process.env['PTAH_SETTINGS_DIR'] = originalEnv;
    if (originalMode === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = originalMode;
  });

  it('runs dev migrations and writes sentinels beside dev settings', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-electron-migrations-'));
    const settingsDir = path.join(root, '.ptah-dev');
    const appDataDir = path.join(root, 'app-data');
    fs.mkdirSync(settingsDir);
    fs.mkdirSync(appDataDir);
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), '{}');
    process.env['PTAH_SETTINGS_DIR'] = settingsDir;
    process.env['NODE_ENV'] = 'development';
    const scope = container.createChildContainer();
    const workspaceProvider = new ElectronWorkspaceProvider(appDataDir);
    const interaction: IUserInteraction = {
      showErrorMessage: async () => undefined,
      showWarningMessage: async () => undefined,
      showInformationMessage: async () => undefined,
      showQuickPick: async () => undefined,
      showInputBox: async () => undefined,
      withProgress: async (_options, task) => task({ report: () => undefined }, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) }),
      openExternal: async () => true,
      writeToClipboard: async () => undefined,
      openOAuthUrl: async () => ({ opened: true }),
    };
    scope.register(PLATFORM_TOKENS.WORKSPACE_PROVIDER, { useValue: workspaceProvider });
    scope.register(PLATFORM_TOKENS.USER_INTERACTION, { useValue: interaction });
    try {
      registerElectronSettings(scope);
      const runner = scope.resolve<ISettingsMigrator>(SETTINGS_TOKENS.MIGRATION_RUNNER);
      await runner.runMigrations();
      expect(fs.existsSync(path.join(settingsDir, 'migrations', 'dev-v1.applied'))).toBe(true);
      expect(fs.existsSync(path.join(root, '.ptah', 'migrations'))).toBe(false);
    } finally {
      workspaceProvider.fileSettings.disposeCrossProcessWatch();
      scope.clearInstances();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
