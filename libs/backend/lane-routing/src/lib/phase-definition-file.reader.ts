import { join } from 'node:path';
import type { IFileSystemProvider } from '@ptah-extension/platform-core';
import type { PhaseKind } from '@ptah-extension/shared';
import { PHASE_KINDS } from '@ptah-extension/shared';
import type { PhaseDefinitionReader } from './phase-definition-reader.port';

/** Reads the active user clone, or the shipped ptah-core skill. */
export class PhaseDefinitionFileReader implements PhaseDefinitionReader {
  constructor(
    private readonly fs: Pick<IFileSystemProvider, 'exists' | 'readFile'>,
    private readonly userSkillsRoot: string,
    private readonly pluginsRoot: string,
  ) {}

  async read(kind: PhaseKind): Promise<string> {
    if (!PHASE_KINDS.includes(kind)) throw new Error(`Unknown phase kind: ${kind}`);
    const clone = join(this.userSkillsRoot, 'orchestration');
    const root = await this.fs.exists(clone)
      ? clone
      : join(this.pluginsRoot, 'ptah-core', 'skills', 'orchestration');
    return this.fs.readFile(join(root, 'phases', `${kind}.md`));
  }
}
