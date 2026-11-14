import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Logger } from '@ptah-extension/vscode-core';
import { ProjectGuidanceService } from './project-guidance.service';

describe('ProjectGuidanceService', () => {
  const debug = jest.fn();
  const service = new ProjectGuidanceService({ debug } as unknown as Logger);
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'guidance-test-'));
    debug.mockClear();
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('labels weak practices and does not invent analysis facts', async () => {
    const result = await service.getGuidance({ frameworks: [] }, root);
    expect(result.facts.find((fact) => fact.category === 'lint')).toMatchObject({ label: 'tolerate', evidence: 'not found' });
    expect(result.facts.find((fact) => fact.category === 'tests')).toMatchObject({ label: 'do_not_copy', evidence: 'not found' });
    expect(result.facts.some((fact) => fact.category === 'conventions')).toBe(false);
  });

  it('labels configured practices and writes an atomic record', async () => {
    await fs.writeFile(path.join(root, 'eslint.config.js'), '');
    await fs.writeFile(path.join(root, '.prettierrc'), '');
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'jest' } }));
    await fs.writeFile(path.join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true } }));
    await fs.mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
    await fs.writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), '');
    const result = await service.getGuidance({ frameworks: [] }, root, 'raise');
    expect(result.facts.every((fact) => fact.label === 'follow')).toBe(true);
    expect(result.recordPath).toBe('.ptah/project-guidance.md');
    const record = await fs.readFile(path.join(root, result.recordPath as string), 'utf8');
    expect(record).toContain('## Owner decision\nRaise the standard');
    expect(record).toContain('Evidence: `eslint.config.js`');
    expect(record).toContain('Debt is recorded and not fixed silently.');
    expect((await fs.readdir(path.join(root, '.ptah')))).toEqual(['project-guidance.md']);
  });

  it('omits one fact when a probe read fails', async () => {
    await fs.writeFile(path.join(root, 'tsconfig.json'), '{broken');
    const result = await service.getGuidance({ frameworks: [] }, root);
    expect(result.facts.some((fact) => fact.category === 'typescript')).toBe(false);
    expect(result.facts.some((fact) => fact.category === 'lint')).toBe(true);
    expect(debug).toHaveBeenCalled();
  });

  it('returns facts without a record path on write failure', async () => {
    await fs.writeFile(path.join(root, '.ptah'), 'blocked');
    const result = await service.getGuidance({ frameworks: [] }, root, 'match');
    expect(result.recordPath).toBeUndefined();
    expect(result.facts.length).toBeGreaterThan(0);
  });

  it('skips symlink and oversized probe files', async () => {
    const outside = path.join(root, 'outside.json');
    await fs.writeFile(outside, JSON.stringify({ compilerOptions: { strict: true } }));
    let linked = true;
    try { await fs.symlink(outside, path.join(root, 'tsconfig.json')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
      linked = false;
    }
    await fs.writeFile(path.join(root, 'package.json'), ' '.repeat(1024 * 1024 + 1));
    const result = await service.getGuidance({ frameworks: [] }, root);
    if (linked) expect(result.facts.some((fact) => fact.category === 'typescript')).toBe(false);
    expect(result.facts.some((fact) => fact.category === 'tests')).toBe(false);
    expect(debug).toHaveBeenCalled();
  });

  it('accepts package.json null as an empty object', async () => {
    await fs.writeFile(path.join(root, 'package.json'), 'null');
    const result = await service.getGuidance({ frameworks: [] }, root);
    expect(result.facts.find((fact) => fact.category === 'tests')?.label).toBe('do_not_copy');
  });

  it('sanitizes file evidence in the response and record', async () => {
    await fs.writeFile(path.join(root, '.eslintrc`bad\u2028name'), '');
    const result = await service.getGuidance({ frameworks: [] }, root, 'match');
    const lint = result.facts.find((fact) => fact.category === 'lint');
    expect(lint?.fact).toBe('Use the repository lint configuration');
    expect(lint?.evidence).not.toContain('\u2028');
    const record = await fs.readFile(path.join(root, '.ptah', 'project-guidance.md'), 'utf8');
    expect(record).not.toContain('`bad');
    expect(record).not.toContain('\u2028');
  });
});
