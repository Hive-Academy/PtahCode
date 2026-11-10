/**
 * ElectronFileDialog maps picker options and transfers an open dialog to its
 * newest caller without sharing selected paths.
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

type OpenResult = { canceled: boolean; filePaths: string[] };

function deferredDialog() {
  let resolve!: (value: OpenResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<OpenResult>((resolveDialog, rejectDialog) => {
    resolve = resolveDialog;
    reject = rejectDialog;
  });
  return { promise, resolve, reject };
}

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

  it('hands an open dialog to the second caller and opens a new one after it closes', async () => {
    const dialog = deferredDialog();
    showOpenDialog.mockReturnValueOnce(dialog.promise);
    const request = { multiple: true, title: 'Attach files' };

    const first = provider.openFiles(request);
    const second = provider.openFiles({ ...request });
    await expect(first).resolves.toEqual([]);
    await Promise.resolve();
    expect(showOpenDialog).toHaveBeenCalledTimes(1);
    dialog.resolve({ canceled: false, filePaths: ['/tmp/one.ts'] });

    await expect(second).resolves.toEqual(['/tmp/one.ts']);

    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await expect(provider.openFiles(request)).resolves.toEqual([]);
    expect(showOpenDialog).toHaveBeenCalledTimes(2);
  });

  it('gives paths only to the last of three callers', async () => {
    const dialog = deferredDialog();
    showOpenDialog.mockReturnValueOnce(dialog.promise);
    const request = { multiple: false, title: 'Pick a file' };

    const first = provider.openFiles(request);
    const second = provider.openFiles(request);
    const third = provider.openFiles(request);
    await expect(first).resolves.toEqual([]);
    await expect(second).resolves.toEqual([]);
    dialog.resolve({ canceled: false, filePaths: ['/tmp/last.ts'] });

    await expect(third).resolves.toEqual(['/tmp/last.ts']);
    expect(showOpenDialog).toHaveBeenCalledTimes(1);
  });

  it('opens separate dialogs for different request shapes', async () => {
    const files = deferredDialog();
    const images = deferredDialog();
    showOpenDialog
      .mockReturnValueOnce(files.promise)
      .mockReturnValueOnce(images.promise);

    const fileOwner = provider.openFiles({ multiple: true, title: 'Files' });
    const imageOwner = provider.openFiles({ multiple: false, title: 'Images' });
    images.resolve({ canceled: false, filePaths: ['/tmp/photo.png'] });
    files.resolve({ canceled: false, filePaths: ['/tmp/doc.txt'] });

    await expect(fileOwner).resolves.toEqual(['/tmp/doc.txt']);
    await expect(imageOwner).resolves.toEqual(['/tmp/photo.png']);
    expect(showOpenDialog).toHaveBeenCalledTimes(2);
  });

  it('rejects only the owner when the native dialog fails after a handover', async () => {
    const dialog = deferredDialog();
    showOpenDialog.mockReturnValueOnce(dialog.promise);
    const request = { multiple: false, title: 'Pick a file' };
    const first = provider.openFiles(request);
    const second = provider.openFiles(request);

    await expect(first).resolves.toEqual([]);
    const failure = new Error('native picker failed');
    const ownerRejection = expect(second).rejects.toBe(failure);
    dialog.reject(failure);
    await ownerRejection;
  });

  it('resolves the current owner with an empty list when the dialog is canceled', async () => {
    const dialog = deferredDialog();
    showOpenDialog.mockReturnValueOnce(dialog.promise);
    const request = { multiple: false, title: 'Pick a file' };
    const first = provider.openFiles(request);
    const owner = provider.openFiles(request);

    await expect(first).resolves.toEqual([]);
    dialog.resolve({ canceled: true, filePaths: ['/tmp/stale.ts'] });
    await expect(owner).resolves.toEqual([]);
  });
});
