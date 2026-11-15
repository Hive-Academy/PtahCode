import { createHash } from 'crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isRetiredPtahAgent } from './retired-agent-origin';

describe('retired wizard agent origin', () => {
  let root: string;
  let source: string;
  const slug = 'backend-developer';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ptah-origin-check-'));
    source = join(root, '.claude', 'agents', `${slug}.md`);
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true });
    writeFileSync(source, '# generated');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function writeStore(hash: string): void {
    const dir = join(root, '.ptah', 'setup-wizard');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'agent-origins.json'),
      JSON.stringify({
        version: 1,
        agents: { [slug]: { hash, writtenAt: 1 } },
      }),
    );
  }

  it('skips a matching wizard entry', () => {
    writeStore(
      `sha256:${createHash('sha256').update('# generated').digest('hex')}`,
    );
    expect(isRetiredPtahAgent(root, slug, source)).toBe(true);
  });

  it('keeps a retired slug with no entry', () => {
    expect(isRetiredPtahAgent(root, slug, source)).toBe(false);
  });

  it('keeps an edited file whose hash differs', () => {
    writeStore(
      `sha256:${createHash('sha256').update('# generated').digest('hex')}`,
    );
    writeFileSync(source, '# edited');
    expect(isRetiredPtahAgent(root, slug, source)).toBe(false);
  });

  it('keeps an agent when the store is unreadable', () => {
    const dir = join(root, '.ptah', 'setup-wizard', 'agent-origins.json');
    mkdirSync(dir, { recursive: true });
    expect(isRetiredPtahAgent(root, slug, source)).toBe(false);
  });
});
