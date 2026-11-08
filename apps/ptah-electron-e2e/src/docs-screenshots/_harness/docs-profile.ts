import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import type { ElectronApplication } from '@playwright/test';
import { HOME_ENV_KEYS } from '../../support/tray-home';

export interface DocsProfile {
  runDir: string;
  dir: string;
  /** Disposable stand-in for os.homedir(), including ~/.ptah. */
  home: string;
  env: Record<string, string>;
  cleanup: () => void;
  seeded: boolean;
}
const originalHome = os.homedir();
const productionPtah = path.resolve(originalHome, '.ptah');
const repoRoot = path.resolve(__dirname, '../../../../..');
const normalize = (value: string): string => process.platform === 'win32' ? value.toLowerCase() : value;
const canonical = (value: string): string => fs.existsSync(value) ? fs.realpathSync.native(value) : path.resolve(value);

export function productionSettingsHash(): string | undefined {
  const file = path.join(productionPtah, 'settings.json');
  return fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : undefined;
}

export function assertProductionSettingsUnchanged(before: string | undefined): void {
  if (productionSettingsHash() !== before) throw new Error('[docs-shot] real ~/.ptah/settings.json changed during capture');
}

export function assertSettingsOrRetain(before: string | undefined, runDir: string): void {
  try {
    assertProductionSettingsUnchanged(before);
  } catch (error: unknown) {
    process.stderr.write(`[docs-capture] settings changed; capture retained at ${runDir}\n`);
    throw error;
  }
}

export async function assertChildHome(app: ElectronApplication, home: string): Promise<void> {
  const child = await app.evaluate(() => ({ userProfile: process.env['USERPROFILE'], home: process.env['HOME'] }));
  if (child.userProfile !== home || child.home !== home) throw new Error('[docs-shot] Electron process home escaped temporary capture home');
}

export async function closeDocsApp(app: ElectronApplication): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const closed = await Promise.race([
    app.close().then(() => true).catch(() => false),
    new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 20_000); }),
  ]);
  if (timer) clearTimeout(timer);
  if (!closed) app.process().kill();
}

/** The development app's userData location; never the production ~/.ptah profile. */
export function realProfileDir(): string {
  const candidate = process.env['PTAH_DOCS_SOURCE_PROFILE']?.trim();
  if (candidate) {
    const resolved = normalize(canonical(candidate));
    const forbidden = normalize(canonical(productionPtah));
    if (resolved === forbidden || resolved.startsWith(forbidden + path.sep)) {
      throw new Error('[docs-shot] PTAH_DOCS_SOURCE_PROFILE cannot be the real ~/.ptah or a path inside it');
    }
    return path.resolve(candidate);
  }
  const appData = process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'Ptah Dev');
}

export interface DocsProfileOptions {
  folders?: string[];
  /** Copy saved session state for one explicitly selected development workspace. */
  devSessionWorkspace?: string;
}

/** Default shots copy no profile files; saved-session shots opt into one workspace. */
const PROFILE_COPY_ALLOWLIST: readonly string[] = [];

/** Copy only the two development databases and their live SQLite sidecars. */
function copyDevelopmentDatabases(stateDir: string): { main: string; sessions: string } {
  const sourceDir = path.join(originalHome, '.ptah', 'state');
  const copyFamily = (file: 'ptah-dev.sqlite' | 'sessions-dev.sqlite'): string => {
    const source = path.join(sourceDir, file);
    if (!fs.existsSync(source)) throw new Error(`[docs-shot] required development database is missing: ${file}`);
    const members = ['', '-wal', '-shm'].filter((suffix) => fs.existsSync(source + suffix));
    const snapshot = members.map((suffix) => {
      const member = source + suffix;
      const stat = fs.lstatSync(member);
      if (!stat.isFile()) throw new Error(`[docs-shot] development database member is not a regular file: ${file}${suffix}`);
      return { suffix, size: stat.size, mtimeMs: stat.mtimeMs };
    });
    for (const { suffix, size } of snapshot) {
      const destination = path.join(stateDir, file + suffix);
      fs.copyFileSync(source + suffix, destination);
      if (fs.statSync(destination).size !== size) throw new Error(`[docs-shot] incomplete development database copy: ${file}${suffix}`);
    }
    for (const { suffix, size, mtimeMs } of snapshot) {
      const member = source + suffix;
      if (!fs.existsSync(member)) throw new Error(`[docs-shot] development database changed during copy: ${file}${suffix}`);
      const stat = fs.lstatSync(member);
      if (!stat.isFile() || stat.size !== size || stat.mtimeMs !== mtimeMs) {
        throw new Error(`[docs-shot] development database changed during copy: ${file}${suffix}`);
      }
    }
    if (['-wal', '-shm'].some((suffix) => fs.existsSync(source + suffix) !== members.includes(suffix))) {
      throw new Error(`[docs-shot] development database sidecars changed during copy: ${file}`);
    }
    return path.join(stateDir, file);
  };
  return { main: copyFamily('ptah-dev.sqlite'), sessions: copyFamily('sessions-dev.sqlite') };
}

