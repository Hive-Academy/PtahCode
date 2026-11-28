import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NativePopoverComponent } from '@ptah-extension/ui';
import { ComposerActivityDirective } from './composer-activity.directive';

@Component({
  imports: [ComposerActivityDirective, NativePopoverComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div ptahComposerActivity data-testid="composer">
      <button type="button" id="write">Write</button>
      @if (showFirst()) {
        <ptah-native-popover [isOpen]="first()" [hasBackdrop]="false" (closed)="first.set(false)">
          <button trigger type="button" id="menu-a" (click)="first.set(true)">Menu A</button>
          <button content type="button" id="item-a">Item A</button>
        </ptah-native-popover>
      }
      <ptah-native-popover [isOpen]="second()" [hasBackdrop]="false" (closed)="second.set(false)">
        <button trigger type="button" id="menu-b" (click)="second.set(true)">Menu B</button>
        <button content type="button" id="item-b">Item B</button>
      </ptah-native-popover>
    </div>
    <button type="button" id="outside">Outside</button>
  `,
})
class HostComponent {
  readonly showFirst = signal(true);
  readonly first = signal(false);
  readonly second = signal(false);
}

describe('ComposerActivityDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const composer = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="composer"]') as HTMLElement;
  const activity = (): ComposerActivityDirective =>
    fixture.debugElement.query(By.directive(ComposerActivityDirective)).injector.get(ComposerActivityDirective);
  const panels = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>('.popover-panel'));

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  it('keeps the composer active while focus is in a portaled panel and until the last owned overlay closes', async () => {
    const write = document.getElementById('write') as HTMLButtonElement;
    write.focus();
    expect(activity().focusWithin()).toBe(true);
    expect(activity().popoverOpen()).toBe(false);

    (document.getElementById('menu-a') as HTMLButtonElement).click();
    await render();
    const firstPanel = panels()[0];
    expect(firstPanel).toBeTruthy();
    expect(composer().contains(firstPanel)).toBe(false);
    expect(document.activeElement).toBe(firstPanel);
    expect(activity().popoverOpen()).toBe(true);
    expect(activity().focusWithin()).toBe(true);

    (document.getElementById('menu-b') as HTMLButtonElement).click();
    await render();
    expect(panels()).toHaveLength(2);
    expect(activity().popoverOpen()).toBe(true);
    expect(composer().contains(document.activeElement)).toBe(false);

    const outside = document.getElementById('outside') as HTMLButtonElement;
    outside.focus();
    await Promise.resolve();
    expect(activity().focusWithin()).toBe(false);
    expect(activity().popoverOpen()).toBe(true);

    host.first.set(false);
    await render();
    expect(panels()).toHaveLength(1);
    expect(activity().popoverOpen()).toBe(true);
    expect(document.activeElement).toBe(outside);

    const lastPanel = panels()[0];
    lastPanel.focus();
    expect(activity().focusWithin()).toBe(true);
    host.second.set(false);
    await render();
    expect(panels()).toHaveLength(0);
    expect(activity().popoverOpen()).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('menu-b'));
    expect(activity().focusWithin()).toBe(true);
  });

  it('drops ownership when the open overlay is destroyed', async () => {
    (document.getElementById('menu-a') as HTMLButtonElement).click();
    await render();
    expect(activity().popoverOpen()).toBe(true);
    host.showFirst.set(false);
    await render();
    expect(panels()).toHaveLength(0);
    expect(activity().popoverOpen()).toBe(false);
  });
});
