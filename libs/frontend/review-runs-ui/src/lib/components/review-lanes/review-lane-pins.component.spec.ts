import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ReviewLaneListing, ReviewLanePins } from '@ptah-extension/review-contracts';
import { PtahRichSelectComponent, type PtahSelectOption } from '@ptah-extension/ui';
import { ReviewLanePinsComponent } from './review-lane-pins.component';

const LISTING: ReviewLaneListing = {
  lanes: [
    {
      id: 'codex',
      label: 'Codex',
      family: 'openai',
      limitState: 'confirmed-room',
      catalog: { status: 'read', models: ['gpt-a'], truncated: false, verifiable: true },
    },
  ],
  blockedModels: ['gpt-blocked'],
};

describe('ReviewLanePinsComponent', () => {
  let fixture: ComponentFixture<ReviewLanePinsComponent>;
  let emitted: ReviewLanePins[];
  let announced: string[];

  function render(pins: ReviewLanePins, listing: ReviewLaneListing | null = LISTING): void {
    fixture.componentRef.setInput('pins', pins);
    fixture.componentRef.setInput('listing', listing);
    fixture.detectChanges();
  }

  function select(label: string): PtahRichSelectComponent<unknown> {
    const found = fixture.debugElement
      .queryAll(By.directive(PtahRichSelectComponent))
      .map((debug) => debug.componentInstance as PtahRichSelectComponent<unknown>)
      .find((s) => s.label() === label);
    if (!found) throw new Error(`No select ${label}`);
    return found;
  }

  function option(label: string, text: string): PtahSelectOption<unknown> {
    const found = select(label).options().find((o) => o.label === text);
    if (!found) throw new Error(`No option ${text}`);
    return found;
  }

  function group(name: string): HTMLElement {
    const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      `[role="group"][aria-label="${name}"]`,
    );
    if (!found) throw new Error(`No group ${name}`);
    return found;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ReviewLanePinsComponent] });
    fixture = TestBed.createComponent(ReviewLanePinsComponent);
    emitted = [];
    announced = [];
    fixture.componentInstance.pinsChanged.subscribe((pins) => emitted.push(pins));
    fixture.componentInstance.announced.subscribe((text) => announced.push(text));
  });

  it('shows six role groups following the pool, with model selects disabled', () => {
    render({});
    const groups = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="group"]')];
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Triage pin',
      'correctness-lifecycle pin',
      'contracts-callers pin',
      'security-privacy pin',
      'host-di-config pin',
      'Verifier pin',
    ]);
    expect(group('security-privacy pin').querySelector('.font-mono')?.textContent).toBe('security-privacy');
    const triageLane = select('Triage lane');
    expect(triageLane.selected()?.label).toBe('Follow the pool');
    expect(select('Triage model').isDisabled()).toBe(true);
    expect(select('Verifier model').isDisabled()).toBe(true);
  });

  it('pins a lane with the lane default model and announces it', () => {
    render({});
    select('Verifier lane').choose(option('Verifier lane', 'Codex'));
    expect(emitted).toEqual([{ verifier: { lane: 'codex', model: null } }]);
    expect(announced).toEqual(['Verifier pinned to Codex']);
  });

  it('sets the pin model from the catalog, without blocked models', () => {
    render({ triage: { lane: 'codex', model: null } });
    expect(select('Triage model').isDisabled()).toBe(false);
    expect(select('Triage model').options().map((o) => o.label)).toEqual(['Lane default', 'gpt-a']);
    select('Triage model').choose(option('Triage model', 'gpt-a'));
    expect(emitted).toEqual([{ triage: { lane: 'codex', model: 'gpt-a' } }]);
  });

  it('clears a pin with Follow the pool and keeps the other pins', () => {
    const pins: ReviewLanePins = {
      triage: { lane: 'codex', model: 'gpt-a' },
      'host-di-config': { lane: 'codex', model: null },
    };
    render(pins);
    select('Triage lane').choose(option('Triage lane', 'Follow the pool'));
    expect(emitted).toEqual([{ 'host-di-config': { lane: 'codex', model: null } }]);
    expect(announced).toEqual(['Triage pin cleared']);
    expect(pins.triage).toEqual({ lane: 'codex', model: 'gpt-a' });
  });

  it('keeps a pin to a missing lane as unavailable with the pin reason', () => {
    render({ 'contracts-callers': { lane: 'ptah-cli:gone', model: null } });
    expect(select('contracts-callers lane').selected()?.label).toBe('ptah-cli:gone (unavailable)');
    const row = group('contracts-callers pin');
    expect(row.classList.contains('bg-warning/10')).toBe(true);
    expect(row.textContent).toContain('Unavailable');
    expect(row.textContent).toContain(
      'Lane not listed. It may be uninstalled or disabled in global settings. Reviews use the pool order and say so.',
    );
  });

  it('shows a blocked pin model as unavailable', () => {
    render({ verifier: { lane: 'codex', model: 'gpt-blocked' } });
    expect(group('Verifier pin').textContent).toContain(
      'Model blocked for review lanes. Reviews use the pool order and say so.',
    );
  });
});