export function prepareDocsProfile(options: DocsProfileOptions = {}): DocsProfile {
  const configured = process.env['PTAH_DOCS_CAPTURE_DIR']?.trim();
  if (configured && !path.isAbsolute(configured)) throw new Error('[docs-shot] PTAH_DOCS_CAPTURE_DIR must be absolute');
  const base = path.resolve(configured || path.join(repoRoot, '.ptah/tmp/docs-capture'));
  if ([repoRoot, process.cwd()].some((root) => normalize(canonical(root)) === normalize(canonical(base)))) {
    throw new Error('[docs-shot] PTAH_DOCS_CAPTURE_DIR cannot be the repository root or cwd');
  }
  fs.mkdirSync(base, { recursive: true });
  const runDir = fs.mkdtempSync(path.join(base, 'run-'));
  const dir = path.join(runDir, 'profile');
  const home = path.join(runDir, 'home');
  try {
  fs.mkdirSync(dir);
  fs.mkdirSync(home);
  fs.mkdirSync(path.join(runDir, 'state'));
  const homePtah = path.join(home, '.ptah');
  fs.mkdirSync(homePtah);
  const env: Record<string, string> = { APPDATA: dir, LOCALAPPDATA: dir, PTAH_DB_PATH: path.join(runDir, 'state', 'ptah.sqlite') };
  for (const key of HOME_ENV_KEYS) env[key] = home;
  if (options.devSessionWorkspace) {
    const copies = copyDevelopmentDatabases(path.join(runDir, 'state'));
    env['PTAH_DB_PATH'] = copies.main;
    env['PTAH_SESSIONS_DB_PATH'] = copies.sessions;
  }
  // D14 disables live prompts. Saved transcript readers use os.homedir(), so
  // CLAUDE_CONFIG_DIR cannot make them replay from the original home.
  // Adding a source file here requires an explicit privacy review.
  for (const file of PROFILE_COPY_ALLOWLIST) {
    fs.copyFileSync(path.join(realProfileDir(), file), path.join(dir, file));
  }
  if (options.devSessionWorkspace) {
    const workspaceKey = Buffer.from(path.resolve(options.devSessionWorkspace)).toString('base64url');
    const source = path.join(realProfileDir(), 'workspace-storage', workspaceKey);
    if (!fs.existsSync(source)) {
      throw new Error('[docs-shot] selected development workspace has no saved state');
    }
    fs.cpSync(source, path.join(dir, 'workspace-storage', workspaceKey), { recursive: true });
    fs.cpSync(source, path.join(homePtah, 'workspace-storage', workspaceKey), { recursive: true });
  }
  const folders = options.folders ?? [];
  if (folders.length > 0) {
    fs.writeFileSync(path.join(dir, 'global-state.json'), JSON.stringify({
      'ptah.workspaces': { folders, activeIndex: 0 },
    }), 'utf8');
  }
  return {
    runDir,
    dir,
    home,
    env,
    seeded: folders.length > 0,
    cleanup: () => {
      if (process.env['PTAH_DOCS_KEEP_CAPTURE'] === '1') return;
      for (const target of [runDir]) {
        try {
          fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
        } catch (error: unknown) {
          if (process.platform !== 'win32' || !(error instanceof Error) ||
              !('code' in error) || !['EPERM', 'EBUSY'].includes(String(error.code))) {
            throw error;
          }
          // Intentional suppression: Electron can retain a Windows file handle
          // after its process exits; the temporary home is safe to discard later.
          process.stderr.write('[docs-shot] temporary profile retained by Windows file lock\n');
        }
      }
    },
  };
  } catch (error: unknown) {
    if (process.env['PTAH_DOCS_KEEP_CAPTURE'] !== '1') fs.rmSync(runDir, { recursive: true, force: true });
    throw error;
  }
}
