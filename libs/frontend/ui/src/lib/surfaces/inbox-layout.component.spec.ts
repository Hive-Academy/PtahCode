import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InboxLayoutComponent } from './inbox-layout.component';

@Component({
  standalone: true,
  imports: [InboxLayoutComponent],
  template: `<ptah-inbox-layout
    listLabel="Machines"
    detailLabel="Machine detail"
    leadingLabel="Machine filters"
    [listWidth]="280"
    [leadingWidth]="200"
    [hasLeading]="true"
  >
    <div inboxLeading>leading-slot</div>
    <div inboxList>list-slot</div>
    detail-slot
  </ptah-inbox-layout>`,
})
class StaticHost {}

@Component({
  standalone: true,
  imports: [InboxLayoutComponent],
  template: `<ptah-inbox-layout
    listLabel="Runs"
    detailLabel="Run detail"
    [hasLeading]="leading()"
    [detailOpen]="open()"
  >
    <div inboxLeading>leading-slot</div>
    <div inboxList>list-slot</div>
    detail-slot
  </ptah-inbox-layout>`,
})
class TogglingHost {
  readonly leading = signal(false);
  readonly open = signal(false);
}

describe('InboxLayoutComponent', () => {
  it('projects each slot into its labelled glass pane', async () => {
    await TestBed.configureTestingModule({ imports: [StaticHost] }).compileComponents();
    const f = TestBed.createComponent(StaticHost);
    f.detectChanges();
    const host = f.nativeElement.querySelector('ptah-inbox-layout') as HTMLElement;
    expect(host.getAttribute('data-testid')).toBe('inbox-layout');
    expect(host.className).toContain('flex min-h-0 min-w-0 flex-1');
    const row = host.firstElementChild as HTMLElement;
    expect(row.className).toContain('flex min-h-0 min-w-0 flex-1 gap-4');
    const leading = host.querySelector('[data-testid="inbox-layout-leading"]') as HTMLElement;
    const list = host.querySelector('[data-testid="inbox-layout-list"]') as HTMLElement;
    const detail = host.querySelector('[data-testid="inbox-layout-detail"]') as HTMLElement;
    expect(leading.getAttribute('aria-label')).toBe('Machine filters');
    expect(list.getAttribute('aria-label')).toBe('Machines');
    expect(detail.getAttribute('aria-label')).toBe('Machine detail');
    expect(leading.textContent).toContain('leading-slot');
    expect(list.textContent).toContain('list-slot');
    expect(detail.textContent).toContain('detail-slot');
    for (const pane of [leading, list, detail]) {
      expect(pane.getAttribute('data-glass-surface')).toBe('content');
      expect(pane.className).toContain('surface-1');
      expect(pane.className).toContain('rounded-2xl');
      expect(pane.className).toContain('overflow-y-auto');
    }
  });

  it('scales the fixed panes from the width inputs', async () => {
    await TestBed.configureTestingModule({ imports: [StaticHost] }).compileComponents();
    const f = TestBed.createComponent(StaticHost);
    f.detectChanges();
    const host = f.nativeElement.querySelector('ptah-inbox-layout') as HTMLElement;
    const row = host.firstElementChild as HTMLElement;
    expect(row.style.getPropertyValue('--ptah-list-width')).toBe('280px');
    expect(row.style.getPropertyValue('--ptah-leading-width')).toBe('200px');
    const list = host.querySelector('[data-testid="inbox-layout-list"]') as HTMLElement;
    expect(list.className).toContain('flex-1');
    expect(list.className).toContain('min-[768px]:flex-none');
    expect(list.className).toContain('min-[768px]:w-[var(--ptah-list-width)]');
  });

  it('renders the leading pane only on request and hides it below 1200 px', async () => {
    await TestBed.configureTestingModule({ imports: [TogglingHost] }).compileComponents();
    const f = TestBed.createComponent(TogglingHost);
    f.detectChanges();
    const host = f.nativeElement.querySelector('ptah-inbox-layout') as HTMLElement;
    expect(host.querySelector('[data-testid="inbox-layout-leading"]')).toBeNull();
    f.componentInstance.leading.set(true);
    f.detectChanges();
    const leading = host.querySelector('[data-testid="inbox-layout-leading"]') as HTMLElement;
    expect(leading.textContent).toContain('leading-slot');
    expect(leading.className).toContain('hidden');
    expect(leading.className).toContain('min-[1200px]:block');
    expect(leading.className).toContain('min-[1200px]:w-[var(--ptah-leading-width)]');
  });

  it('shows one pane below 768 px as detailOpen selects', async () => {
    await TestBed.configureTestingModule({ imports: [TogglingHost] }).compileComponents();
    const f = TestBed.createComponent(TogglingHost);
    f.detectChanges();
    const host = f.nativeElement.querySelector('ptah-inbox-layout') as HTMLElement;
    const list = host.querySelector('[data-testid="inbox-layout-list"]') as HTMLElement;
    const detail = host.querySelector('[data-testid="inbox-layout-detail"]') as HTMLElement;
    expect(list.classList.contains('hidden')).toBe(false);
    expect(detail.classList.contains('hidden')).toBe(true);
    f.componentInstance.open.set(true);
    f.detectChanges();
    expect(list.classList.contains('hidden')).toBe(true);
    expect(detail.classList.contains('hidden')).toBe(false);
    // From 768 px both panes stay visible whatever detailOpen says.
    expect(list.className).toContain('min-[768px]:block');
    expect(detail.className).toContain('min-[768px]:block');
  });
});
