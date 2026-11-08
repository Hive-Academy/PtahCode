import { toUnpackedAsarPath } from './vec-load-diagnostic';

describe('toUnpackedAsarPath', () => {
  it('rewrites the app.asar segment of a packaged path to app.asar.unpacked', () => {
    expect(
      toUnpackedAsarPath(
        '/opt/Ptah/resources/app.asar/node_modules/sqlite-vec-linux-x64/vec0.so',
        '/',
      ),
    ).toBe(
      '/opt/Ptah/resources/app.asar.unpacked/node_modules/sqlite-vec-linux-x64/vec0.so',
    );
  });

  it('rewrites Windows separators', () => {
    expect(
      toUnpackedAsarPath(
        'C:\\Ptah\\resources\\app.asar\\node_modules\\sqlite-vec-windows-x64\\vec0.dll',
        '\\',
      ),
    ).toBe(
      'C:\\Ptah\\resources\\app.asar.unpacked\\node_modules\\sqlite-vec-windows-x64\\vec0.dll',
    );
  });

  it('leaves an already unpacked path unchanged', () => {
    const unpacked =
      '/opt/Ptah/resources/app.asar.unpacked/node_modules/sqlite-vec-linux-x64/vec0.so';
    expect(toUnpackedAsarPath(unpacked, '/')).toBe(unpacked);
  });

  it('leaves a non-asar path unchanged', () => {
    const dev = '/repo/node_modules/sqlite-vec-linux-x64/vec0.so';
    expect(toUnpackedAsarPath(dev, '/')).toBe(dev);
  });

  it('does not rewrite a folder whose name only starts with app.asar', () => {
    const other = '/x/app.asarx/node_modules/vec0.so';
    expect(toUnpackedAsarPath(other, '/')).toBe(other);
  });
});
