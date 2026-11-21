import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ProvidersConnection } from '@ptah-extension/core';
import { ProviderCatalogModalComponent } from './provider-catalog-modal.component';

const entry = (id: string, name: string, authMode: ProvidersConnection['authMode'] = 'apiKey', defaultsResolvable = false): ProvidersConnection => ({
  id, name, authMode, hasKey: false, configured: false, custom: false, defaultsResolvable, accountLabel: null, tokenStale: false,
});
const CATALOG = [entry('openrouter', 'OpenRouter'), entry('github-copilot', 'GitHub Copilot', 'oauth'), entry('ollama', 'Ollama', 'local-native', true)];

@Component({
  standalone: true,
  imports: [ProviderCatalogModalComponent],
  template: `
    <ptah-provider-catalog-modal [open]="open()" [providers]="providers()" [status]="status()" [canSetUp]="canSetUp()"
      (closed)="events.push('closed')" (providerChosen)="events.push('chosen:' + $event)" (customChosen)="events.push('custom')"
      (signInRequested)="events.push('sign-in:' + $event)" (retryRequested)="events.push('retry')" />
  `,
})
class Host {
  readonly open = signal(true);
  readonly providers = signal<readonly ProvidersConnection[]>(CATALOG);
  readonly status = signal<'loading' | 'ready' | 'error'>('ready');
  readonly canSetUp = signal(true);
  readonly events: string[] = [];
}

