import 'reflect-metadata';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import {
  CLAUDE_MD_DEDUP_MAX_BYTES,
  findDuplicateClaudeMdExcludes,
  hasClaudeMdImport,
  toClaudeMdExcludePattern,
} from './claude-md-dedup';
import { buildFlagSettings, buildFlagSettingsArg } from './sdk-query-options-builder';

const TEXT = '# Project rules\n\nRun the focused checks only.\n';

describe('findDuplicateClaudeMdExcludes', () => {
  let root: string;

  beforeEach(() => {
    // realpath: the OS temp folder can be a symlink (macOS /var -> /private/var).
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'claude-md-dedup-')));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function write(rel: string, text: string): string {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  }

  it('keeps the nearest copy and excludes each identical ancestor copy', async () => {
    // The benchmark layout: main checkout, worktree, nested workspace copy.
    const main = write('repo/CLAUDE.md', TEXT);
    const worktree = write('repo/.claude-worktrees/wt/CLAUDE.md', TEXT);
    write('repo/.claude-worktrees/wt/.ptah/tmp/ws/CLAUDE.md', TEXT);

    const excludes = await findDuplicateClaudeMdExcludes(
      path.join(root, 'repo/.claude-worktrees/wt/.ptah/tmp/ws'),
    );

    expect(excludes.sort()).toEqual([main, worktree].sort());
  });

  it('keeps ancestor files whose text differs', async () => {
    write('repo/CLAUDE.md', '# Monorepo rules\n');
    write('repo/packages/app/CLAUDE.md', '# App rules\n');

    await expect(
      findDuplicateClaudeMdExcludes(path.join(root, 'repo/packages/app')),
    ).resolves.toEqual([]);
  });

  it('treats a one-byte difference as distinct text', async () => {
    write('repo/CLAUDE.md', TEXT);
    write('repo/ws/CLAUDE.md', `${TEXT} `);

    await expect(
      findDuplicateClaudeMdExcludes(path.join(root, 'repo/ws')),
    ).resolves.toEqual([]);
  });

  it('dedupes across the three file names the CLI reads', async () => {
    const dotClaude = write('repo/.claude/CLAUDE.md', TEXT);
    write('repo/ws/CLAUDE.local.md', TEXT);

    await expect(
      findDuplicateClaudeMdExcludes(path.join(root, 'repo/ws')),
    ).resolves.toEqual([dotClaude]);
  });

  it('never excludes a file that imports other files', async () => {
    const withImport = `${TEXT}See @docs/rules.md for more.\n`;
    write('repo/CLAUDE.md', withImport);
    write('repo/ws/CLAUDE.md', withImport);

    await expect(
      findDuplicateClaudeMdExcludes(path.join(root, 'repo/ws')),
    ).resolves.toEqual([]);
  });

  it('does not exclude a symlink to a file it keeps', async () => {
    const kept = write('repo/ws/CLAUDE.md', TEXT);
    symlinkSync(kept, path.join(root, 'repo/CLAUDE.md'));

    await expect(
      findDuplicateClaudeMdExcludes(path.join(root, 'repo/ws')),
    ).resolves.toEqual([]);
  });

  it('keeps a copy whose path has a glob character', async () => {
    write('re[po]/CLAUDE.md', TEXT);
    write('re[po]/ws/CLAUDE.md', TEXT);

    await expect(
      findDuplicateClaudeMdExcludes(path.join(root, 're[po]/ws')),
    ).resolves.toEqual([]);
  });

  it('skips a file above the size cap', async () => {
    const big = 'x'.repeat(CLAUDE_MD_DEDUP_MAX_BYTES + 1);
    write('repo/CLAUDE.md', big);
    write('repo/ws/CLAUDE.md', big);

    await expect(
      findDuplicateClaudeMdExcludes(path.join(root, 'repo/ws')),
    ).resolves.toEqual([]);
  });

  it('returns no excludes for a folder that does not exist', async () => {
    await expect(
      findDuplicateClaudeMdExcludes(path.join(root, 'missing/deeper')),
    ).resolves.toEqual([]);
  });
});

describe('hasClaudeMdImport', () => {
  it('finds an import in prose', () => {
    expect(hasClaudeMdImport('Read @./notes.md first.')).toBe(true);
    expect(hasClaudeMdImport('@~/rules.md')).toBe(true);
  });

  it('ignores code spans, code blocks, comments and e-mail-like text', () => {
    expect(hasClaudeMdImport('Run `npm i @types/node`.')).toBe(false);
    expect(hasClaudeMdImport('```\n@import\n```\n')).toBe(false);
    expect(hasClaudeMdImport('<!-- @hidden -->')).toBe(false);
    expect(hasClaudeMdImport('mail user@example.com')).toBe(false);
  });
});

describe('toClaudeMdExcludePattern', () => {
  it('uses forward slashes on Windows', () => {
    expect(toClaudeMdExcludePattern('C:\\repo\\CLAUDE.md', 'win32')).toBe(
      'C:/repo/CLAUDE.md',
    );
  });

  it('refuses glob characters and relative paths', () => {
    expect(toClaudeMdExcludePattern('/repo (copy)/CLAUDE.md', 'linux')).toBeUndefined();
    expect(toClaudeMdExcludePattern('/repo/*/CLAUDE.md', 'linux')).toBeUndefined();
    expect(toClaudeMdExcludePattern('repo/CLAUDE.md', 'linux')).toBeUndefined();
  });
});

describe('flag settings with claudeMdExcludes', () => {
  it('adds the key only when there is an exclude', () => {
    expect(buildFlagSettings()).not.toHaveProperty('claudeMdExcludes');
    expect(
      buildFlagSettings(undefined, undefined, undefined, undefined, []),
    ).not.toHaveProperty('claudeMdExcludes');
    expect(
      JSON.parse(
        buildFlagSettingsArg(
          undefined,
          'accept',
          undefined,
          undefined,
          undefined,
          undefined,
          ['/repo/CLAUDE.md'],
        ),
      ),
    ).toMatchObject({
      crossSessionInbound: 'accept',
      claudeMdExcludes: ['/repo/CLAUDE.md'],
    });
  });

  it('returns the shared constant by identity when nothing is set', () => {
    expect(buildFlagSettings(undefined, undefined, undefined, undefined, [])).toBe(
      buildFlagSettings(),
    );
  });
});
