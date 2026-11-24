import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import { FilePickerService } from '../../../services/file-picker.service';
import { ComposerAttachmentsService } from '../../../services/composer-attachments.service';
import { AttachmentTrayComponent } from './attachment-tray.component';

@Component({
  standalone: true,
  imports: [AttachmentTrayComponent],
  providers: [ComposerAttachmentsService],
  template: '<ptah-attachment-tray [imagesBlocked]="blocked()" />',
})
class TrayHost {
  readonly attachments = inject(ComposerAttachmentsService);
  readonly blocked = signal(false);
}

describe('AttachmentTrayComponent', () => {
  it('shows labelled pick and remove buttons, chips, and errors', () => {
    TestBed.configureTestingModule({
      imports: [TrayHost],
      providers: [
        { provide: ClaudeRpcService, useValue: { call: jest.fn() } },
        { provide: FilePickerService, useValue: { isFileSupported: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(TrayHost);
    fixture.componentInstance.attachments.addFile({ path: '/ws/brief.md', name: 'brief.md', size: 12, type: 'text', isLarge: false, tokenEstimate: 3 });
    fixture.componentInstance.attachments.showError('Image too large');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button[aria-label="Attach files"]')).not.toBeNull();
    expect(element.querySelector('button[aria-label="Attach images"]')).not.toBeNull();
    expect(element.querySelector('[role="group"][aria-label="Drop image attachments here"]')).not.toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Image too large');
    const remove = element.querySelector('button[aria-label="Remove brief.md"]') as HTMLButtonElement;
    expect(remove).not.toBeNull();
    remove.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.attachments.files()).toHaveLength(0);
    fixture.destroy();
  });

  it('flags image chips as unsendable only when images are blocked', () => {
    TestBed.configureTestingModule({
      imports: [TrayHost],
      providers: [
        { provide: ClaudeRpcService, useValue: { call: jest.fn() } },
        { provide: FilePickerService, useValue: { isFileSupported: () => true } },
      ],
    });
    const fixture = TestBed.createComponent(TrayHost);
    fixture.componentInstance.attachments.images.set([
      { id: 'img-1', data: 'aGk=', mediaType: 'image/png', dataUrl: 'data:image/png;base64,aGk=', name: 'shot.png' },
    ]);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="attachment-image-blocked"]')).toBeNull();
    fixture.componentInstance.blocked.set(true);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="attachment-image-blocked"]')?.textContent).toBe("Can't send");
    expect(element.querySelector('button[aria-label="Remove shot.png"]')?.classList).toContain('opacity-100');
    fixture.destroy();
  });
});