describe('ProviderCatalogModalComponent', () => {
  let fixture: ComponentFixture<Host>;
  let element: HTMLElement;
  const query = <T extends HTMLElement = HTMLElement>(id: string) => element.querySelector<T>(`[data-testid="${id}"]`);
  const button = (name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((node) => (node.getAttribute('aria-label') ?? node.textContent?.trim()) === name);
  const rows = () => Array.from(element.querySelectorAll('[data-provider]')).map((row) => row.getAttribute('data-provider'));
  function search(text: string) {
    const input = query<HTMLInputElement>('provider-catalog-search');
    if (!input) throw new Error('No search');
    input.value = text; input.dispatchEvent(new Event('input')); fixture.detectChanges();
  }

  beforeAll(() => {
    // jsdom has no <dialog> modal API; the real one (focus trap, Esc, focus return) is asserted in Playwright.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
  });
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });
  afterEach(() => TestBed.resetTestingModule());

  it('is the prototype palette: a named dialog, search with the catalog count, the unconfigured list, a custom endpoint row', () => {
    const dialog = element.querySelector('dialog');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('provider-catalog-title');
    expect(document.getElementById('provider-catalog-title')?.textContent?.trim()).toBe('Connect a provider');
    expect(query('provider-catalog-modal')).not.toBeNull();
    expect(query<HTMLInputElement>('provider-catalog-search')?.placeholder).toBe('Type provider name (3 in catalog)…');
    // The search is the dialog's first focusable control, so showModal() focuses it (asserted in Playwright).
    expect(element.querySelector('dialog input, dialog button, dialog select')).toBe(query('provider-catalog-search'));
    expect(element.textContent).toContain('Available in catalog (3 unconfigured)');
    expect(rows()).toEqual(['openrouter', 'github-copilot', 'ollama']);
    expect(element.querySelector('[data-provider="ollama"]')?.getAttribute('title')).toContain('Ollama — Local server');
    expect(element.querySelector('[data-provider="ollama"]')?.textContent).toContain('Local server · Run open-source models locally via Ollama · Default models available');
    expect(query('provider-catalog-custom')?.textContent).toContain('Custom endpoint gateway');
  });

  it('uses the modal shell: the search header stays fixed, the list is in the one scroll body, no footer, no negative-margin chrome (B3.1)', () => {
    const part = (name: string) => element.querySelector<HTMLElement>(`[data-ptah-modal-part="${name}"]`);
    expect(element.querySelector('.modal-box')?.className).toContain('max-h-[var(--ptah-modal-max-h)]');
    expect(part('header')?.contains(query('provider-catalog-search'))).toBe(true);
    expect(part('header')?.classList.contains('shrink-0')).toBe(true);
    expect(part('body')?.classList.contains('overflow-y-auto')).toBe(true);
    expect(part('body')?.contains(query('provider-catalog-body'))).toBe(true);
    expect(part('body')?.contains(query('provider-catalog-custom'))).toBe(true);
    // The shell body is the only scroll owner: the old inner `max-h-[50vh] overflow-y-auto` box is gone.
    expect(query('provider-catalog-body')?.className).not.toMatch(/max-h-|overflow-y-auto/);
    expect(part('footer')?.childNodes.length).toBe(0);
    expect(element.querySelector('.modal-box [class*="-mx-"]')).toBeNull();
    expect(element.querySelector('.modal-box [class*="-mt-6"]')).toBeNull();
  });

  it('search filters by name or id; no match says so and Clear restores the list', () => {
    search('route');
    expect(rows()).toEqual(['openrouter']);
    search('nothing-here');
    expect(rows()).toEqual([]);
    expect(query('provider-catalog-empty')?.textContent).toContain('No matching providers.');
    button('Clear search')?.click(); fixture.detectChanges();
    expect(rows()).toHaveLength(3);
  });

  it('Connect chooses the provider; "Sign in to X" is kept for sign-in and CLI entries only; Configure picks the custom endpoint', () => {
    button('Connect OpenRouter')?.click();
    expect(button('Sign in to OpenRouter')).toBeUndefined();
    button('Sign in to GitHub Copilot')?.click();
    button('Configure a custom endpoint')?.click();
    expect(fixture.componentInstance.events).toEqual(['chosen:openrouter', 'sign-in:github-copilot', 'custom']);
  });

  it('setup that cannot start disables Connect and Configure', () => {
    fixture.componentInstance.canSetUp.set(false); fixture.detectChanges();
    expect(button('Connect OpenRouter')?.disabled).toBe(true);
    expect(button('Configure a custom endpoint')?.disabled).toBe(true);
  });

  it('a failed connections read (incl. custom providers) is said, with Retry, never an empty catalog (Batch 2b)', () => {
    fixture.componentInstance.providers.set([]);
    fixture.componentInstance.status.set('error'); fixture.detectChanges();
    expect(query('provider-catalog-error')?.textContent).toContain('Custom providers could not be loaded. Your saved settings have not changed.');
    expect(query('provider-catalog-error')?.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(query('provider-catalog-empty')).toBeNull();
    button('Retry')?.click();
    expect(fixture.componentInstance.events).toEqual(['retry']);
  });

  it('shows a busy skeleton while the catalog loads', () => {
    fixture.componentInstance.status.set('loading'); fixture.detectChanges();
    expect(query('provider-catalog-loading')?.getAttribute('aria-busy')).toBe('true');
  });

  it('every opening starts from the full catalog', () => {
    search('route');
    fixture.componentInstance.open.set(false); fixture.detectChanges();
    fixture.componentInstance.open.set(true); fixture.detectChanges();
    expect(rows()).toHaveLength(3);
    expect(query<HTMLInputElement>('provider-catalog-search')?.value).toBe('');
  });

  it('every palette control is a 32px `btn-sm` target (WCAG 2.2 AA) with a visible 2px focus outline', () => {
    const controls = Array.from(element.querySelectorAll<HTMLButtonElement>('[data-testid="provider-catalog-body"] button'));
    expect(controls.length).toBeGreaterThan(0);
    for (const node of controls) {
      expect(node.classList.contains('btn-sm')).toBe(true);
      // `ptahButton` hosts get the shared focus ring from ptah-button.css.
      expect(node.hasAttribute('data-ptah-button')).toBe(true);
    }
    expect(query('provider-catalog-search')?.classList.contains('focus-visible:outline-2')).toBe(true);
  });

  it('the header Close button comes after the search and asks the parent to close, the same as Esc', () => {
    const close = query<HTMLButtonElement>('provider-catalog-close');
    expect(close?.getAttribute('aria-label')).toBe('Close');
    expect(close?.querySelector('lucide-angular')?.getAttribute('aria-hidden')).toBe('true');
    const focusables = Array.from(query('provider-catalog-modal')?.querySelectorAll('input, button') ?? []);
    expect(focusables[0]).toBe(query('provider-catalog-search'));
    expect(focusables[focusables.length - 1]).toBe(close);
    close?.click();
    expect(fixture.componentInstance.events).toEqual(['closed']);
  });

  it('Esc (the dialog\'s cancel) and the backdrop only ask the parent to close', () => {
    element.querySelector('dialog')?.dispatchEvent(new Event('cancel'));
    element.querySelector<HTMLButtonElement>('.modal-backdrop button')?.click();
    expect(fixture.componentInstance.events).toEqual(['closed', 'closed']);
  });
});
