import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { prepareDevelopmentSettings } from './dev-settings';

describe('prepareDevelopmentSettings', () => {
  const original = process.env['PTAH_SETTINGS_DIR'];
  afterEach(() => {
    if (original === undefined) delete process.env['PTAH_SETTINGS_DIR'];
    else process.env['PTAH_SETTINGS_DIR'] = original;
  });

  it('continues with isolated defaults after a seed failure and reports the Error', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-dev-seed-'));
    try {
      const productionDir = path.join(root, '.ptah');
      const developmentDir = path.join(root, '.ptah-dev');
      fs.mkdirSync(productionDir);
      fs.writeFileSync(path.join(productionDir, 'settings.json'), '{invalid');
      const reportFailure = jest.fn();

      expect(() => prepareDevelopmentSettings(productionDir, developmentDir, reportFailure))
        .not.toThrow();
      expect(process.env['PTAH_SETTINGS_DIR']).toBe(developmentDir);
      expect(reportFailure).toHaveBeenCalledWith(expect.any(SyntaxError));
      expect(fs.existsSync(path.join(developmentDir, 'settings.json'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
