import { acpFileUri, toAcpPromptContent } from './acp-prompt-content';

describe('acpFileUri', () => {
  it.each([
    ['C:\\Users\\dev\\project\\a.ts', 'file:///C:/Users/dev/project/a.ts'],
    ['C:/Users/dev/My Project/b#1.md', 'file:///C:/Users/dev/My%20Project/b%231.md'],
    ['\\\\fileserver\\share\\c.txt', 'file://fileserver/share/c.txt'],
    ['/home/dev/project/d.ts', 'file:///home/dev/project/d.ts'],
  ])('maps %s by its own shape, on any host', (path, uri) => {
    expect(acpFileUri(path)).toBe(uri);
  });
});

describe('toAcpPromptContent', () => {
  it('sends a text-only turn as one text block, even when empty', () => {
    expect(toAcpPromptContent({ text: '' })).toEqual([{ type: 'text', text: '' }]);
  });

  it('orders text, images, then files', () => {
    expect(
      toAcpPromptContent({
        text: 'hi',
        images: [{ mimeType: 'image/jpeg', data: 'AAAA' }],
        files: [{ path: '/home/dev/a.ts', name: 'a.ts' }],
      }),
    ).toEqual([
      { type: 'text', text: 'hi' },
      { type: 'image', mimeType: 'image/jpeg', data: 'AAAA' },
      { type: 'resource_link', uri: 'file:///home/dev/a.ts', name: 'a.ts' },
    ]);
  });

  it('omits the empty text of an attachment-only turn', () => {
    expect(
      toAcpPromptContent({ text: '', images: [{ mimeType: 'image/png', data: 'BBBB' }] }),
    ).toEqual([{ type: 'image', mimeType: 'image/png', data: 'BBBB' }]);
  });
});
