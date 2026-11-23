import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  REVIEW_LANE_POOL_MAX,
  type ReviewLaneEntry,
  type ReviewLaneListing,
} from '@ptah-extension/review-contracts';
import { PtahRichSelectComponent, type PtahSelectOption } from '@ptah-extension/ui';
import { ReviewLanePoolComponent } from './review-lane-pool.component';

const LISTING: ReviewLaneListing = {
  lanes: [
    {
      id: 'codex',
      label: 'Codex',
      family: 'openai',
      limitState: 'confirmed-room',
      catalog: { status: 'read', models: ['gpt-a', 'gpt-b'], truncated: false, verifiable: true },
    },
    {
      id: 'claude-code',
      label: 'Claude Code',
      family: 'anthropic',
      limitState: 'at-limit',
      catalog: { status: 'read', models: ['sonnet'], truncated: false, verifiable: true },
    },
  ],
  blockedModels: [],
};

describe('ReviewLanePoolComponent', () => {
  let fixture: ComponentFixture<ReviewLanePoolComponent>;
  let emitted: ReviewLaneEntry[][];
  let announced: string[];

  function render(pool: ReviewLaneEntry[], listing: ReviewLaneListing | null = LISTING): void {
    fixture.componentRef.setInput('pool', pool);
    fixture.componentRef.setInput('listing', listing);
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

  function selects(): PtahRichSelectComponent<unknown>[] {
    return fixture.debugElement
      .queryAll(By.directive(PtahRichSelectComponent))
      .map((debug) => debug.componentInstance as PtahRichSelectComponent<unknown>);
  }

  function addSelect(): PtahRichSelectComponent<unknown> {
    const select = selects().find((s) => s.label() === 'Add lane to pool');
    if (!select) throw new Error('No add control');
    return select;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ReviewLanePoolComponent] });
    fixture = TestBed.createComponent(ReviewLanePoolComponent);
    document.body.appendChild(fixture.nativeElement);
    emitted = [];
    announced = [];
    fixture.componentInstance.poolChanged.subscribe((pool) => emitted.push(pool));
    fixture.componentInstance.announced.subscribe((text) => announced.push(text));
  });

  afterEach(() => fixture.nativeElement.remove());

  it('lists entries in order with family, limit state and accessible names', () => {
    render([
      { lane: 'codex', model: null },
      { lane: 'claude-code', model: 'sonnet' },
    ]);
    const list = el().querySelector('ol');
    expect(list?.getAttribute('aria-label')).toBe('Review lane pool, in order of use');
    const rows = el().querySelectorAll('li');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Codex');
    expect(rows[0].querySelector('[ptahBadge]')?.textContent?.trim()).toBe('openai');
    expect(rows[1].querySelector('ptah-status')?.textContent).toContain('At limit');
    expect(rows[1].classList.contains('bg-warning/10')).toBe(true);
    expect(rows[1].textContent).toContain('At its usage limit. Reviews skip it and say so.');
    expect(button('Move Codex up, position 1 of 2').disabled).toBe(true);
    expect(button('Move Claude Code down, position 2 of 2').disabled).toBe(true);
    expect(button('Remove Codex, position 1 of 2').disabled).toBe(false);
    expect(selects().map((s) => s.label())).toEqual([
      'Model for Codex, position 1',
      'Model for Claude Code, position 2',
      'Add lane to pool',
    ]);
  });

  it('offers Lane default and the catalog models for a row', () => {
    render([{ lane: 'codex', model: null }]);
    const options = selects()[0].options() as readonly PtahSelectOption<string>[];
    expect(options.map((o) => o.label)).toEqual(['Lane default', 'gpt-a', 'gpt-b']);
    selects()[0].choose(options[2]);
    expect(emitted).toEqual([[{ lane: 'codex', model: 'gpt-b' }]]);
  });

  it('keeps an unavailable entry with its raw id and reason', () => {
    render([{ lane: 'ptah-cli:gone', model: 'x' }]);
    const row = el().querySelector('li');
    expect(row?.textContent).toContain('ptah-cli:gone');
    expect(row?.textContent).toContain('Unavailable');
    expect(row?.textContent).toContain('Lane not listed.');
  });

  it('shows Status unknown and disables Add without a listing; move and remove still work', () => {
    render([{ lane: 'codex', model: null }, { lane: 'claude-code', model: null }], null);
    expect(el().querySelectorAll('ptah-status')[0].textContent).toContain('Status unknown');
    expect(addSelect().isDisabled()).toBe(true);
    button('Move codex down, position 1 of 2').click();
    expect(emitted).toEqual([[{ lane: 'claude-code', model: null }, { lane: 'codex', model: null }]]);
  });

  it('moves up, emits the exact pool, announces, and moves focus off a button that becomes disabled', () => {
    render([
      { lane: 'codex', model: null },
      { lane: 'claude-code', model: 'sonnet' },
    ]);
    const up = button('Move Claude Code up, position 2 of 2');
    up.focus();
    up.click();
    expect(emitted).toEqual([[{ lane: 'claude-code', model: 'sonnet' }, { lane: 'codex', model: null }]]);
    expect(announced).toEqual(['Claude Code moved up to position 1 of 2']);
    render(emitted[0]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Claude Code down, position 1 of 2');
  });

  it('keeps focus on the same move button when the row does not reach an edge', () => {
    render([
      { lane: 'codex', model: null },
      { lane: 'codex', model: 'gpt-a' },
      { lane: 'codex', model: 'gpt-b' },
    ]);
    button('Move Codex up, position 3 of 3').click();
    render(emitted[0]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Codex up, position 2 of 3');
  });

  it('moves focus to the previous Remove after removing the last row, then to Add when empty', () => {
    render([
      { lane: 'codex', model: null },
      { lane: 'claude-code', model: null },
    ]);
    button('Remove Claude Code, position 2 of 2').click();
    expect(emitted[0]).toEqual([{ lane: 'codex', model: null }]);
    expect(announced[0]).toBe('Claude Code removed. 1 in pool');
    render(emitted[0]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove Codex, position 1 of 1');
    button('Remove Codex, position 1 of 1').click();
    render(emitted[1]);
    expect(emitted[1]).toEqual([]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Add lane to pool');
  });

  it('appends a chosen lane with the lane default model and resets the Add control', () => {
    render([{ lane: 'codex', model: null }]);
    const add = addSelect();
    const options = add.options() as readonly PtahSelectOption<string>[];
    expect(options.map((o) => o.description)).toEqual(['openai · room available', 'anthropic · at limit']);
    add.choose(options[0]);
    expect(emitted).toEqual([[{ lane: 'codex', model: null }, { lane: 'codex', model: null }]]);
    expect(announced).toEqual(['Codex added at position 2']);
    expect(add.value()).toBeNull();
  });

  it('disables Add when the pool is full', () => {
    const full = Array.from({ length: REVIEW_LANE_POOL_MAX }, (_, i) => ({ lane: 'codex', model: `m-${i}` }));
    render(full);
    expect(addSelect().isDisabled()).toBe(true);
    expect(addSelect().placeholder()).toBe('Pool is full');
    expect(el().textContent).toContain('The pool holds up to 12 entries.');
  });

  it('marks repeated entries only when duplicates are shown', () => {
    const pool = [
      { lane: 'codex', model: null },
      { lane: 'codex', model: null },
    ];
    render(pool);
    expect(el().querySelector('[role="alert"]')).toBeNull();
    fixture.componentRef.setInput('showDuplicates', true);
    fixture.detectChanges();
    const alerts = el().querySelectorAll('[role="alert"]');
    expect(alerts.length).toBe(1);
    expect(el().querySelectorAll('li')[1].textContent).toContain('Already in the pool with this model.');
  });
});
