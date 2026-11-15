import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PhaseDefinitionFileReader } from './phase-definition-file.reader';
import { resolvePhaseDefinition } from './contracts/phase-definition-resolver';

describe('PhaseDefinitionFileReader', () => {
  const clone = join('user', 'orchestration');
  const plugin = join('plugins', 'ptah-core', 'skills', 'orchestration');

  function reader(cloneActive: boolean, files: Map<string, string>, enabled = true) {
    const fs = {
      exists: jest.fn(async (path: string) => files.has(path) && path.startsWith(clone) && cloneActive),
      readFile: jest.fn(async (path: string) => {
        const text = files.get(path);
        if (text === undefined) throw new Error(`Missing phase file: ${path}`);
        return text;
      }),
    };
    return { subject: new PhaseDefinitionFileReader(fs, 'user', 'plugins', () => enabled), fs };
  }

  it('reads the active clone first', async () => {
    const h = reader(true, new Map([[join(clone, 'phases', 'visual-review.md'), 'machineCapabilities: [browser]']]));
    await expect(h.subject.read('visual-review')).resolves.toContain('browser');
    expect(h.fs.readFile).toHaveBeenCalledWith(join(clone, 'phases', 'visual-review.md'));
  });

  it('falls back to the shipped plugin without a clone', async () => {
    const h = reader(false, new Map([[join(plugin, 'phases', 'review.md'), 'review']]));
    await expect(h.subject.read('review')).resolves.toBe('review');
  });

  it('uses the plugin when the active clone lacks the phase file', async () => {
    const h = reader(true, new Map([[join(plugin, 'phases', 'review.md'), 'plugin review']]));
    await expect(h.subject.read('review')).resolves.toBe('plugin review');
  });

  it('uses the plugin when the clone is disabled', async () => {
    const h = reader(true, new Map([
      [join(clone, 'phases', 'review.md'), 'clone review'],
      [join(plugin, 'phases', 'review.md'), 'plugin review'],
    ]), false);
    await expect(h.subject.read('review')).resolves.toBe('plugin review');
  });

  it('reads browser capability from the shipped gate-0.1 visual-review phase', async () => {
    const subject = new PhaseDefinitionFileReader(
      { exists: async () => false, readFile: (path) => readFile(path, 'utf8') },
      join(resolve(__dirname, '../../../../..'), '.ptah', 'missing-user-skills'),
      join(resolve(__dirname, '../../../../..'), 'plugins'),
    );
    const source = await subject.read('visual-review');
    expect(resolvePhaseDefinition('visual-review', () => source).definition.machineCapabilities).toContain('browser');
  });
});
