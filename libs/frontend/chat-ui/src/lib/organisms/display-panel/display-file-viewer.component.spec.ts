import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import { DisplayFileViewerComponent } from './display-file-viewer.component';

const file = { kind: 'image-file' as const, key: 'file:image-file:root:photo.png', path: '/root/photo.png', workspaceRoot: '/root', title: 'photo.png', readStatus: 'unread' as const };

describe('DisplayFileViewerComponent', () => {
  const call = jest.fn();
  beforeEach(() => {
    call.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: ClaudeRpcService, useValue: { call } }] });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:preview') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  });

  it.each(['image-file', 'pdf-file'] as const)('fills the available area for %s', async kind => {
    call.mockResolvedValue({ success: true, data: { success: true, kind: kind === 'pdf-file' ? 'pdf' : 'image', mime: kind === 'pdf-file' ? 'application/pdf' : 'image/png', dataBase64: 'AA==' } });
    const fixture = TestBed.createComponent(DisplayFileViewerComponent);
    fixture.componentRef.setInput('file', { ...file, kind });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    expect(host.classList.contains('min-h-0')).toBe(true);
    expect(host.classList.contains('h-full')).toBe(true);
    if (kind === 'image-file') {
      const image = host.querySelector('img');
      expect(image?.classList.contains('object-contain')).toBe(true);
      expect(image?.classList.contains('max-h-full')).toBe(true);
      expect(image?.parentElement?.classList.contains('items-center')).toBe(true);
    } else {
      expect(host.querySelector('iframe')?.classList.contains('h-full')).toBe(true);
    }
    fixture.destroy();
  });

  it('revokes the blob URL when the viewer closes', async () => {
    call.mockResolvedValue({ success: true, data: { success: true, kind: 'image', mime: 'image/png', dataBase64: 'AA==' } });
    const fixture = TestBed.createComponent(DisplayFileViewerComponent);
    fixture.componentRef.setInput('file', file);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('shows a retryable error when the read fails', async () => {
    call.mockResolvedValue({ success: true, data: { success: false, reason: 'not-found' } });
    const fixture = TestBed.createComponent(DisplayFileViewerComponent);
    fixture.componentRef.setInput('file', file);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button')?.textContent).toContain('Retry');
    fixture.destroy();
  });

  it.each([undefined, ''])('omits an empty or unknown workspace root (%s) from the file RPC', async workspaceRoot => {
    call.mockResolvedValue({ success: true, data: { success: true, kind: 'image', mime: 'image/png', dataBase64: 'AA==' } });
    const fixture = TestBed.createComponent(DisplayFileViewerComponent);
    fixture.componentRef.setInput('file', { ...file, workspaceRoot });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(call.mock.calls[0][1]).not.toHaveProperty('workspaceRoot');
    fixture.destroy();
  });
});
