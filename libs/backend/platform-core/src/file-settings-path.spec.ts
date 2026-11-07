import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolvePtahSettingsDir, seedPtahSettingsFile } from './file-settings-manager';

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return { ...actual, linkSync: jest.fn(actual.linkSync), copyFileSync: jest.fn(actual.copyFileSync) };
});

describe('Ptah settings directory', () => {
  const original = process.env['PTAH_SETTINGS_DIR'];
  afterEach(() => {
    if (original === undefined) delete process.env['PTAH_SETTINGS_DIR'];
    else process.env['PTAH_SETTINGS_DIR'] = original;
  });

  it('uses override, then environment, then the production directory', () => {
    delete process.env['PTAH_SETTINGS_DIR'];
    expect(resolvePtahSettingsDir()).toBe(path.join(os.homedir(), '.ptah'));
    process.env['PTAH_SETTINGS_DIR'] = '/dev/settings';
    expect(resolvePtahSettingsDir()).toBe('/dev/settings');
    expect(resolvePtahSettingsDir('/explicit')).toBe('/explicit');
  });

  it('ignores a relative environment directory with a warning', () => {
    const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      process.env['PTAH_SETTINGS_DIR'] = 'relative-settings';
      expect(resolvePtahSettingsDir()).toBe(path.join(os.homedir(), '.ptah'));
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('must be absolute'));
    } finally {
      warning.mockRestore();
    }
  });

  it('seeds once and does not replace an existing development file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-settings-'));
    try {
      const production = path.join(root, '.ptah');
      const development = path.join(root, '.ptah-dev');
      fs.mkdirSync(production);
      fs.writeFileSync(path.join(production, 'settings.json'), JSON.stringify({ value: 1, gateway: { enabled: true, telegram: { tokenCipher: 'cipher' } }, cron: { enabled: true } }));
      seedPtahSettingsFile(production, development);
      const seeded = JSON.parse(fs.readFileSync(path.join(development, 'settings.json'), 'utf8'));
      expect(seeded).toMatchObject({ value: 1, gateway: { enabled: false, telegram: { tokenCipher: 'cipher' } }, cron: { enabled: false } });
      fs.writeFileSync(path.join(production, 'settings.json'), '{"value":2}');
      seedPtahSettingsFile(production, development);
      expect(JSON.parse(fs.readFileSync(path.join(development, 'settings.json'), 'utf8'))).toEqual(seeded);
      expect(fs.readFileSync(path.join(production, 'settings.json'), 'utf8')).toBe('{"value":2}');
      expect(fs.readdirSync(development)).toEqual(['settings.json']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a malformed source without publishing a dev file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-seed-invalid-'));
    try {
      const source = path.join(root, 'source');
      const target = path.join(root, 'target');
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'settings.json'), '{incomplete');
      expect(() => seedPtahSettingsFile(source, target)).toThrow(SyntaxError);
      expect(fs.existsSync(path.join(target, 'settings.json'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('propagates a target directory failure', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-seed-fail-'));
    try {
      const source = path.join(root, 'source');
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'settings.json'), '{}');
      const target = path.join(root, 'not-a-directory');
      fs.writeFileSync(target, 'occupied');
      expect(() => seedPtahSettingsFile(source, target)).toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not replace a file published by another process during seeding', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-seed-race-'));
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    fs.mkdirSync(source);
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(source, 'settings.json'), '{"value":"source"}');
    const publish = jest.mocked(fs.linkSync);
    publish.mockImplementation((_temp, targetPath) => {
      fs.writeFileSync(targetPath, '{"value":"other-process"}');
      const error = new Error('already exists') as NodeJS.ErrnoException;
      error.code = 'EEXIST';
      throw error;
    });
    try {
      seedPtahSettingsFile(source, target);
      expect(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'))
        .toBe('{"value":"other-process"}');
      expect(fs.readdirSync(target)).toEqual(['settings.json']);
    } finally {
      publish.mockImplementation(jest.requireActual<typeof import('fs')>('fs').linkSync);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('falls back to exclusive copy when hard links are unsupported', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-seed-copy-'));
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'settings.json'), '{"value":"source"}');
    const link = jest.mocked(fs.linkSync);
    const copy = jest.mocked(fs.copyFileSync);
    const warning = jest.spyOn(process, 'emitWarning').mockImplementation(() => {});
    const unsupported = new Error('hard links unavailable') as NodeJS.ErrnoException;
    unsupported.code = 'ENOTSUP';
    link.mockImplementation(() => { throw unsupported; });
    try {
      seedPtahSettingsFile(source, target);
      expect(warning).toHaveBeenCalledWith(unsupported);
      expect(copy).toHaveBeenCalledWith(expect.stringContaining('.seed-'), path.join(target, 'settings.json'), fs.constants.COPYFILE_EXCL);
      expect(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'))
        .toContain('"value": "source"');
      expect(fs.readdirSync(target)).toEqual(['settings.json']);
    } finally {
      link.mockImplementation(jest.requireActual<typeof import('fs')>('fs').linkSync);
      warning.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
