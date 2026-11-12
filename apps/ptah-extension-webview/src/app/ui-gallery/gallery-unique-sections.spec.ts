import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const galleryDir = __dirname;
const hostSource = readFileSync(
  join(galleryDir, '..', 'ui-gallery.component.ts'),
  'utf-8',
);
const files = readdirSync(galleryDir).filter(
  (file) => file.endsWith('.component.ts') && !file.endsWith('.spec.ts'),
);

function duplicates(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe('UI gallery sections', () => {
  it('declares each section id once', () => {
    const ids = files.flatMap((file) =>
      [
        ...readFileSync(join(galleryDir, file), 'utf-8').matchAll(
          /<ptah-gallery-section\s+id="([^"]+)"/g,
        ),
      ].map((match) => match[1]),
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(duplicates(ids)).toEqual([]);
  });

  it('renders each family component once in the host', () => {
    const tags = [...hostSource.matchAll(/<(ptah-gallery-[a-z-]+)\s*\/>/g)].map(
      (match) => match[1],
    );
    expect(duplicates(tags)).toEqual([]);
  });

  it('keeps the old duplicate sections out of the gallery', () => {
    const sources = [
      hostSource,
      ...files.map((file) => readFileSync(join(galleryDir, file), 'utf-8')),
    ].join(' ');
    for (const id of [
      'components-buttons',
      'components-meters',
      'components-fields',
      'components-metrics',
      'components-statuses',
    ]) {
      expect(sources).not.toContain(id);
    }
  });
});
