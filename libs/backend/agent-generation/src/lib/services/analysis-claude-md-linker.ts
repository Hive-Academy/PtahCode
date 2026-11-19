import { join } from 'path';
import { randomUUID } from 'crypto';
import { inject, injectable } from 'tsyringe';
import { FileType, PLATFORM_TOKENS, type IFileSystemProvider } from '@ptah-extension/platform-core';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { AGENT_GENERATION_TOKENS } from '../di/tokens';
import { PHASE_CONFIGS } from '../types/multi-phase.types';
import { AnalysisStorageService, isLegacyArchiveDirName } from './analysis-storage.service';
import { normalizeEolBytes, sha256Hex } from './analysis-fingerprint';

const BEGIN = '<!-- ptah:analysis:begin -->';
const END = '<!-- ptah:analysis:end -->';
type LinkResult = { written: boolean; error?: string };
type Candidate = { slug: string; dir: string; files: string[]; at: number; hashes: string[] };

/** Maintains only the marked analysis index in the workspace root CLAUDE.md. */
@injectable()
export class AnalysisClaudeMdLinker {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    @inject(AGENT_GENERATION_TOKENS.ANALYSIS_STORAGE_SERVICE)
    private readonly storage: AnalysisStorageService,
    @inject(PLATFORM_TOKENS.FILE_SYSTEM_PROVIDER)
    private readonly fs: IFileSystemProvider,
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
  ) {}

  /** Serialize each workspace's read-modify-write cycle within this process. */
  link(workspaceRoot: string): Promise<LinkResult> {
    return this.enqueue(workspaceRoot, (path) => this.linkUnlocked(workspaceRoot, path));
  }

  /** Upgrade only an existing legacy block, without requiring analysis manifests. */
  migrateLegacyBlock(workspaceRoot: string): Promise<LinkResult> {
    return this.enqueue(workspaceRoot, async (path) => {
      try {
        if (!(await this.fs.exists(path))) {
          this.logger.debug('Analysis index migration skipped: no CLAUDE.md');
          return { written: false };
        }
        const stat = await this.fs.lstat(path);
        if (stat.type !== FileType.File) {
          this.logger.debug('Analysis index migration skipped: CLAUDE.md is not a regular file');
          return { written: false };
        }
        if ((stat.nlink ?? 1) > 1) {
          this.logger.debug('Analysis index migration skipped: CLAUDE.md has multiple hard links');
          return { written: false };
        }
        const bytes = Buffer.from(await this.fs.readFileBytes(path));
        // One character per byte keeps marker offsets exact, even for a BOM or invalid UTF-8.
        const current = bytes.toString('latin1');
        const begins = current.split(BEGIN).length - 1;
        const ends = current.split(END).length - 1;
        if (begins !== 1 || ends !== 1 || current.indexOf(BEGIN) > current.indexOf(END)) {
          this.logger.debug('Analysis index migration skipped: absent or malformed markers');
          return { written: false };
        }
        const start = current.indexOf(BEGIN) + BEGIN.length;
        const end = current.indexOf(END);
        const lines = current.slice(start, end).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        if (lines.length === 0 || lines.some((line) =>
          !/^@\.ptah\/analysis\/[a-z0-9][a-z0-9-]*\/[0-9]{2}-[a-z-]+\.md$/.test(line))) {
          this.logger.debug('Analysis index migration skipped: block is not legacy imports');
          return { written: false };
        }
        const eol = this.eol(current);
        const index = this.formatIndex(lines.map((line) => line.slice(1)), eol);
        const updated = Buffer.concat([
          bytes.subarray(0, start), Buffer.from(`${eol}${index}${eol}`, 'utf8'), bytes.subarray(end),
        ]);
        const temp = join(workspaceRoot, `.CLAUDE.md.${randomUUID()}.tmp`);
        let cleanup = true;
        try {
          try {
            await this.fs.writeFileExclusive(temp, updated, { mode: stat.mode });
          } catch (error: unknown) {
            // An exclusive-create collision belongs to someone else, never remove it.
            if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
              cleanup = false;
            }
            throw error;
          }
          const latest = await this.fs.lstat(path);
          if (latest.type !== FileType.File || (latest.nlink ?? 1) > 1 ||
              !bytes.equals(Buffer.from(await this.fs.readFileBytes(path)))) {
            this.logger.debug('Analysis index migration skipped: CLAUDE.md changed');
            return { written: false };
          }
          // Rename is atomic, but not a filesystem compare-and-swap. Keep the final
          // read adjacent to it and never truncate the original inode in place.
          await this.fs.rename(temp, path);
        } finally {
          if (cleanup && await this.fs.exists(temp)) {
            await this.fs.delete(temp);
          }
        }
        return { written: true };
      } catch (error: unknown) {
        // degradation-audit: reported — migration must not interrupt workspace startup.
        const message = error instanceof Error ? error.message : String(error);
        this.logger.debug('Could not migrate CLAUDE.md analysis imports', { error: message });
        return { written: false, error: message };
      }
    });
  }

  private eol(current: string): string {
    const crlf = (current.match(/\r\n/g) ?? []).length;
    const lf = (current.match(/(?<!\r)\n/g) ?? []).length;
    return crlf > lf ? '\r\n' : '\n';
  }

  private formatIndex(paths: string[], eol: string): string {
    return [
      'Workspace analysis (read a file only when the task needs it):',
      ...paths.map((path) => `- \`${path}\``),
    ].join(eol);
  }

  private enqueue(workspaceRoot: string, action: (path: string) => Promise<LinkResult>): Promise<LinkResult> {
    const path = join(workspaceRoot, 'CLAUDE.md');
    const previous = this.pending.get(path) ?? Promise.resolve();
    const work = previous.then(() => action(path));
    const settled = work.then(() => undefined);
    this.pending.set(path, settled);
    void settled.then(() => {
      if (this.pending.get(path) === settled) this.pending.delete(path);
    });
    return work;
  }

  private async linkUnlocked(workspaceRoot: string, path: string): Promise<LinkResult> {
    try {
      const analysisRoot = this.storage.getAnalysisDir(workspaceRoot);
      const entries = await this.fs.readDirectory(analysisRoot);
      const candidates: Candidate[] = [];
      let unsafeSlug = false;
      for (const entry of entries) {
        if (entry.type !== FileType.Directory || isLegacyArchiveDirName(entry.name)) continue;
        const dir = join(analysisRoot, entry.name);
        const manifest = await this.storage.loadManifest(dir);
        if (!manifest || manifest.version !== 4 || manifest.lifecycle !== 'completed') continue;
        if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
          unsafeSlug = true;
          continue;
        }
        const phases = PHASE_CONFIGS.map(({ id }) => manifest.phases[id]);
        if (phases.some((phase) =>
          phase?.status !== 'completed' ||
          phase?.verification.status !== 'verified' ||
          !phase?.verification.outputSha256 ||
          !/^[0-9]{2}-[a-z-]+\.md$/.test(phase?.file ?? ''),
        )) continue;
        const at = Date.parse(manifest.analyzedAt);
        if (Number.isFinite(at)) candidates.push({
          slug: entry.name,
          dir,
          at,
          files: phases.map((phase) => phase?.file ?? ''),
          hashes: phases.map((phase) => phase?.verification.outputSha256 ?? ''),
        });
      }
      candidates.sort((a, b) => b.at - a.at);
      let latest: Candidate | undefined;
      for (const candidate of candidates) {
        let outputsMatch = true;
        for (let index = 0; index < candidate.files.length; index++) {
          const file = join(candidate.dir, candidate.files[index]);
          if (!(await this.fs.exists(file))) { outputsMatch = false; break; }
          const bytes = await this.fs.readFileBytes(file);
          if (sha256Hex(bytes) !== candidate.hashes[index] &&
              sha256Hex(normalizeEolBytes(bytes)) !== candidate.hashes[index]) {
            outputsMatch = false;
            break;
          }
        }
        if (outputsMatch) { latest = candidate; break; }
      }
      if (!latest) return { written: false, error: unsafeSlug
        ? 'Analysis slug contains unsupported characters.'
        : 'No completed analysis with phase files was found.' };

      const current = await this.fs.exists(path) ? await this.fs.readFile(path) : '';
      const eol = this.eol(current);
      const index = this.formatIndex(latest.files.map((file) => `.ptah/analysis/${latest.slug}/${file}`), eol);
      const begins = current.split(BEGIN).length - 1;
      const ends = current.split(END).length - 1;
      if ((begins !== 0 || ends !== 0) &&
          (begins !== 1 || ends !== 1 || current.indexOf(BEGIN) > current.indexOf(END))) {
        return { written: false, error: 'CLAUDE.md has unpaired or out-of-order analysis markers.' };
      }
      let updated: string;
      if (begins === 1) {
        const before = current.slice(0, current.indexOf(BEGIN) + BEGIN.length);
        const after = current.slice(current.indexOf(END));
        updated = `${before}${eol}${index}${eol}${after}`;
      } else {
        const separator = current.length === 0 || current.endsWith(`${eol}${eol}`)
          ? '' : current.endsWith(eol) ? eol : `${eol}${eol}`;
        updated = `${current}${separator}${BEGIN}${eol}${index}${eol}${END}${eol}`;
      }
      if (updated === current) return { written: false };
      // Catch an editor save that occurred while phase files were inspected.
      const beforeWrite = await this.fs.exists(path) ? await this.fs.readFile(path) : '';
      if (beforeWrite !== current) return { written: false, error: 'CLAUDE.md changed during analysis linking.' };
      await this.fs.writeFile(path, updated);
      return { written: true };
    } catch (error: unknown) {
      // degradation-audit: reported — linking is best effort and must never
      // fail analysis completion or loading.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Could not update CLAUDE.md analysis links', error);
      return { written: false, error: message };
    }
  }
}
