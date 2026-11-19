import 'reflect-metadata';
import { join, resolve } from 'path';
import { jest } from '@jest/globals';
import { createMockFileSystemProvider } from '@ptah-extension/platform-core/testing';
import { FileType } from '@ptah-extension/platform-core';
import { PHASE_CONFIGS } from '../types/multi-phase.types';
import { AnalysisStorageService } from './analysis-storage.service';
import { AnalysisClaudeMdLinker } from './analysis-claude-md-linker';
import { sha256Hex } from './analysis-fingerprint';

const ROOT = resolve('/ws/demo');
const ANALYSIS = join(ROOT, '.ptah', 'analysis');
const FILES = PHASE_CONFIGS.map(({ file }) => file);
const BEGIN = '<!-- ptah:analysis:begin -->';
const END = '<!-- ptah:analysis:end -->';
const HEADING = 'Workspace analysis (read a file only when the task needs it):';

describe('AnalysisClaudeMdLinker', () => {
  const logger = { warn: jest.fn(), debug: jest.fn() };

  async function fixture() {
    const fs = createMockFileSystemProvider();
    const run = join(ANALYSIS, 'demo');
    await fs.createDirectory(run);
    for (const file of FILES) await fs.writeFile(join(run, file), '# phase\n');
    const manifest = {
      version: 4,
      lifecycle: 'completed',
      analyzedAt: '2026-11-01T00:00:00Z',
      phases: Object.fromEntries(PHASE_CONFIGS.map(({ id, file }) => [id, {
        file,
        status: 'completed',
        verification: { status: 'verified', outputSha256: sha256Hex('# phase\n') },
      }])),
    };
    const manifests = new Map([[run, manifest]]);
    const storage = {
      getAnalysisDir: () => ANALYSIS,
      loadManifest: async (dir: string) => manifests.get(dir) ?? null,
    } as unknown as AnalysisStorageService;
    return { fs, manifests, linker: new AnalysisClaudeMdLinker(storage, fs, logger as never) };
  }

  it('creates CLAUDE.md when absent', async () => {
    const { fs, linker } = await fixture();
    expect(await linker.link(ROOT)).toEqual({ written: true });
    const content = await fs.readFile(join(ROOT, 'CLAUDE.md'));
    expect(content).toContain(BEGIN);
    expect(content).toContain(HEADING);
    for (const file of FILES) expect(content).toContain(`- \`.ptah/analysis/demo/${file}\``);
    expect(content).not.toMatch(/^@/m);
    expect(content).toContain(END);
  });

  it('appends to an unmarked file and preserves existing text', async () => {
    const { fs, linker } = await fixture();
    await fs.writeFile(join(ROOT, 'CLAUDE.md'), '# User notes\n');
    await linker.link(ROOT);
    expect(await fs.readFile(join(ROOT, 'CLAUDE.md'))).toMatch(
      /^# User notes\n\n<!-- ptah:analysis:begin -->/,
    );
  });

  it('links the latest completed valid slug when several runs exist', async () => {
    const { fs, manifests, linker } = await fixture();
    const newer = join(ANALYSIS, 'newer');
    await fs.createDirectory(newer);
    for (const file of FILES) await fs.writeFile(join(newer, file), '# phase\n');
    manifests.set(newer, {
      ...manifests.get(join(ANALYSIS, 'demo'))!,
      analyzedAt: '2026-11-02T00:00:00Z',
    });
    const reads = jest.spyOn(fs, 'readFileBytes');
    await linker.link(ROOT);
    const content = await fs.readFile(join(ROOT, 'CLAUDE.md'));
    expect(content).toContain('- `.ptah/analysis/newer/01-project-profile.md`');
    expect(content).not.toContain('.ptah/analysis/demo/');
    expect(reads).toHaveBeenCalledTimes(FILES.length);
  });

  it('refuses a completed run whose slug cannot form a safe path', async () => {
    const { fs, manifests, linker } = await fixture();
    const old = manifests.get(join(ANALYSIS, 'demo'))!;
    manifests.delete(join(ANALYSIS, 'demo'));
    const unsafe = join(ANALYSIS, 'bad slug');
    await fs.createDirectory(unsafe);
    manifests.set(unsafe, old);
    expect(await linker.link(ROOT)).toMatchObject({ written: false, error: expect.stringContaining('slug') });
    expect(await fs.exists(join(ROOT, 'CLAUDE.md'))).toBe(false);
  });

  it('serializes simultaneous calls and writes the block once', async () => {
    const { fs, linker } = await fixture();
    const originalWrite = fs.writeFile.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const firstWrite = new Promise<void>((resolve) => { entered = resolve; });
    let writes = 0;
    jest.spyOn(fs, 'writeFile').mockImplementation(async (path, content) => {
      if (path.endsWith('CLAUDE.md')) { writes++; entered(); await gate; }
      return originalWrite(path, content);
    });
    const first = linker.link(ROOT);
    const second = linker.link(ROOT);
    await firstWrite;
    release();
    expect(await Promise.all([first, second])).toEqual([{ written: true }, { written: false }]);
    expect(writes).toBe(1);
  });

  it('uses dominant LF when one stray CRLF exists', async () => {
    const { fs, linker } = await fixture();
    await fs.writeFile(join(ROOT, 'CLAUDE.md'), `one\r\ntwo\nthree\nfour\n`);
    await linker.link(ROOT);
    const content = await fs.readFile(join(ROOT, 'CLAUDE.md'));
    expect(content).toContain(`${BEGIN}\n${HEADING}\n- \`.ptah/analysis/demo/01-project-profile.md\`\n`);
  });

  it('reports an editor change during the read-modify-write cycle', async () => {
    const { fs, linker } = await fixture();
    const path = join(ROOT, 'CLAUDE.md');
    await fs.writeFile(path, '# original\n');
    const originalRead = fs.readFile.getMockImplementation()!;
    const originalWrite = fs.writeFile.getMockImplementation()!;
    let reads = 0;
    jest.spyOn(fs, 'readFile').mockImplementation(async (file) => {
      if (file === path && ++reads === 2) await originalWrite(path, '# editor save\n');
      return originalRead(file);
    });
    expect(await linker.link(ROOT)).toMatchObject({ written: false, error: expect.stringContaining('changed') });
    expect(await originalRead(path)).toBe('# editor save\n');
  });

  it('replaces only marker contents and retains CRLF outside bytes', async () => {
    const { fs, linker } = await fixture();
    const original = `before\r\n${BEGIN}\r\nold\r\n${END}\r\nafter\r\n`;
    await fs.writeFile(join(ROOT, 'CLAUDE.md'), original);
    await linker.link(ROOT);
    const content = await fs.readFile(join(ROOT, 'CLAUDE.md'));
    expect(content.slice(0, content.indexOf(BEGIN))).toBe('before\r\n');
    expect(content.slice(content.indexOf(END) + END.length)).toBe(
      '\r\nafter\r\n',
    );
    expect(content).toContain(`${BEGIN}\r\n${HEADING}\r\n- \`.ptah/analysis/demo/01-project-profile.md\`\r\n`);
    expect(content).not.toContain('old');
  });

  it.each(['\n', '\r\n'])('migrates an import block and preserves outside text with %j', async (eol) => {
    const { fs, linker } = await fixture();
    const path = join(ROOT, 'CLAUDE.md');
    const before = `# User notes${eol}${eol}${BEGIN}`;
    const after = `${END}${eol}${eol}Keep these instructions.${eol}`;
    const imports = FILES.map((file) => `@.ptah/analysis/demo/${file}`).join(eol);
    await fs.writeFile(path, `${before}${eol}${imports}${eol}${after}`);

    expect(await linker.link(ROOT)).toEqual({ written: true });
    const content = await fs.readFile(path);
    const bullets = FILES.map((file) => `- \`.ptah/analysis/demo/${file}\``).join(eol);
    expect(content).toBe(`${before}${eol}${HEADING}${eol}${bullets}${eol}${after}`);
    expect(content).not.toMatch(/^@/m);
    expect(await linker.link(ROOT)).toEqual({ written: false });
  });

  it.each([`${BEGIN}\n`, `${END}\n`, `${END}\n${BEGIN}\n`])('leaves malformed markers untouched', async (original) => {
    const { fs, linker } = await fixture();
    await fs.writeFile(join(ROOT, 'CLAUDE.md'), original);
    expect(await linker.link(ROOT)).toMatchObject({ written: false, error: expect.any(String) });
    expect(await fs.readFile(join(ROOT, 'CLAUDE.md'))).toBe(original);
  });

  it('reports a write error without throwing', async () => {
    const { fs, linker } = await fixture();
    jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('read-only'));
    expect(await linker.link(ROOT)).toMatchObject({ written: false, error: 'read-only' });
    expect(logger.warn).toHaveBeenCalled();
  });

  describe('workspace-open migration', () => {
    it.each(['\n', '\r\n'])('writes the index and preserves user bytes with %j', async (eol) => {
      const { fs, manifests, linker } = await fixture();
      manifests.clear();
      const path = join(ROOT, 'CLAUDE.md');
      const before = `\uFEFF# User café\r\n@user-import.md\n  ${BEGIN}`;
      const after = `${END}  \r\nKeep my instructions.\n`;
      const imports = FILES.map((file) => `@.ptah/analysis/demo/${file}`).join(eol);
      await fs.writeFile(path, `${before}${eol}${eol}${imports}${eol}${after}`);
      fs.writeFileBytes.mockClear();
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: true });
      const content = Buffer.from(await fs.readFileBytes(path)).toString('utf8');
      const chosenEol = eol === '\r\n' ? '\r\n' : '\n';
      const bullets = FILES.map((file) => `- \`.ptah/analysis/demo/${file}\``).join(chosenEol);
      expect(content).toBe(`${before}${chosenEol}${HEADING}${chosenEol}${bullets}${chosenEol}${after}`);
      expect(fs.writeFileExclusive).toHaveBeenCalledTimes(1);
      expect(fs.rename).toHaveBeenCalledWith(expect.any(String), path);
      expect(fs.writeFileBytes).not.toHaveBeenCalled();
      fs.writeFileBytes.mockClear();
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false });
      expect(fs.writeFileBytes).not.toHaveBeenCalled();
      expect(fs.readDirectory).not.toHaveBeenCalled();
    });

    it.each([
      '# User text\n@.ptah/analysis/demo/01-project-profile.md\n',
      `${BEGIN}\n`, `${END}\n`, `${END}\n${BEGIN}\n`,
      `${BEGIN}\n${BEGIN}\n${END}\n`, `${BEGIN}\n${END}\n${END}\n`,
      `${BEGIN}\n${END}\n${BEGIN}\n${END}\n`,
      `${BEGIN}\nWorkspace analysis custom heading\n- \`custom.md\`\n${END}\n`,
      `${BEGIN}\n@.ptah/analysis/../01-project-profile.md\n${END}\n`,
      `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\nUser text\n${END}\n`,
    ])('leaves absent, malformed or non-legacy blocks unchanged: %j', async (original) => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      await fs.writeFile(path, original);
      fs.writeFileBytes.mockClear();
      logger.debug.mockClear();
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false });
      expect(await fs.readFile(path)).toBe(original);
      expect(fs.writeFileBytes).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalled();
    });

    it.each([FileType.SymbolicLink, FileType.SymbolicLink | FileType.File, FileType.Directory, FileType.Unknown])(
      'skips non-regular CLAUDE.md entries without reading or writing: %s', async (type) => {
        const { fs, linker } = await fixture();
        const path = join(ROOT, 'CLAUDE.md');
        const original = `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`;
        await fs.writeFile(path, original);
        fs.lstat.mockResolvedValueOnce({ type, ctime: 0, mtime: 0, size: original.length });
        fs.readFileBytes.mockClear();
        fs.writeFileBytes.mockClear();
        logger.debug.mockClear();
        expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false });
        expect(fs.lstat).toHaveBeenCalledWith(path);
        expect(fs.readFileBytes).not.toHaveBeenCalled();
        expect(fs.writeFileBytes).not.toHaveBeenCalled();
        expect(await fs.readFile(path)).toBe(original);
        expect(logger.debug).toHaveBeenCalledWith(
          'Analysis index migration skipped: CLAUDE.md is not a regular file',
        );
      },
    );

    it.each([false, true])('skips hard links, including ones added during staging: %s', async (duringStaging) => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      const original = `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`;
      await fs.writeFile(path, original);
      const stat = await fs.stat(path);
      if (duringStaging) fs.lstat.mockResolvedValueOnce(stat);
      fs.lstat.mockResolvedValueOnce({ ...stat, nlink: 2 });
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false });
      expect(await fs.readFile(path)).toBe(original);
      expect(fs.rename).not.toHaveBeenCalled();
      expect([...fs.__state.files.keys()].filter((file) => file.endsWith('.tmp'))).toEqual([]);
    });

    it('rechecks after staging, preserves an editor save and removes the temp file', async () => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      await fs.writeFile(path, `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`);
      const stage = fs.writeFileExclusive.getMockImplementation();
      if (!stage) throw new Error('Missing staging implementation');
      fs.writeFileExclusive.mockImplementationOnce(async (temp, bytes) => {
        expect(temp).not.toBe(path);
        await stage(temp, bytes);
        await fs.writeFile(path, 'editor save');
      });
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false });
      expect(await fs.readFile(path)).toBe('editor save');
      expect(fs.rename).not.toHaveBeenCalled();
      expect([...fs.__state.files.keys()].filter((file) => file.endsWith('.tmp'))).toEqual([]);
    });

    it.each([0o600, 0o400, undefined])('preserves the original mode: %s', async (mode) => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      const original = `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`;
      await fs.writeFileExclusive(path, original, { mode });
      fs.writeFileExclusive.mockClear();
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: true });
      expect(fs.writeFileExclusive).toHaveBeenCalledWith(expect.any(String), expect.any(Buffer), { mode });
      expect((await fs.lstat(path)).mode).toBe(mode);
    });

    it('removes a partially written temp file when staging rejects', async () => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      const original = `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`;
      await fs.writeFile(path, original);
      fs.writeFileExclusive.mockImplementationOnce(async (temp) => {
        await fs.writeFile(temp, 'partial private content');
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      });
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false, error: 'disk full' });
      expect(await fs.readFile(path)).toBe(original);
      expect(fs.rename).not.toHaveBeenCalled();
      expect(fs.delete).toHaveBeenCalledTimes(1);
      expect([...fs.__state.files.keys()].filter((file) => file.endsWith('.tmp'))).toEqual([]);
    });

    it("does not remove someone else's temp file on EEXIST", async () => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      const original = `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`;
      await fs.writeFile(path, original);
      let occupied = '';
      fs.writeFileExclusive.mockImplementationOnce(async (temp) => {
        occupied = temp;
        await fs.writeFile(temp, 'another writer');
        throw Object.assign(new Error('already exists'), { code: 'EEXIST' });
      });
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false, error: 'already exists' });
      expect(await fs.readFile(path)).toBe(original);
      expect(await fs.readFile(occupied)).toBe('another writer');
      expect(fs.rename).not.toHaveBeenCalled();
      expect(fs.delete).not.toHaveBeenCalled();
    });

    it('keeps the original and cleans staging when rename fails', async () => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      const original = `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`;
      await fs.writeFile(path, original);
      fs.rename.mockRejectedValueOnce(new Error('rename failed'));
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false, error: 'rename failed' });
      expect(await fs.readFile(path)).toBe(original);
      expect([...fs.__state.files.keys()].filter((file) => file.endsWith('.tmp'))).toEqual([]);
    });

    it('does not create CLAUDE.md', async () => {
      const { fs, linker } = await fixture();
      fs.writeFileBytes.mockClear();
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false });
      expect(fs.writeFileBytes).not.toHaveBeenCalled();
    });

    it('preserves non-UTF-8 user bytes outside the markers', async () => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      const prefix = Buffer.from([0xff, 0xfe, 0x0a]);
      const suffix = Buffer.from([0x0a, 0x80]);
      await fs.writeFileBytes(path, Buffer.concat([
        prefix, Buffer.from(`${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`), suffix,
      ]));
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: true });
      expect(Buffer.from(await fs.readFileBytes(path))).toEqual(Buffer.concat([
        prefix, Buffer.from(`${BEGIN}\n${HEADING}\n- \`.ptah/analysis/demo/01-project-profile.md\`\n${END}`), suffix,
      ]));
    });

    it('leaves an editor save untouched', async () => {
      const { fs, linker } = await fixture();
      const path = join(ROOT, 'CLAUDE.md');
      const original = `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`;
      await fs.writeFile(path, original);
      fs.readFileBytes.mockResolvedValueOnce(Buffer.from(original)).mockResolvedValueOnce(Buffer.from('editor save'));
      fs.writeFileBytes.mockClear();
      expect(await linker.migrateLegacyBlock(ROOT)).toEqual({ written: false });
      expect(fs.writeFileBytes).not.toHaveBeenCalled();
    });

    it.each([new Error('read-only'), 'unavailable'])('contains startup write failures: %j', async (error) => {
      const { fs, linker } = await fixture();
      await fs.writeFile(join(ROOT, 'CLAUDE.md'), `${BEGIN}\n@.ptah/analysis/demo/01-project-profile.md\n${END}`);
      fs.writeFileExclusive.mockRejectedValueOnce(error);
      await expect(linker.migrateLegacyBlock(ROOT)).resolves.toMatchObject({ written: false, error: expect.any(String) });
      expect(logger.debug).toHaveBeenCalled();
    });
  });
});
