/** Pure selection rules of backup retention (no filesystem). */
import * as path from 'node:path';
import {
  backupNamePattern,
  isInsideDir,
  selectBackupsToDelete,
  selectOwnStagingRoots,
} from './backup-retention';

const DIR = path.resolve('tmp-root', 'backups');
const LIVE = path.resolve('tmp-root', 'ptah.sqlite');

describe('backup retention selection', () => {
  it('keeps the newest N daily files and selects the rest', () => {
    const entries = [
      'ptah-2025-01-01.sqlite',
      'ptah-2025-01-04.sqlite',
      'ptah-2025-01-02.sqlite',
      'ptah-2025-01-03.sqlite',
      'ptah-2025-01-05.sqlite',
    ];
    expect(
      selectBackupsToDelete({
        entries,
        dir: DIR,
        prefix: 'ptah-',
        kind: 'daily',
        keep: 3,
        liveDbPath: LIVE,
      }),
    ).toEqual(['ptah-2025-01-02.sqlite', 'ptah-2025-01-01.sqlite']);
  });

  it('ignores foreign files and look-alike names', () => {
    const entries = [
      'ptah-2025-01-01.sqlite',
      'ptah-notes.sqlite',
      'ptah-2025-01-01.sqlite-wal',
      'ptah-2025-01-01.sqlite.bak',
      'xptah-2025-01-01.sqlite',
      'ptah-2025-01-02.sqlite.12345678.tmp',
      'readme.txt',
    ];
    expect(
      selectBackupsToDelete({
        entries,
        dir: DIR,
        prefix: 'ptah-',
        kind: 'daily',
        keep: 1,
        liveDbPath: LIVE,
      }),
    ).toEqual([]);
    const pattern = backupNamePattern('ptah-', 'daily');
    expect(entries.filter((e) => pattern.test(e))).toEqual([
      'ptah-2025-01-01.sqlite',
    ]);
  });

  it('never selects the live database even when its name looks like a backup', () => {
    const live = path.join(DIR, 'ptah-2020-01-01.sqlite');
    const result = selectBackupsToDelete({
      entries: ['ptah-2020-01-01.sqlite', 'ptah-2025-01-01.sqlite'],
      dir: DIR,
      prefix: 'ptah-',
      kind: 'daily',
      keep: 1,
      liveDbPath: live,
    });
    expect(result).toEqual([]);
  });

  it('matches reset and pre-migration compact names only for their prefix', () => {
    const entries = [
      'ptah.reset-20250101T120000Z.sqlite',
      'ptah.reset-20250102T120000123Z-aabbccdd.sqlite',
      'ptah.reset-20250103T120000Z.sqlite',
      'ptah.pre-migration-20250101T120000Z.sqlite',
    ];
    expect(
      selectBackupsToDelete({
        entries,
        dir: path.dirname(LIVE),
        prefix: 'ptah.reset-',
        kind: 'reset',
        keep: 2,
        liveDbPath: LIVE,
      }),
    ).toEqual(['ptah.reset-20250101T120000Z.sqlite']);
  });

  it('keeps the millisecond backup when an older seconds-form backup has the same second', () => {
    expect(selectBackupsToDelete({
      entries: [
        'ptah.reset-20250101T120000Z.sqlite',
        'ptah.reset-20250101T120000900Z-aabbccdd.sqlite',
      ],
      dir: path.dirname(LIVE), prefix: 'ptah.reset-', kind: 'reset', keep: 1, liveDbPath: LIVE,
    })).toEqual(['ptah.reset-20250101T120000Z.sqlite']);
  });

  it('matches only historical own final and staging name forms', () => {
    const dir = path.dirname(LIVE);
    const prefix = 'ptah.reset-';
    const own = [
      'ptah.reset-20250101T120000Z.sqlite',
      'ptah.reset-20250101T120000900Z-aabbccdd.sqlite',
    ];
    const foreign = [
      'ptah.reset-20250101T120000900Z.sqlite',
      'ptah.reset-20250101T120000Z-aabbccdd.sqlite',
      'ptah.reset-garbage.sqlite',
    ];
    const pattern = backupNamePattern(prefix, 'reset');
    expect([...own, ...foreign].filter((name) => pattern.test(name))).toEqual(own);
    expect(selectOwnStagingRoots({
      entries: [...own, ...foreign].map((name) => `${name}.12345678.tmp`),
      dir, prefix, kind: 'reset', liveDbPath: LIVE,
    })).toEqual(own.map((name) => `${name}.12345678.tmp`));
  });

  it('does not rotate impossible daily dates', () => {
    expect(selectBackupsToDelete({
      entries: ['ptah-2025-02-30.sqlite', 'ptah-2025-03-01.sqlite'],
      dir: DIR, prefix: 'ptah-', kind: 'daily', keep: 1, liveDbPath: LIVE,
    })).toEqual([]);
  });

  it('refuses a path outside the root', () => {
    expect(isInsideDir(DIR, path.join(DIR, '..', 'ptah.sqlite'))).toBe(false);
    expect(isInsideDir(DIR, DIR)).toBe(false);
    expect(isInsideDir(DIR, path.join(DIR, 'a.sqlite'))).toBe(true);
    const result = selectBackupsToDelete({
      entries: ['ptah-2025-01-01.sqlite', 'ptah-2025-01-02.sqlite'],
      dir: DIR,
      prefix: 'ptah-',
      kind: 'daily',
      keep: 1,
      liveDbPath: LIVE,
    });
    expect(result.every((f) => isInsideDir(DIR, path.join(DIR, f)))).toBe(true);
  });
});
