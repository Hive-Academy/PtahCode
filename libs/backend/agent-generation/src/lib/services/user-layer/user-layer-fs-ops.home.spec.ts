/**
 * The user layer is the base of every workspace's synced skills. In the dev
 * Electron instance (`PTAH_SETTINGS_DIR` = `~/.ptah-dev`) it must not be the
 * release `~/.ptah/user`, or a dev install reaches release workspaces.
 * Nothing here writes to disk.
 */
import * as os from 'os';
import * as path from 'path';
import type { Logger } from '@ptah-extension/vscode-core';
import { UserLayerFsOps } from './user-layer-fs-ops';

describe('UserLayerFsOps home directory', () => {
  const original = process.env['PTAH_SETTINGS_DIR'];
  const devDir = path.resolve(os.tmpdir(), 'ptah-user-layer-spec', '.ptah-dev');
  const logger = { warn: jest.fn(), debug: jest.fn() } as unknown as Logger;

  afterEach(() => {
    if (original === undefined) delete process.env['PTAH_SETTINGS_DIR'];
    else process.env['PTAH_SETTINGS_DIR'] = original;
  });

  it('resolves the user layer under the dev directory', () => {
    process.env['PTAH_SETTINGS_DIR'] = devDir;
    const ops = new UserLayerFsOps(logger);
    expect(ops.userLayerBase()).toBe(path.join(devDir, 'user'));
    expect(() =>
      ops.assertUnderUserLayer(path.join(devDir, 'user', 'skills', 'x')),
    ).not.toThrow();
    expect(() =>
      ops.assertUnderUserLayer(
        path.join(os.homedir(), '.ptah', 'user', 'skills', 'x'),
      ),
    ).toThrow(/refusing to write outside/);
  });

  it('keeps ~/.ptah/user without a dev directory', () => {
    delete process.env['PTAH_SETTINGS_DIR'];
    const ops = new UserLayerFsOps(logger);
    expect(ops.userLayerBase()).toBe(
      path.resolve(os.homedir(), '.ptah', 'user'),
    );
  });
});
