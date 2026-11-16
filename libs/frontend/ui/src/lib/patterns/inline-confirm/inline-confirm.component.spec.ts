import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahInlineConfirmComponent } from './inline-confirm.component';

@Component({
  standalone: true,
  imports: [PtahInlineConfirmComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button id="trigger" type="button" (click)="open.set(true)">Open</button>
    @if (open()) {
      <ptah-inline-confirm message="Remove this item?" detail="This cannot be undone" [tone]="tone()" [busy]="busy()" confirmTestId="confirm-action" cancelTestId="cancel-action" data-testid="confirm-group" (confirm)="confirmed()" (cancelled)="cancelled(); open.set(false)" />
    }
  `,
})
class HostComponent {
  readonly open = signal(false);
  readonly tone = signal<'default' | 'danger'>('default');
  readonly busy = signal(false);
  closeOnConfirm = true;
  confirms = 0;
  cancellations = 0;
  confirmed(): void {
    this.confirms++;
    if (this.closeOnConfirm) this.open.set(false);
  }
  cancelled(): void { this.cancellations++; }
}

describe('PtahInlineConfirmComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let element: HTMLElement;
  const find = (selector: string): HTMLElement => element.querySelector(selector) as HTMLElement;
  const open = (): void => {
    find('#trigger').click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    host = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
  });

  it('renders the group, accessible name, detail and test ids, then focuses Cancel', () => {
    find('#trigger').focus();
    open();
    expect(find('[data-testid="confirm-group"]').getAttribute('role')).toBe('group');
    expect(find('[data-testid="confirm-group"]').getAttribute('aria-label')).toBe('Remove this item?');
    expect(find('[data-testid="inline-confirm"]').textContent).toContain('This cannot be undone');
    expect(document.activeElement).toBe(find('[data-testid="cancel-action"]'));
  });

  it('emits cancelled on Escape and returns focus', () => {
    find('#trigger').focus();
    open();
    find('[data-testid="cancel-action"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.cancellations).toBe(1);
    expect(document.activeElement).toBe(find('#trigger'));
  });

  it('emits confirm and returns focus when the consumer closes the group', () => {
    find('#trigger').focus();
    open();
    find('[data-testid="confirm-action"]').click();
    fixture.detectChanges();
    expect(host.confirms).toBe(1);
    expect(find('[data-testid="confirm-group"]')).toBeNull();
    expect(document.activeElement).toBe(find('#trigger'));
  });

  it('keeps focus in the group on confirm while the consumer keeps it open and busy', () => {
    host.closeOnConfirm = false;
    find('#trigger').focus();
    open();
    find('[data-testid="confirm-action"]').click();
    host.busy.set(true);
    fixture.detectChanges();
    expect(host.confirms).toBe(1);
    const group = find('[data-testid="confirm-group"]');
    expect(group.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(find('#trigger'));
  });

  it('blocks confirm when busy, keeps it focusable and uses the danger button variant', () => {
    host.tone.set('danger');
    find('#trigger').focus();
    open();
    host.busy.set(true);
    fixture.detectChanges();
    const confirm = find('[data-testid="confirm-action"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(confirm.className).toContain('btn-error');
    confirm.click();
    expect(host.confirms).toBe(0);
  });

  it('does not take focus back on destroy when the user moved focus elsewhere', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    try {
      find('#trigger').focus();
      open();
      other.focus();
      host.open.set(false);
      fixture.detectChanges();
      expect(document.activeElement).toBe(other);
    } finally {
      other.remove();
    }
  });
});
