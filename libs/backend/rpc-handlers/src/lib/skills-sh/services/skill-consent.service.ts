/**
 * Skill Consent Service
 *
 * Detects skill packages that carry scripts and enforces owner consent.
 * Consent binds to a content hash of every file in the package, so a
 * changed package needs new consent. The version is for display only.
 *
 * @module @ptah-extension/agent-generation/services
 */

import { injectable, inject } from 'tsyringe';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { Logger, RpcUserError, TOKENS } from '@ptah-extension/vscode-core';

const SCRIPT_EXTENSIONS = new Set([
  '.sh',
  '.ps1',
  '.bat',
  '.cmd',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.py',
  '.rb',
]);
const INSTALL_SCRIPT_KEYS = [
  'postinstall',
  'install',
  'preinstall',
  'prepublish',
];
const MAX_DEPTH = 16;
const MAX_FILES = 500;
const MAX_BYTES = 10 * 1024 * 1024;

@injectable()
export class SkillConsentService {
  private storePath = join(
    homedir(),
    '.ptah',
    'setup-wizard',
    'skill-consents.json',
  );

  constructor(@inject(TOKENS.LOGGER) private readonly logger: Logger) {}

  /** Override the consent file location (tests, custom roots). */
  useStorePath(path: string): void {
    this.storePath = path;
  }

  /** True when the package has script files or install hooks. Fails closed. */
  hasScripts(skillPackagePath: string): boolean {
    try {
      return this.scan(skillPackagePath, 0);
    } catch (error) {
      // degradation-audit: reported - the scan failure is logged and script detection fails closed.
      this.logger.warn('[SkillConsent] script scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  /** Content hash over all files, sorted by path, bytes as stored. */
  computeContentHash(skillPackagePath: string): string {
    const files = this.listFiles(skillPackagePath, 0, { files: 0, bytes: 0 }).sort();
    const hash = createHash('sha256');
    for (const file of files) {
      if (!this.isInsideRoot(file, skillPackagePath))
        throw new Error('Skill path escapes root');
      hash.update(relative(skillPackagePath, file).split('\\').join('/'));
      hash.update('\0');
      hash.update(readFileSync(file));
      hash.update('\0');
    }
    return hash.digest('hex');
  }

  canInstall(skillName: string, contentHash: string): boolean {
    return this.read().some(
      (r) => r.skillName === skillName && r.contentHash === contentHash,
    );
  }

  recordConsent(skillName: string, contentHash: string): void {
    const records = this.read().filter(
      (r) => !(r.skillName === skillName && r.contentHash === contentHash),
    );
    records.push({
      skillName,
      contentHash,
      consentDate: new Date().toISOString(),
    });
    try {
      mkdirSync(dirname(this.storePath), { recursive: true });
      const tmp = `${this.storePath}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, records }, null, 2));
      renameSync(tmp, this.storePath);
    } catch (error) {
      // Log the failure only, never the consent store contents.
      this.logger.warn('[SkillConsent] failed to persist consent', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private read(): {
    skillName: string;
    contentHash: string;
    consentDate: string;
  }[] {
    if (!existsSync(this.storePath)) {
      this.logger.debug('[SkillConsent] consent store missing');
      return [];
    }
    try {
      const parsed = JSON.parse(readFileSync(this.storePath, 'utf8'));
      return Array.isArray(parsed?.records) ? parsed.records : [];
    } catch (error) {
      // degradation-audit: reported - the store read failure is logged and no consent is granted.
      this.logger.warn('[SkillConsent] could not read consent store', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private listFiles(
    dir: string,
    depth: number,
    budget: { files: number; bytes: number },
  ): string[] {
    if (depth > MAX_DEPTH) throw new Error('depth limit');
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (!this.isInsideRoot(full, dir))
        throw new Error('Skill path escapes root');
      if (entry.isSymbolicLink())
        throw new Error('Skill package contains a symbolic link');
      if (entry.isDirectory()) out.push(...this.listFiles(full, depth + 1, budget));
      else {
        budget.files++;
        budget.bytes += statSync(full).size;
        if (budget.files > MAX_FILES || budget.bytes > MAX_BYTES)
          throw new RpcUserError(
            'Skill package exceeds the file or size limit.',
            'INVALID_PARAMS',
          );
        out.push(full);
      }
    }
    return out;
  }

  private scan(dir: string, depth: number): boolean {
    for (const file of this.listFiles(dir, depth, { files: 0, bytes: 0 })) {
      const name = file.split(/[\\/]/).pop() as string;
      if (SCRIPT_EXTENSIONS.has(extname(name).toLowerCase())) return true;
      if (readFileSync(file).subarray(0, 2).toString() === '#!') return true;
      if (name === 'package.json' && this.hasInstallScripts(file)) return true;
      if (/^skill\.md$/i.test(name) && this.hasFrontmatterHooks(file)) {
        return true;
      }
    }
    return false;
  }

  private isInsideRoot(candidate: string, root: string): boolean {
    const rel = relative(resolve(root), resolve(candidate));
    return (
      rel === '' ||
      (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
    );
  }

  private hasInstallScripts(file: string): boolean {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    const scripts = pkg?.scripts;
    return (
      !!scripts &&
      typeof scripts === 'object' &&
      INSTALL_SCRIPT_KEYS.some((k) => k in scripts)
    );
  }

  private hasFrontmatterHooks(file: string): boolean {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(
      readFileSync(file, 'utf8'),
    );
    return !!match && /^\s*hooks\s*:/m.test(match[1]);
  }
}
