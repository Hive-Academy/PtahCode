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
  withDeadline,
} from './claude-md-dedup';
import { buildFlagSettings, buildFlagSettingsArg } from './sdk-query-options-builder';

const TEXT = '# Project rules\n\nRun the focused checks only.\n';

const ALL_SOURCES = ['user', 'project', 'local'] as const;

/**
 * The walk uses real folders. On Windows the helper returns forward-slash
 * patterns and symlinks need elevation, so the folder cases run on POSIX only;
 * the Windows spelling is covered by `toClaudeMdExcludePattern` below.
 */
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describePosix('findDuplicateClaudeMdExcludes', () => {
  let root: string;
  let configDir: string;

  beforeEach(() => {
    // realpath: the OS temp folder can be a symlink (macOS /var -> /private/var).
    root = realpathSync(mkdtempSync(path.join(tmpdir(), 'claude-md-dedup-')));
    configDir = path.join(root, 'config');
    mkdirSync(configDir);
  });

  function find(
    cwd: string,
    settingSources: readonly string[] = ALL_SOURCES,
  ): Promise<string[]> {
    return findDuplicateClaudeMdExcludes(cwd, {
      settingSources,
      claudeConfigDir: configDir,
    });
  }

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

    const excludes = await find(path.join(root, 'repo/.claude-worktrees/wt/.ptah/tmp/ws'));

    expect(excludes.sort()).toEqual([main, worktree].sort());
  });

  it('keeps ancestor files whose text differs', async () => {
    write('repo/CLAUDE.md', '# Monorepo rules\n');
    write('repo/packages/app/CLAUDE.md', '# App rules\n');

    await expect(
      find(path.join(root, 'repo/packages/app')),
    ).resolves.toEqual([]);
  });

  it('treats a one-byte difference as distinct text', async () => {
    write('repo/CLAUDE.md', TEXT);
    write('repo/ws/CLAUDE.md', `${TEXT} `);

    await expect(
      find(path.join(root, 'repo/ws')),
    ).resolves.toEqual([]);
  });

  it('dedupes across the three file names the CLI reads', async () => {
    const dotClaude = write('repo/.claude/CLAUDE.md', TEXT);
    write('repo/ws/CLAUDE.local.md', TEXT);

    await expect(
      find(path.join(root, 'repo/ws')),
    ).resolves.toEqual([dotClaude]);
  });

  it('never excludes a file that imports other files', async () => {
    const withImport = `${TEXT}See @docs/rules.md for more.\n`;
    write('repo/CLAUDE.md', withImport);
    write('repo/ws/CLAUDE.md', withImport);

    await expect(
      find(path.join(root, 'repo/ws')),
    ).resolves.toEqual([]);
  });

  it('does not exclude a symlink to a file it keeps', async () => {
    const kept = write('repo/ws/CLAUDE.md', TEXT);
    symlinkSync(kept, path.join(root, 'repo/CLAUDE.md'));

    await expect(
      find(path.join(root, 'repo/ws')),
    ).resolves.toEqual([]);
  });

  it('keeps a copy whose path has a glob character', async () => {
    write('re[po]/CLAUDE.md', TEXT);
    write('re[po]/ws/CLAUDE.md', TEXT);

    await expect(
      find(path.join(root, 're[po]/ws')),
    ).resolves.toEqual([]);
  });

  it('skips a file above the size cap', async () => {
    const big = 'x'.repeat(CLAUDE_MD_DEDUP_MAX_BYTES + 1);
    write('repo/CLAUDE.md', big);
    write('repo/ws/CLAUDE.md', big);

    await expect(
      find(path.join(root, 'repo/ws')),
    ).resolves.toEqual([]);
  });

  it('excludes nothing when the session does not load project and local', async () => {
    write('repo/CLAUDE.md', TEXT);
    write('repo/ws/CLAUDE.local.md', TEXT);
    const ws = path.join(root, 'repo/ws');

    await expect(find(ws, ['user', 'project'])).resolves.toEqual([]);
    await expect(find(ws, ['local'])).resolves.toEqual([]);
    await expect(find(ws, [])).resolves.toEqual([]);
  });

  it.each([
    ['user', 'config/settings.json'],
    ['project', 'repo/ws/.claude/settings.json'],
    ['local', 'repo/ws/.claude/settings.local.json'],
  ])(
    'excludes nothing when the %s settings set their own claudeMdExcludes',
    async (_tier, settingsFile) => {
      write('repo/CLAUDE.md', TEXT);
      write('repo/ws/CLAUDE.md', TEXT);
      write(settingsFile, JSON.stringify({ claudeMdExcludes: ['**/ws/CLAUDE.md'] }));

      await expect(find(path.join(root, 'repo/ws'))).resolves.toEqual([]);
    },
  );

  it('excludes nothing when a loaded settings file is not valid JSON', async () => {
    write('repo/CLAUDE.md', TEXT);
    write('repo/ws/CLAUDE.md', TEXT);
    write('repo/ws/.claude/settings.local.json', '{ not json');

    await expect(find(path.join(root, 'repo/ws'))).resolves.toEqual([]);
  });

  it('excludes nothing when a loaded settings file cannot be read', async () => {
    write('repo/CLAUDE.md', TEXT);
    write('repo/ws/CLAUDE.md', TEXT);
    // A folder in place of the file: reading it fails with EISDIR.
    mkdirSync(path.join(root, 'repo/ws/.claude/settings.json'), { recursive: true });

    await expect(find(path.join(root, 'repo/ws'))).resolves.toEqual([]);
  });

  it('never keeps or excludes the user memory file', async () => {
    // The config folder sits on the walk as `<home>/.claude` would.
    const home = path.join(root, 'home');
    configDir = path.join(home, '.claude');
    write('home/.claude/CLAUDE.md', TEXT);
    write('home/repo/CLAUDE.md', TEXT);
    const kept = write('home/repo/ws/CLAUDE.md', TEXT);

    const excludes = await find(path.join(home, 'repo/ws'));

    expect(excludes).toEqual([path.join(home, 'repo/CLAUDE.md')]);
    expect(excludes).not.toContain(kept);
  });

  it('returns no excludes for a folder that does not exist', async () => {
    await expect(
      find(path.join(root, 'missing/deeper')),
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

describe('withDeadline', () => {
  it('returns no excludes when the work does not settle in time', async () => {
    const never = new Promise<string[]>(() => undefined);
    await expect(withDeadline(never, 5)).resolves.toEqual([]);
  });

  it('returns the work result when it settles in time', async () => {
    await expect(withDeadline(Promise.resolve(['/a/CLAUDE.md']), 1_000)).resolves.toEqual([
      '/a/CLAUDE.md',
    ]);
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
