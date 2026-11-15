import 'reflect-metadata';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { container } from 'tsyringe';
import {
  USER_LAYER_COMPOSITION_TOKENS,
  type UserLayerBootstrap,
} from '@ptah-extension/user-layer-composition';
import { registerPlatformCliServices } from './registration';

jest.mock('@ptah-extension/user-layer-composition', () => ({
  USER_LAYER_COMPOSITION_TOKENS: {
    USER_LAYER_BOOTSTRAP: Symbol.for('UserLayerBootstrap'),
  },
}));

describe('CLI user layer bootstrap', () => {
  it('prepares the settings root used by the mirror', async () => {
    const root = mkdtempSync(join(tmpdir(), 'ptah-cli-bootstrap-'));
    const previous = process.env['PTAH_SETTINGS_DIR'];
    process.env['PTAH_SETTINGS_DIR'] = join(root, 'settings');
    try {
      const child = container.createChildContainer();
      registerPlatformCliServices(child, {
        appPath: root,
        userDataPath: join(root, 'other-data'),
      });
      const bootstrap = child.resolve<UserLayerBootstrap>(
        USER_LAYER_COMPOSITION_TOKENS.USER_LAYER_BOOTSTRAP,
      );
      await bootstrap.prepare(root);
      for (const name of ['skills', 'agents', 'commands']) {
        expect(existsSync(join(root, 'settings', 'user', name))).toBe(true);
      }
    } finally {
      if (previous === undefined) delete process.env['PTAH_SETTINGS_DIR'];
      else process.env['PTAH_SETTINGS_DIR'] = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
