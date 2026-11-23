import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  COMPOSER_EFFORT_OPTIONS,
  ComposerEffortPickerComponent,
  type ComposerEffortOption,
} from './composer-effort-picker.component';

// Opening ptah-native-dropdown runs a Floating UI pass that has to settle in
// jsdom. Same mock as model-selector.component.spec.ts.
jest.mock('@floating-ui/dom', () => {
  const actual = jest.requireActual('@floating-ui/dom');
  return {
    ...actual,
    computePosition: jest.fn().mockResolvedValue({ x: 0, y: 0 }),
    autoUpdate: jest.fn().mockReturnValue(() => undefined),
  };
});

async function render(
  inputs: Record<string, unknown>,
): Promise<ComponentFixture<ComposerEffortPickerComponent>> {
  const fixture = TestBed.createComponent(ComposerEffortPickerComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function root(fixture: ComponentFixture<ComposerEffortPickerComponent>) {
  return fixture.nativeElement as HTMLElement;
}

function pill(
  fixture: ComponentFixture<ComposerEffortPickerComponent>,
): HTMLButtonElement {
  return root(fixture).querySelector(
    '[data-testid="composer-effort-pill"]',
  ) as HTMLButtonElement;
}

async function open(
  fixture: ComponentFixture<ComposerEffortPickerComponent>,
): Promise<void> {
  pill(fixture).click();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function rows(fixture: ComponentFixture<ComposerEffortPickerComponent>) {
  return Array.from(
    root(fixture).querySelectorAll('ptah-native-option'),
  ) as HTMLElement[];
}

function filledBars(
  fixture: ComponentFixture<ComposerEffortPickerComponent>,
): number {
  return Array.from(pill(fixture).querySelectorAll<HTMLElement>('div')).filter(
    (div) =>
      div.className.includes('rounded-[1px]') &&
      !div.className.includes('bg-base-content/20'),
  ).length;
}

describe('ComposerEffortPickerComponent pill', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the selected level, its bars and main chat title', async () => {
    const fixture = await render({ selectedId: 'high' });
    const trigger = pill(fixture);

    expect(trigger.hasAttribute('trigger')).toBe(true);
    expect(trigger.textContent).toContain('High');
    expect(trigger.getAttribute('title')).toBe('Reasoning effort: High');
    expect(trigger.getAttribute('aria-label')).toBe(
      'Select reasoning effort level',
    );
    expect(trigger.getAttribute('aria-disabled')).toBeNull();
    expect(filledBars(fixture)).toBe(3);
    // Main chat's current pill focus look (batch-4-report decision).
    expect(trigger.classList.contains('focus-visible:ring-1')).toBe(true);
  });

  it('falls back to the first level for an unset or unknown id', async () => {
    const fixture = await render({ selectedId: null });
    expect(pill(fixture).textContent).toContain('Default');
    expect(filledBars(fixture)).toBe(0);
  });

  it('animates only the fill color on the pill bars', async () => {
    const fixture = await render({ selectedId: 'medium' });
    const bars = Array.from(
      pill(fixture).querySelectorAll<HTMLElement>('div'),
    ).filter((div) => div.className.includes('rounded-[1px]'));
    expect(bars).toHaveLength(5);
    for (const bar of bars) {
      expect(bar.className).toContain('transition-colors');
      expect(bar.className).not.toContain('transition-all');
    }
  });

  it('shows the pending dot only while a change waits for confirmation', async () => {
    const fixture = await render({ selectedId: 'low' });
    const dot = () =>
      root(fixture).querySelector(
        '[data-testid="composer-effort-pending-dot"]',
      );
    expect(dot()).toBeNull();
    fixture.componentRef.setInput('pending', true);
    fixture.detectChanges();
    expect(dot()?.classList.contains('bg-primary')).toBe(true);
  });
});

describe('ComposerEffortPickerComponent menu', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lists the given levels, marks the selected one and emits the choice', async () => {
    const lane: readonly ComposerEffortOption[] =
      COMPOSER_EFFORT_OPTIONS.filter(
        (o) => o.value === 'low' || o.value === 'high',
      );
    const fixture = await render({ options: lane, selectedId: 'high' });
    const selected: ComposerEffortOption[] = [];
    fixture.componentInstance.selected.subscribe((o) => selected.push(o));

    await open(fixture);
    expect(pill(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(rows(fixture)).toHaveLength(2);
    expect(rows(fixture)[1].querySelector('lucide-angular')).not.toBeNull();

    fixture.componentInstance.choose(lane[0]);
    fixture.detectChanges();

    expect(selected.map((o) => o.value)).toEqual(['low']);
    expect(fixture.componentInstance.isOpen()).toBe(false);
  });

  it('renders the footer line only when one is given', async () => {
    const fixture = await render({ footer: 'Applies to this tab.' });
    await open(fixture);
    expect(
      root(fixture).querySelector('[data-testid="composer-effort-footer"]')
        ?.textContent,
    ).toContain('Applies to this tab.');

    fixture.componentRef.setInput('footer', null);
    fixture.detectChanges();
    expect(
      root(fixture).querySelector('[data-testid="composer-effort-footer"]'),
    ).toBeNull();
  });

  it('keeps option ids unique across instances', async () => {
    const first = await render({});
    const second = TestBed.createComponent(ComposerEffortPickerComponent);
    second.detectChanges();
    await open(first);
    await open(second);

    const ids = Array.from(
      document.querySelectorAll('[id^="effort-"]'),
      (element) => element.id,
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ComposerEffortPickerComponent gated', () => {
  afterEach(() => TestBed.resetTestingModule());

  const reason = 'Copilot takes no reasoning effort.';

  it('stays focusable with the reason as title and description', async () => {
    const fixture = await render({
      selectedId: 'high',
      disabledReason: reason,
    });
    const trigger = pill(fixture);

    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBeNull();
    expect(trigger.getAttribute('title')).toBe(reason);
    expect(trigger.classList.contains('border-dashed')).toBe(true);
    expect(
      root(fixture).querySelector(
        `#${trigger.getAttribute('aria-describedby')}`,
      )?.textContent,
    ).toBe(reason);
  });

  it('reveals the reason on click and never opens the menu', async () => {
    const fixture = await render({ disabledReason: reason });
    const revealed: string[] = [];
    let cleared = 0;
    fixture.componentInstance.reasonRevealed.subscribe((r) => revealed.push(r));
    fixture.componentInstance.reasonCleared.subscribe(() => cleared++);

    await open(fixture);
    pill(fixture).dispatchEvent(new FocusEvent('blur'));

    expect(revealed).toEqual([reason]);
    expect(cleared).toBe(1);
    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(rows(fixture)).toHaveLength(0);
  });
});
