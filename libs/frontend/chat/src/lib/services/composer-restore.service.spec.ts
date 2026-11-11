import { ComposerRestoreService } from './composer-restore.service';
import type { ChatFile } from './file-picker.service';
import type { ComposerDraftImage } from './composer-draft.store';

it('merges restored attachments into later composer edits without replacing them', () => {
  const service = new ComposerRestoreService();
  const file = (path: string): ChatFile => ({
    path, name: path, size: 1, type: 'text', isLarge: false, tokenEstimate: 1,
  });
  const image = (id: string): ComposerDraftImage => ({
    id, data: id, mediaType: 'image/png', dataUrl: `data:image/png;base64,${id}`, name: id,
  });
  const sentFile = file('/ws/sent.md');
  const editedFile = file('/ws/edited.md');
  const sentImage = image('sent');
  const editedImage = image('edited');
  service.restoreAttachments('tab', [sentFile], [sentImage]);

  expect(service.mergeAttachments('tab', [editedFile], [editedImage])).toEqual({
    files: [editedFile, sentFile],
    images: [editedImage, sentImage],
  });
  expect(service.pendingAttachmentsFor('tab')).toBeNull();
});

it('keeps a queued file and image when text is consumed before attachments', () => {
  const service = new ComposerRestoreService();
  const file: ChatFile = {
    path: '/ws/queued.md', name: 'queued.md', size: 1, type: 'text', isLarge: false, tokenEstimate: 1,
  };
  const image: ComposerDraftImage = {
    id: 'queued', data: 'queued', mediaType: 'image/png',
    dataUrl: 'data:image/png;base64,queued', name: 'queued',
  };
  service.restore('tab', ['queued text']);
  service.restoreAttachments('tab', [file], [image]);

  expect(service.consume('tab')).toBe('queued text');
  expect(service.pendingFor('tab')).toBeNull();
  expect(service.mergeAttachments('tab', [], [])).toEqual({ files: [file], images: [image] });
  expect(service.mergeAttachments('tab', [], [])).toBeNull();
});
