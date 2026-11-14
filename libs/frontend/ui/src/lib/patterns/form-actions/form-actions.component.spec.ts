import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PtahButtonDirective } from '../../button/button.directive';
import { PtahFormActionsComponent } from './form-actions.component';

const RAW_SPACING = /\b(gap|p|px|py|m|mx|my|space-[xy])-\d/;

@Component({
  standalone: true,
  imports: [PtahFormActionsComponent, PtahButtonDirective],
  template: `
    <ptah-form-actions
      [sticky]="sticky()"
      [dirty]="dirty()"
      [saving]="saving()"
      [disabled]="disabled()"
    >
      <span start>Hint</span>
      @if (showButtons()) {
        <button ptahButton variant="ghost" type="button">Cancel</button>
        <button ptahButton variant="primary" type="submit" [busy]="saving()">Save</button>
      }
    </ptah-form-actions>
  `,
})
class Host {
  readonly sticky = signal(false);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly disabled = signal(false);
  readonly showButtons = signal(true);
}

async function render(): Promise<{ fixture: ComponentFixture<Host>; host: HTMLElement }> {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const host = fixture.nativeElement.querySelector('ptah-form-actions') as HTMLElement;
  return { fixture, host };
}

async function settle(fixture: ComponentFixture<Host>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  // Let the MutationObserver callback run.
  await new Promise<void>((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

describe('PtahFormActionsComponent', () => {
  it('marks the host and renders a labelled group with buttons in DOM order', async () => {
    const { host } = await render();
    expect(host.getAttribute('data-ptah-pattern')).toBe('form-actions');
    expect(host.classList.contains('[container-type:inline-size]')).toBe(true);
    expect(host.hasAttribute('hidden')).toBe(false);
    const group = host.querySelector('[role="group"]') as HTMLElement;
    expect(group.getAttribute('aria-label')).toBe('Form actions');
    const labels = Array.from(group.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Cancel', 'Save']);
    expect(host.querySelector('[data-ptah-form-actions-start]')?.textContent).toContain('Hint');
  });

  it('is hidden with no projected button and shows again when buttons arrive', async () => {
    const { fixture, host } = await render();
    fixture.componentInstance.showButtons.set(false);
    await settle(fixture);
    expect(host.hasAttribute('hidden')).toBe(true);
    expect(host.classList.contains('hidden')).toBe(false);
    expect(host.classList.contains('block')).toBe(false);
    fixture.componentInstance.showButtons.set(true);
    await settle(fixture);
    expect(host.hasAttribute('hidden')).toBe(false);
    expect(host.classList.contains('block')).toBe(true);
  });

  it('shows the dirty text in a role="status" node', async () => {
    const { fixture, host } = await render();
    const status = host.querySelector('[role="status"]') as HTMLElement;
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent?.trim()).toBe('');
    fixture.componentInstance.dirty.set(true);
    fixture.detectChanges();
    expect(status.textContent?.trim()).toBe('Unsaved changes');
    expect(status.querySelector('[data-ptah-dirty-dot]')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sets aria-busy and aria-disabled on the group without disabling buttons', async () => {
    const { fixture, host } = await render();
    const group = host.querySelector('[role="group"]') as HTMLElement;
    expect(group.hasAttribute('aria-busy')).toBe(false);
    expect(group.hasAttribute('aria-disabled')).toBe(false);
    fixture.componentInstance.saving.set(true);
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();
    expect(group.getAttribute('aria-busy')).toBe('true');
    expect(group.getAttribute('aria-disabled')).toBe('true');
    const buttons = Array.from(group.querySelectorAll('button'));
    expect(buttons.every((b) => !b.disabled)).toBe(true);
  });

  it('switches between inline and sticky looks with token classes only', async () => {
    const { fixture, host } = await render();
    expect(host.classList.contains('pt-[var(--ptah-gap-group)]')).toBe(true);
    expect(host.classList.contains('sticky')).toBe(false);
    fixture.componentInstance.sticky.set(true);
    fixture.detectChanges();
    expect(host.hasAttribute('data-sticky')).toBe(true);
    expect(host.classList.contains('sticky')).toBe(true);
    expect(host.classList.contains('bottom-0')).toBe(true);
    expect(host.classList.contains('p-[var(--ptah-surface-pad)]')).toBe(true);
    expect(host.classList.contains('[background:var(--ptah-form-actions-bg)]')).toBe(true);
    expect(host.classList.contains('pt-[var(--ptah-gap-group)]')).toBe(false);
  });

  it('uses no raw spacing utility on the rendered pattern', async () => {
    const { fixture, host } = await render();
    fixture.componentInstance.dirty.set(true);
    fixture.componentInstance.sticky.set(true);
    fixture.detectChanges();
    const nodes = [host, ...Array.from(host.querySelectorAll<HTMLElement>('[data-ptah-form-actions-bar], [data-ptah-form-actions-bar] *:not(button):not(button *)'))];
    const classes = nodes.flatMap((node) => Array.from(node.classList));
    expect(classes.filter((name) => RAW_SPACING.test(name))).toEqual([]);
  });

  it('stacks buttons primary first below 320px', async () => {
    const { host } = await render();
    const buttons = host.querySelector('[data-ptah-form-actions-buttons]') as HTMLElement;
    expect(buttons.classList.contains('[@container(max-width:319.98px)]:flex-col-reverse')).toBe(true);
    expect(buttons.classList.contains('[@container(max-width:319.98px)]:w-full')).toBe(true);
  });

  it('uses custom label and dirty text', async () => {
    const fixture = TestBed.createComponent(PtahFormActionsComponent);
    fixture.componentRef.setInput('label', 'Account actions');
    fixture.componentRef.setInput('dirtyText', 'Changed');
    fixture.componentRef.setInput('dirty', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Account actions');
    expect(host.querySelector('[role="status"]')?.textContent?.trim()).toBe('Changed');
    expect(host.hasAttribute('hidden')).toBe(true);
  });

  it.each(['submit', 'button'])('counts a projected input[type=%s] as a button', async (type) => {
    @Component({
      standalone: true,
      imports: [PtahFormActionsComponent],
      template: `<ptah-form-actions><input [type]="type" value="Go" /></ptah-form-actions>`,
    })
    class InputHost {
      readonly type = type;
    }
    const fixture = TestBed.createComponent(InputHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('ptah-form-actions') as HTMLElement;
    expect(host.hasAttribute('hidden')).toBe(false);
  });
});
