/**
 * `ElectronFileDialog` — the whole adapter, including the two branches the
 * suite never reached: a cancelled dialog and a multi-select request carrying
 * filters. Both are ordinary user outcomes, not edge cases, and neither had a
 * test (TASK_2026_411: this file sat at 20 % line coverage).
 *
 * `electron` is mocked virtually because this lib declares it a peer and the
 * adapter reaches it through a dynamic `await import('electron')`.
 */

import 'reflect-metadata';

const showOpenDialog = jest.fn();

jest.mock(
  'electron',
  () => ({
    dialog: {
      showOpenDialog: (...args: unknown[]) =>
        showOpenDialog(...args) as unknown,
    },
  }),
  { virtual: true },
);

import { ElectronFileDialog } from './electron-file-dialog';

describe('ElectronFileDialog', () => {
  let provider: ElectronFileDialog;

  beforeEach(() => {
    showOpenDialog.mockReset();
    provider = new ElectronFileDialog();
  });

  it('returns the selected paths for a single-file request', async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/one.ts'],
    });

    const result = await provider.openFiles({
      multiple: false,
      title: 'Pick a file',
    });

    expect(result).toEqual(['/tmp/one.ts']);
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openFile'],
      title: 'Pick a file',
    });
  });

  it('adds multiSelections and maps filters into Electron shape', async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/a.ts', '/tmp/b.ts'],
    });

    const result = await provider.openFiles({
      multiple: true,
      title: 'Pick files',
      filters: { TypeScript: ['ts', 'tsx'], Images: ['png'] },
    });

    expect(result).toEqual(['/tmp/a.ts', '/tmp/b.ts']);
    expect(showOpenDialog).toHaveBeenCalledWith({
      properties: ['openFile', 'multiSelections'],
      title: 'Pick files',
      filters: [
        { name: 'TypeScript', extensions: ['ts', 'tsx'] },
        { name: 'Images', extensions: ['png'] },
      ],
    });
  });

  it('returns an empty list when the user cancels', async () => {
    // Electron still reports `filePaths` on a cancel; returning it would hand
    // the caller paths the user explicitly declined.
    showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: ['/tmp/stale.ts'],
    });

    await expect(
      provider.openFiles({ multiple: true, title: 'Pick files' }),
    ).resolves.toEqual([]);
  });

  it('joins the open dialog for a repeated request, then opens a new one after it closes', async () => {
    let close: (value: { canceled: boolean; filePaths: string[] }) => void =
      () => undefined;
    showOpenDialog.mockReturnValueOnce(
      new Promise((resolve) => {
        close = resolve;
      }),
    );
    const request = { multiple: true, title: 'Attach files' };

    const first = provider.openFiles(request);
    const second = provider.openFiles({ ...request });
    await Promise.resolve();
    await Promise.resolve();
    close({ canceled: false, filePaths: ['/tmp/one.ts'] });

    await expect(first).resolves.toEqual(['/tmp/one.ts']);
    await expect(second).resolves.toEqual(['/tmp/one.ts']);
    expect(showOpenDialog).toHaveBeenCalledTimes(1);

    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await expect(provider.openFiles(request)).resolves.toEqual([]);
    expect(showOpenDialog).toHaveBeenCalledTimes(2);
  });
});
