import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PHASE_KINDS, SKILL_CLONE_FILES } from '@ptah-extension/shared';
import {
  SkillGetHistoryBodyParamsSchema,
  SkillPreviewEnhancementParamsSchema,
  SkillRevertEnhancementParamsSchema,
} from '../skills-synthesis-rpc.schema';
import {
  isInsideRoot,
  listSkillClonePhaseFiles,
  resolveSkillCloneFilePath,
} from './skill-clone-file-path';

describe('skill clone `file` argument (U-D13 (1))', () => {
  describe('Zod parse', () => {
    const schemas = [
      ['previewEnhancement', SkillPreviewEnhancementParamsSchema, {}],
      ['getHistoryBody', SkillGetHistoryBodyParamsSchema, { ts: '1717848000000' }],
      ['revertEnhancement', SkillRevertEnhancementParamsSchema, { historyTs: '1717848000000' }],
    ] as const;

    it.each(schemas)('%s accepts no file, SKILL.md and every phase file', (_name, schema, extra) => {
      const base = { kind: 'skill', slug: 'deep-research', ...extra };
      expect(schema.safeParse(base).success).toBe(true);
      for (const file of SKILL_CLONE_FILES) {
        expect(schema.safeParse({ ...base, file }).success).toBe(true);
      }
      expect(SKILL_CLONE_FILES).toHaveLength(PHASE_KINDS.length + 1);
    });

    it.each(schemas)('%s refuses a path that is not an exact phase file', (_name, schema, extra) => {
      const base = { kind: 'skill', slug: 'deep-research', ...extra };
      for (const file of [
        '../SKILL.md',
        'phases/../SKILL.md',
        'phases/unknown.md',
        'phases\\plan.md',
        'Phases/plan.md',
        'phases/PLAN.md',
        '/phases/plan.md',
        'phases/plan.md ',
        'phases/plan',
        '',
        42,
      ]) {
        expect(schema.safeParse({ ...base, file }).success).toBe(false);
      }
    });

    it.each(schemas)('%s refuses any file on kinds agent and command', (_name, schema, extra) => {
      for (const kind of ['agent', 'command']) {
        const base = { kind, slug: 'deep-research', ...extra };
        expect(schema.safeParse(base).success).toBe(true);
        expect(schema.safeParse({ ...base, file: 'SKILL.md' }).success).toBe(false);
        expect(schema.safeParse({ ...base, file: 'phases/plan.md' }).success).toBe(false);
      }
    });
  });

  describe('path checks', () => {
    let root: string;
    let cloneDir: string;

    beforeEach(() => {
      root = fs.mkdtempSync(join(tmpdir(), 'skill-clone-file-'));
      cloneDir = join(root, 'deep-research');
      fs.mkdirSync(join(cloneDir, 'phases'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });

    it('isInsideRoot accepts the root and a child, and refuses a sibling', () => {
      expect(isInsideRoot(cloneDir, cloneDir)).toBe(true);
      expect(isInsideRoot(join(cloneDir, 'phases', 'plan.md'), cloneDir)).toBe(true);
      expect(isInsideRoot(join(root, 'other'), cloneDir)).toBe(false);
      expect(isInsideRoot(join(cloneDir, '..', 'x'), cloneDir)).toBe(false);
    });

    it('resolves a phase file inside the clone folder', () => {
      expect(resolveSkillCloneFilePath(cloneDir, 'phases/plan.md')).toBe(
        join(cloneDir, 'phases', 'plan.md'),
      );
      expect(resolveSkillCloneFilePath(cloneDir, 'SKILL.md')).toBe(join(cloneDir, 'SKILL.md'));
    });

    it('refuses a phase file whose real path leaves the clone folder', () => {
      const outside = join(root, 'outside.md');
      fs.writeFileSync(outside, 'secret');
      const link = join(cloneDir, 'phases', 'plan.md');
      try {
        fs.symlinkSync(outside, link, 'file');
      } catch {
        // A host without symbolic-link rights (Windows without developer
        // mode) cannot build this case; the joined-path gate still applies.
        return;
      }
      expect(resolveSkillCloneFilePath(cloneDir, 'phases/plan.md')).toBeNull();
      expect(listSkillClonePhaseFiles(cloneDir)).toEqual([]);
    });

    it('lists the phase files that exist, in PHASE_KINDS order', () => {
      const [first, second] = PHASE_KINDS;
      fs.writeFileSync(join(cloneDir, 'phases', `${second}.md`), 'b');
      fs.writeFileSync(join(cloneDir, 'phases', `${first}.md`), 'a');
      fs.writeFileSync(join(cloneDir, 'phases', 'notes.md'), 'ignored');
      expect(listSkillClonePhaseFiles(cloneDir)).toEqual([
        `phases/${first}.md`,
        `phases/${second}.md`,
      ]);
    });

    it('lists nothing for a clone without a phases folder', () => {
      fs.rmSync(join(cloneDir, 'phases'), { recursive: true });
      expect(listSkillClonePhaseFiles(cloneDir)).toEqual([]);
    });
  });
});
