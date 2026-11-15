import * as fs from 'fs';
import * as path from 'path';
import { parsePack } from './pack-parser';

const read = (file: string): string =>
  fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('pack parser', () => {
  it('accepts an added phase in a fixture pack without runtime changes', () => {
    expect(
      parsePack('extra-phase', read('fixtures/extra-phase.md')).phaseFlow,
    ).toEqual(['plan', 'research', 'docs', 'review', 'completion']);
  });

  it('rejects a wrong title and an unknown phase kind', () => {
    expect(() => parsePack('bad-title', read('fixtures/bad-title.md'))).toThrow(
      'Pack title',
    );
    expect(() =>
      parsePack('unknown-phase', read('fixtures/unknown-phase.md')),
    ).toThrow('Unknown phase kind');
  });

  it('rejects malformed phase bullets without dropping valid phases', () => {
    const source = read('fixtures/extra-phase.md');
    expect(
      parsePack('extra-phase', source.replace('- docs\n', '- docs \n'))
        .phaseFlow,
    ).toContain('docs');
    expect(() =>
      parsePack('extra-phase', source.replace('- docs\n', '- unknown_kind\n')),
    ).toThrow('Malformed phase flow entry');
    expect(() =>
      parsePack('extra-phase', source.replace('- docs\n', '- `docs`\n')),
    ).toThrow('Malformed phase flow entry');
  });

  it('matches the real software and research examples', () => {
    const root = path.resolve(__dirname, '../..');
    const pack = (stem: string) =>
      parsePack(
        stem,
        fs.readFileSync(
          path.join(
            root,
            'plugins/ptah-core/skills/orchestration/packs',
            `${stem}.md`,
          ),
          'utf8',
        ),
      );
    const example = (stem: string) =>
      fs.readFileSync(
        path.join(
          root,
          '.ptah/specs/TASK_2026_977_0876/phase-6-examples',
          `${stem}-task.md`,
        ),
        'utf8',
      );
    expect(pack('software').phaseFlow).toEqual([
      'plan',
      'document-review',
      'research',
      'design',
      'architecture',
      'batch',
      'implement',
      'review',
      'tests',
      'completion',
    ]);
    expect(example('software')).toContain(
      'plan → document-review → architecture → document-review → batch → implement → review → tests → completion',
    );
    expect(pack('research').phaseFlow).toEqual([
      'plan',
      'research',
      'completion',
    ]);
    expect(example('research')).toContain('research → completion');
  });
});
