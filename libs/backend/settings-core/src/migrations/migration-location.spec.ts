import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecretsFileStore } from '../encryption/secrets-file-store';
import { MigrationRunner } from './runner';
import { runV3Migration } from './v3-migration';

describe('migration storage locations', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-migration-location-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('places dev markers beside dev settings and retains a separate prefix', async () => {
    const productionDir = path.join(root, '.ptah');
    const developmentDir = path.join(root, '.ptah-dev');
    const migration = jest.fn().mockResolvedValue(undefined);
    const runner = new MigrationRunner(developmentDir, [migration], developmentDir, 'dev-v');

    await runner.runMigrations();
    await runner.runMigrations();

    expect(migration).toHaveBeenCalledTimes(1);
    expect(migration).toHaveBeenCalledWith(developmentDir);
    expect(fs.existsSync(path.join(developmentDir, 'migrations', 'dev-v1.applied'))).toBe(true);
    expect(fs.existsSync(path.join(productionDir, 'migrations'))).toBe(false);
  });

  it('keeps the default production marker location and prefix', async () => {
    const productionDir = path.join(root, '.ptah');
    const runner = new MigrationRunner(productionDir, [async () => undefined]);
    await runner.runMigrations();
    expect(fs.existsSync(path.join(productionDir, 'migrations', 'v1.applied'))).toBe(true);
  });

  it('writes V3 secrets to the supplied production secrets directory', async () => {
    const settingsDir = path.join(root, '.ptah-dev');
    const secretsDir = path.join(root, '.ptah');
    fs.mkdirSync(settingsDir);
    fs.mkdirSync(secretsDir);
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
      gateway: { telegram: { tokenCipher: 'encrypted-token' } },
    }));
    const key = Buffer.alloc(32, 7);
    const provider = { getMasterKey: jest.fn().mockResolvedValue(key) };

    await runV3Migration(settingsDir, provider, secretsDir);

    expect(await new SecretsFileStore(secretsDir).read('gateway.telegram.tokenCipher', key))
      .toBe('encrypted-token');
    expect(fs.existsSync(path.join(settingsDir, 'secrets.enc.json'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(settingsDir, 'settings.json'), 'utf8'))
      .gateway.telegram.tokenCipher).toBeUndefined();
  });
});
