/**
 * The dev Electron instance sets `PTAH_SETTINGS_DIR` to `~/.ptah-dev`. Its
 * skill store (plugins, templates) must follow, or a skill installed in dev
 * lands in the release store and propagates into the release app's workspaces.
 * No path here is created on disk.
 */
import * as os from 'os';
import * as path from 'path';
import { ContentDownloadService } from './content-download.service';
import { resolvePtahHomeDir } from './file-settings-manager';

describe('resolvePtahHomeDir', () => {
  const original = process.env['PTAH_SETTINGS_DIR'];
  const devDir = path.join(os.tmpdir(), 'ptah-home-dir-spec', '.ptah-dev');

  afterEach(() => {
    if (original === undefined) delete process.env['PTAH_SETTINGS_DIR'];
    else process.env['PTAH_SETTINGS_DIR'] = original;
  });

  it('is ~/.ptah when no dev directory is set (release, VS Code, CLI)', () => {
    delete process.env['PTAH_SETTINGS_DIR'];
    expect(resolvePtahHomeDir()).toBe(path.join(os.homedir(), '.ptah'));
  });

  it('is the dev settings directory when one is set', () => {
    process.env['PTAH_SETTINGS_DIR'] = devDir;
    expect(resolvePtahHomeDir()).toBe(devDir);
  });

  it('puts the content download plugin store under the dev directory', () => {
    process.env['PTAH_SETTINGS_DIR'] = devDir;
    const service = new ContentDownloadService();
    expect(service.getPluginsPath()).toBe(path.join(devDir, 'plugins'));
  });

  it('keeps the content download plugin store at ~/.ptah without a dev directory', () => {
    delete process.env['PTAH_SETTINGS_DIR'];
    const service = new ContentDownloadService();
    expect(service.getPluginsPath()).toBe(
      path.join(os.homedir(), '.ptah', 'plugins'),
    );
  });
});
