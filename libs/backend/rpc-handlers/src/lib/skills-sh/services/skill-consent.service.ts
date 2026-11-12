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
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join, relative } from 'node:path';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';

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
    } catch {
      return true;
    }
  }

  /** Content hash over all files, sorted by path, bytes as stored. */
  computeContentHash(skillPackagePath: string): string {
    const files = this.listFiles(skillPackagePath, 0).sort();
    const hash = createHash('sha256');
    for (const file of files) {
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
    if (!existsSync(this.storePath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.storePath, 'utf8'));
      return Array.isArray(parsed?.records) ? parsed.records : [];
    } catch {
      return [];
    }
  }

  private listFiles(dir: string, depth: number): string[] {
    if (depth > MAX_DEPTH) throw new Error('depth limit');
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...this.listFiles(full, depth + 1));
      else out.push(full);
    }
    return out;
  }

  private scan(dir: string, depth: number): boolean {
    for (const file of this.listFiles(dir, depth)) {
      const name = file.split(/[\\/]/).pop() as string;
      if (SCRIPT_EXTENSIONS.has(extname(name).toLowerCase())) return true;
      if (name === 'package.json' && this.hasInstallScripts(file)) return true;
      if (/^skill\.md$/i.test(name) && this.hasFrontmatterHooks(file)) {
        return true;
      }
    }
    return false;
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
