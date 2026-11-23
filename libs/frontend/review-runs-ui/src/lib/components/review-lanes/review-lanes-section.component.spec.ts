import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ReviewLaneListing, ReviewLaneSettings } from '@ptah-extension/review-contracts';
import { ReviewLanesSectionComponent } from './review-lanes-section.component';

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
  blockedModels: [],
};

const FAILED_LISTING: ReviewLaneListing = {
  lanes: [{ ...LISTING.lanes[0], catalog: { status: 'failed', models: [], truncated: false, verifiable: false } }],
  blockedModels: [],
};

describe('ReviewLanesSectionComponent', () => {
  let fixture: ComponentFixture<ReviewLanesSectionComponent>;
  let emitted: ReviewLaneSettings[];
  let retries: number;

  function render(inputs: Partial<{
    lanes: ReviewLaneSettings;
    listing: ReviewLaneListing | null;
    listState: 'idle' | 'loading' | 'ready' | 'error';
    saving: boolean;
    saveError: string | null;
  }>): void {
    fixture.componentRef.setInput('lanes', inputs.lanes ?? { pool: [], pins: {} });
    fixture.componentRef.setInput('listing', inputs.listing === undefined ? LISTING : inputs.listing);
    fixture.componentRef.setInput('listState', inputs.listState ?? 'ready');
    fixture.componentRef.setInput('saving', inputs.saving ?? false);
    fixture.componentRef.setInput('saveError', inputs.saveError ?? null);
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function button(name: string): HTMLButtonElement {
    const found = el().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    if (!found) throw new Error(`No button named ${name}`);
    return found;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ReviewLanesSectionComponent] });
    fixture = TestBed.createComponent(ReviewLanesSectionComponent);
    emitted = [];
    retries = 0;
    fixture.componentInstance.lanesChanged.subscribe((lanes) => emitted.push(lanes));
    fixture.componentInstance.retry.subscribe(() => (retries += 1));
  });

  it('names the section by its heading and shows the empty note', () => {
    render({});
    const section = el().querySelector('section');
    expect(section?.getAttribute('aria-labelledby')).toBe('review-lanes-h');
    expect(el().querySelector('#review-lanes-h')?.textContent).toBe('Review lanes');
    expect(el().textContent).toContain('No lanes chosen. Reviews follow the global agent order.');
    expect(el().querySelectorAll('[role="group"]').length).toBe(6);
  });

  it('opens the info popover from the About button', () => {
    render({});
    const info = button('About review lanes');
    expect(info.getAttribute('aria-expanded')).toBe('false');
    info.click();
    fixture.detectChanges();
    expect(info.getAttribute('aria-expanded')).toBe('true');
  });

  it('emits the whole settings when the pool changes, keeping the pins', () => {
    const lanes: ReviewLaneSettings = {
      pool: [
        { lane: 'codex', model: null },
        { lane: 'codex', model: 'gpt-a' },
      ],
      pins: { verifier: { lane: 'codex', model: null } },
    };
    render({ lanes });
    button('Remove Codex, position 1 of 2').click();
    expect(emitted).toEqual([{ pool: [{ lane: 'codex', model: 'gpt-a' }], pins: lanes.pins }]);
    fixture.detectChanges();
    expect(el().querySelector('[role="status"][aria-live="polite"]')?.textContent).toBe('Codex removed. 1 in pool');
    expect(el().textContent).not.toContain('No lanes chosen.');
  });

  it('shows the lane-list error with Retry and Status unknown on saved entries', () => {
    render({ lanes: { pool: [{ lane: 'codex', model: null }], pins: {} }, listState: 'error' });
    const alert = el().querySelector('ptah-alert [role="alert"]');
    expect(alert?.textContent).toContain('Lanes could not be read. Saved entries are shown as they are.');
    const retry = [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry');
    retry?.click();
    expect(retries).toBe(1);
    expect(el().querySelector('li')?.textContent).toContain('Status unknown');
  });

  it('shows the model-list note only when every lane read failed', () => {
    render({ listing: FAILED_LISTING });
    expect(el().textContent).toContain('Model list unreadable. Saved models are kept and sent as they are.');
    render({ listing: LISTING });
    expect(el().textContent).not.toContain('Model list unreadable.');
  });

  it('shows a loading status while the lanes load', () => {
    render({ listState: 'loading', listing: null });
    expect(el().querySelector('[role="status"][aria-label="Loading review lanes"] ptah-skeleton')).not.toBeNull();
    expect(el().querySelector('ol')).toBeNull();
  });

  it('disables the section while saving', () => {
    render({ saving: true });
    expect(el().querySelector('fieldset')?.disabled).toBe(true);
  });

  it('shows the save error line and the duplicate row error', () => {
    const message = 'Review lanes were not saved: the pool has a duplicate entry. Remove it and save again.';
    render({
      lanes: { pool: [{ lane: 'codex', model: null }, { lane: 'codex', model: null }], pins: {} },
      saveError: message,
    });
    const alerts = [...el().querySelectorAll('[role="alert"]')].map((a) => a.textContent?.trim());
    expect(alerts).toEqual(['Already in the pool with this model.', message]);
  });
});
