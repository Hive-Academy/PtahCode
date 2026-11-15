import { createHash } from 'crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, type Dirent } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { userAgentFiles, type UserAgentFileSystem } from './user-agent-source';

const log = { warn: jest.fn(), error: jest.fn() };

describe('userAgentFiles', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ptah-user-agent-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('copies authored files and edited wizard files, but excludes unchanged wizard output', async () => {
    const dir = join(root, '.claude', 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'custom.md'), '# Custom');
    writeFileSync(join(dir, 'writer.md'), '# Generated');
    writeFileSync(join(dir, 'reviewer.md'), '# Edited');
    const hash = (content: string) =>
      `sha256:${createHash('sha256').update(content).digest('hex')}`;
    const originDir = join(root, '.ptah', 'setup-wizard');
    mkdirSync(originDir, { recursive: true });
    writeFileSync(join(originDir, 'agent-origins.json'), JSON.stringify({
      version: 1,
      agents: {
        writer: { hash: hash('# Generated'), writtenAt: 1 },
        reviewer: { hash: hash('# Generated'), writtenAt: 1 },
      },
    }));
    expect(await userAgentFiles(root, log)).toEqual(['custom.md', 'reviewer.md']);
  });

  it('normalizes CRLF content against an LF wizard hash', async () => {
    const dir = join(root, '.claude', 'agents');
    const originDir = join(root, '.ptah', 'setup-wizard');
    mkdirSync(dir, { recursive: true });
    mkdirSync(originDir, { recursive: true });
    writeFileSync(join(dir, 'writer.md'), '# First\r\nSecond\r\n');
    writeFileSync(join(originDir, 'agent-origins.json'), JSON.stringify({
      version: 1,
      agents: {
        writer: {
          hash: `sha256:${createHash('sha256').update('# First\nSecond\n').digest('hex')}`,
          writtenAt: 1,
        },
      },
    }));
    expect(await userAgentFiles(root, log)).toEqual([]);
  });

  it.each(['{', '{"version":1,"agents":{"writer":{}}}'])(
    'treats every agent as user-written when the origin store is invalid: %s',
    async (store) => {
      const dir = join(root, '.claude', 'agents');
      const originDir = join(root, '.ptah', 'setup-wizard');
      mkdirSync(dir, { recursive: true });
      mkdirSync(originDir, { recursive: true });
      writeFileSync(join(dir, 'writer.md'), '# Generated');
      writeFileSync(join(dir, 'custom.md'), '# Custom');
      writeFileSync(join(originDir, 'agent-origins.json'), store);
      expect(await userAgentFiles(root, log)).toEqual(['custom.md', 'writer.md']);
      expect(log.warn).toHaveBeenCalled();
    },
  );

  it('treats every agent as user-written when the origin store is unreadable', async () => {
    const dir = join(root, '.claude', 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'custom.md'), '# Custom');
    const originFile = join(root, '.ptah', 'setup-wizard', 'agent-origins.json');
    const fs: UserAgentFileSystem = {
      readFile: async (path, encoding) => {
        if (path === originFile) {
          throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
        }
        return import('fs/promises').then((module) => module.readFile(path, encoding));
      },
      readdir: async (path, options): Promise<Dirent[]> =>
        import('fs/promises').then((module) => module.readdir(path, options)),
    };
    expect(await userAgentFiles(root, log, fs)).toEqual(['custom.md']);
    expect(log.error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
  });

  it('treats every agent as user-written when the origin store is missing', async () => {
    const dir = join(root, '.claude', 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'custom.md'), '# Custom');
    expect(await userAgentFiles(root, log)).toEqual(['custom.md']);
  });

  it('includes an unreadable origin-backed agent and logs its error', async () => {
    const dir = join(root, '.claude', 'agents');
    const originDir = join(root, '.ptah', 'setup-wizard');
    mkdirSync(dir, { recursive: true });
    mkdirSync(originDir, { recursive: true });
    writeFileSync(join(dir, 'writer.md'), '# Generated');
    writeFileSync(join(originDir, 'agent-origins.json'), JSON.stringify({
      version: 1,
      agents: {
        writer: {
          hash: `sha256:${createHash('sha256').update('# Generated').digest('hex')}`,
          writtenAt: 1,
        },
      },
    }));
    const fs: UserAgentFileSystem = {
      readFile: async (path, encoding) => {
        if (path === join(dir, 'writer.md')) {
          throw Object.assign(new Error('unreadable'), { code: 'EACCES' });
        }
        return import('fs/promises').then((module) => module.readFile(path, encoding));
      },
      readdir: async (path, options): Promise<Dirent[]> =>
        import('fs/promises').then((module) => module.readdir(path, options)),
    };
    expect(await userAgentFiles(root, log, fs)).toEqual(['writer.md']);
    expect(log.error).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
  });

  it('handles missing agents and ignores other entries', async () => {
    expect(await userAgentFiles(root, log)).toEqual([]);
    const dir = join(root, '.claude', 'agents');
    mkdirSync(join(dir, 'x.md'), { recursive: true });
    writeFileSync(join(dir, 'notes.txt'), 'no');
    writeFileSync(join(dir, 'yes.md'), 'yes');
    expect(await userAgentFiles(root, log)).toEqual(['yes.md']);
  });

  it('does not read a retired agent snapshot back as a source', async () => {
    const snapshot = join(root, '.ptah', 'harness', '.history', 'writer', 'stamp');
    mkdirSync(snapshot, { recursive: true });
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
    writeFileSync(join(snapshot, 'writer.md'), 'saved edit');
    expect(await userAgentFiles(root, log)).toEqual([]);
  });
});
