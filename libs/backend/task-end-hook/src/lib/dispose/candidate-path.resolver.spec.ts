import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveCandidatePath } from './candidate-path.resolver';

let root: string;

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-candidate-path-')),
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('resolveCandidatePath', () => {
  it('resolves an existing directory to its real path', async () => {
    const dir = path.join(root, 'wt');
    fs.mkdirSync(dir);

    expect(await resolveCandidatePath(dir)).toEqual({
      dirExists: true,
      resolution: { kind: 'resolved', realPath: dir },
    });
  });

  it('resolves a symlink to the directory it points at', async () => {
    const dir = path.join(root, 'wt');
    const link = path.join(root, 'link');
    fs.mkdirSync(dir);
    fs.symlinkSync(dir, link, 'dir');

    expect(await resolveCandidatePath(link)).toEqual({
      dirExists: true,
      resolution: { kind: 'resolved', realPath: dir },
    });
  });

  it('gives the nearest existing parent and the raw remaining segments for a missing path', async () => {
    const missing = path.join(root, 'gone', 'deeper');

    expect(await resolveCandidatePath(missing)).toEqual({
      dirExists: false,
      resolution: {
        kind: 'missing',
        nearestParentRealPath: root,
        remainingSegments: ['gone', 'deeper'],
      },
    });
  });

  it('reports a relative path as an error', async () => {
    expect(await resolveCandidatePath('relative/wt')).toEqual({
      dirExists: false,
      resolution: { kind: 'error' },
    });
  });

  it('reports a realpath failure other than a missing path as an error', async () => {
    jest
      .spyOn(fs.promises, 'realpath')
      .mockRejectedValue(
        Object.assign(new Error('denied'), { code: 'EACCES' }),
      );

    expect(await resolveCandidatePath(path.join(root, 'wt'))).toEqual({
      dirExists: false,
      resolution: { kind: 'error' },
    });
  });
});
