import { join } from 'node:path';
import type { IFileSystemProvider } from '@ptah-extension/platform-core';
import type { PhaseKind } from '@ptah-extension/shared';
import { PHASE_KINDS } from '@ptah-extension/shared';
import type { PhaseDefinitionReader } from './phase-definition-reader.port';

/** Resolves each phase from a workspace-owned skill, active clone, or plugin. */
export class PhaseDefinitionFileReader implements PhaseDefinitionReader {
  constructor(
    private readonly fs: Pick<IFileSystemProvider, 'exists' | 'readFile'>,
    private readonly userSkillsRoot: string,
    private readonly pluginsRoot: string,
    private readonly isCloneActive: () => boolean | Promise<boolean> = () => true,
    private readonly workspaceSkillsRoot?: () => string | undefined,
    private readonly isWorkspaceOwned: (root: string) => boolean | Promise<boolean> = () => true,
  ) {}

  async read(kind: PhaseKind): Promise<string> {
    if (!PHASE_KINDS.includes(kind)) throw new Error(`Unknown phase kind: ${kind}`);
    const workspaceRoot = this.workspaceSkillsRoot?.();
    if (workspaceRoot !== undefined) {
      const workspaceSkill = join(workspaceRoot, 'orchestration');
      if (await this.isWorkspaceOwned(workspaceSkill)) {
        const workspacePhase = join(workspaceSkill, 'phases', `${kind}.md`);
        if (await this.fs.exists(workspacePhase)) return this.fs.readFile(workspacePhase);
      }
    }
    const clonePhase = join(this.userSkillsRoot, 'orchestration', 'phases', `${kind}.md`);
    if (await this.isCloneActive() && await this.fs.exists(clonePhase)) {
      return this.fs.readFile(clonePhase);
    }
    return this.fs.readFile(join(this.pluginsRoot, 'ptah-core', 'skills', 'orchestration', 'phases', `${kind}.md`));
  }
}
