import { mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWorkspaceSkillPath, SkillPathRefusalError } from './resolve-workspace-skill-path';

describe('resolveWorkspaceSkillPath', () => {
  it('accepts a relative skill inside the workspace and refuses an outside path', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'ptah-skill-root-'));
    const outside = mkdtempSync(join(tmpdir(), 'ptah-skill-outside-'));
    const alias = `${workspace}-alias`;
    const escape = join(workspace, 'external');
    let linked = false;
    let escapeLinked = false;
    try {
      const skill = join(workspace, 'SKILL.md');
      writeFileSync(skill, 'Check evidence');
      expect(resolveWorkspaceSkillPath(workspace, 'SKILL.md')).toBe(realpathSync(skill));
      symlinkSync(workspace, alias, process.platform === 'win32' ? 'junction' : 'dir');
      linked = true;
      expect(resolveWorkspaceSkillPath(alias, 'SKILL.md')).toBe(realpathSync(skill));
      const external = join(outside, 'SKILL.md');
      writeFileSync(external, 'Outside');
      expect(() => resolveWorkspaceSkillPath(workspace, external)).toThrow(SkillPathRefusalError);
      symlinkSync(outside, escape, process.platform === 'win32' ? 'junction' : 'dir');
      escapeLinked = true;
      expect(() => resolveWorkspaceSkillPath(workspace, join('external', 'SKILL.md')))
        .toThrow(SkillPathRefusalError);
    } finally {
      if (escapeLinked) unlinkSync(escape);
      if (linked) unlinkSync(alias);
      rmSync(workspace, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
