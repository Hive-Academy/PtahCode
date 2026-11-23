import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  ComposerModelPickerComponent,
  type ComposerModelOption,
} from './composer-model-picker.component';

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

interface PickerInputs {
  options?: readonly ComposerModelOption[];
  selectedId?: string | null;
  loading?: boolean;
  loaded?: boolean;
  pending?: boolean;
  footer?: string | null;
  disabledReason?: string | null;
}

function option(
  id: string,
  extra: Partial<ComposerModelOption> = {},
): ComposerModelOption {
  return { id, name: `Name ${id}`, description: `About ${id}`, ...extra };
}

async function render(
  inputs: PickerInputs,
): Promise<ComponentFixture<ComposerModelPickerComponent>> {
  const fixture = TestBed.createComponent(ComposerModelPickerComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function root(fixture: ComponentFixture<ComposerModelPickerComponent>) {
  return fixture.nativeElement as HTMLElement;
}

function pill(
  fixture: ComponentFixture<ComposerModelPickerComponent>,
): HTMLButtonElement {
  return root(fixture).querySelector(
    '[data-testid="composer-model-pill"]',
  ) as HTMLButtonElement;
}

async function open(
  fixture: ComponentFixture<ComposerModelPickerComponent>,
): Promise<void> {
  pill(fixture).click();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function rows(fixture: ComponentFixture<ComposerModelPickerComponent>) {
  return Array.from(
    root(fixture).querySelectorAll('ptah-native-option'),
  ) as HTMLElement[];
}

describe('ComposerModelPickerComponent pill', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('names the listed model and keeps main chat pill classes', async () => {
    const fixture = await render({
      options: [option('default'), option('opus')],
      selectedId: 'opus',
    });
    const trigger = pill(fixture);

    expect(trigger.hasAttribute('trigger')).toBe(true);
    expect(trigger.textContent).toContain('Name opus');
    expect(trigger.getAttribute('aria-label')).toBe('Select model');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-disabled')).toBeNull();
    expect(trigger.classList.contains('h-7')).toBe(true);
    expect(trigger.classList.contains('rounded-full')).toBe(true);
    // Main chat's current pill focus look (batch-4-report decision).
    expect(trigger.classList.contains('focus-visible:ring-1')).toBe(true);
  });

  it('shows an unlisted id as it is', async () => {
    const fixture = await render({
      options: [option('default')],
      selectedId: 'claude-old-1',
    });
    expect(pill(fixture).textContent).toContain('claude-old-1');
  });

  it('shows the provider model of a tier override as the label', async () => {
    const fixture = await render({
      options: [option('sonnet', { providerModelId: 'openai/gpt-5.1' })],
      selectedId: 'sonnet',
    });
    expect(fixture.componentInstance.providerHint()).toBe('openai/gpt-5.1');
    expect(pill(fixture).textContent).toContain('openai/gpt-5.1');
  });

  it('disables the pill and shows a spinner while the catalog loads', async () => {
    const fixture = await render({ options: [], loading: true, loaded: false });
    expect(pill(fixture).disabled).toBe(true);
    expect(pill(fixture).querySelector('.loading-spinner')).not.toBeNull();
  });

  it('shows the pending dot only while a change waits for confirmation', async () => {
    const fixture = await render({ options: [option('a')], selectedId: 'a' });
    const dot = () =>
      root(fixture).querySelector('[data-testid="composer-model-pending-dot"]');
    expect(dot()).toBeNull();

    fixture.componentRef.setInput('pending', true);
    fixture.detectChanges();
    expect(dot()).not.toBeNull();
    expect(dot()?.getAttribute('aria-hidden')).toBe('true');
    expect(dot()?.classList.contains('bg-primary')).toBe(true);
  });
});

describe('ComposerModelPickerComponent menu', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('emits opened, marks the selected row and emits the chosen id', async () => {
    const fixture = await render({
      options: [option('default'), option('opus')],
      selectedId: 'default',
    });
    const opened = jest.fn();
    const selected: string[] = [];
    fixture.componentInstance.opened.subscribe(opened);
    fixture.componentInstance.selected.subscribe((id) => selected.push(id));

    await open(fixture);

    expect(opened).toHaveBeenCalledTimes(1);
    expect(pill(fixture).getAttribute('aria-expanded')).toBe('true');
    expect(rows(fixture)).toHaveLength(2);
    expect(
      fixture.componentInstance
        .rows()
        .filter((row) => row.isSelected)
        .map((row) => row.id),
    ).toEqual(['default']);

    fixture.componentInstance.choose('opus');
    fixture.detectChanges();

    expect(selected).toEqual(['opus']);
    expect(fixture.componentInstance.isOpen()).toBe(false);
  });

  it('renders the footer line only when one is given', async () => {
    const withFooter = await render({
      options: [option('a')],
      footer: 'Applies from your next message. The lane keeps running.',
    });
    await open(withFooter);
    expect(
      root(withFooter).querySelector('[data-testid="composer-model-footer"]')
        ?.textContent,
    ).toContain('Applies from your next message.');
    TestBed.resetTestingModule();

    const without = await render({ options: [option('a')] });
    await open(without);
    expect(
      root(without).querySelector('[data-testid="composer-model-footer"]'),
    ).toBeNull();
  });

  it('says so when a finished read returned no models', async () => {
    const fixture = await render({ options: [], loaded: true });
    await open(fixture);
    expect(root(fixture).textContent).toContain('No models available.');
  });
});

describe('ComposerModelPickerComponent other versions', () => {
  afterEach(() => TestBed.resetTestingModule());

  const catalog = [
    option('default'),
    option('opus-4-5', { group: 'other' }),
    option('sonnet'),
    option('sonnet-4-5', { group: 'other' }),
  ];

  it('splits rows into primary and other keeping list order', async () => {
    const fixture = await render({ options: catalog });
    const picker = fixture.componentInstance;
    expect(picker.primaryModels().map((row) => row.id)).toEqual([
      'default',
      'sonnet',
    ]);
    expect(picker.otherModels().map((row) => row.id)).toEqual([
      'opus-4-5',
      'sonnet-4-5',
    ]);
  });

  it('defaults the section to closed, open when the selected model is other-group', async () => {
    const primary = await render({ options: catalog, selectedId: 'default' });
    expect(primary.componentInstance.isOtherSectionOpen()).toBe(false);
    TestBed.resetTestingModule();

    const other = await render({ options: catalog, selectedId: 'opus-4-5' });
    expect(other.componentInstance.isOtherSectionOpen()).toBe(true);
  });

  it('toggles the section without selecting a model', async () => {
    const fixture = await render({ options: catalog, selectedId: 'default' });
    const picker = fixture.componentInstance;
    const selected = jest.fn();
    picker.selected.subscribe(selected);

    picker.toggleOtherVersions();
    expect(picker.isOtherSectionOpen()).toBe(true);
    picker.toggleOtherVersions();
    expect(picker.isOtherSectionOpen()).toBe(false);
    expect(selected).not.toHaveBeenCalled();
  });

  it('resets an explicit section choice when the menu reopens', async () => {
    const fixture = await render({ options: catalog, selectedId: 'opus-4-5' });
    const picker = fixture.componentInstance;

    expect(picker.isOtherSectionOpen()).toBe(true);
    picker.toggleOtherVersions();
    expect(picker.isOtherSectionOpen()).toBe(false);

    picker.toggle();
    expect(picker.isOtherSectionOpen()).toBe(true);
  });
});

describe('ComposerModelPickerComponent gated', () => {
  afterEach(() => TestBed.resetTestingModule());

  const reason = 'Antigravity sets the model when the lane starts.';

  it('stays focusable, carries the reason and swaps the chevron for the info glyph', async () => {
    const fixture = await render({
      options: [option('a')],
      selectedId: 'a',
      disabledReason: reason,
    });
    const trigger = pill(fixture);

    expect(trigger.disabled).toBe(false);
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBeNull();
    expect(trigger.getAttribute('title')).toBe(reason);
    expect(trigger.classList.contains('border-dashed')).toBe(true);
    const described = root(fixture).querySelector(
      `#${trigger.getAttribute('aria-describedby')}`,
    );
    expect(described?.textContent).toBe(reason);
    expect(fixture.componentInstance.gated()).toBe(true);
  });

  it('reveals the reason on click and never opens the menu', async () => {
    const fixture = await render({
      options: [option('a')],
      selectedId: 'a',
      disabledReason: reason,
    });
    const revealed: string[] = [];
    const opened = jest.fn();
    fixture.componentInstance.reasonRevealed.subscribe((r) => revealed.push(r));
    fixture.componentInstance.opened.subscribe(opened);

    await open(fixture);

    expect(revealed).toEqual([reason]);
    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(opened).not.toHaveBeenCalled();
    expect(rows(fixture)).toHaveLength(0);
  });

  it('closes an open menu when a reason arrives', async () => {
    const fixture = await render({ options: [option('a')], selectedId: 'a' });
    await open(fixture);
    expect(rows(fixture)).toHaveLength(1);

    fixture.componentRef.setInput('disabledReason', reason);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(rows(fixture)).toHaveLength(0);
    expect(pill(fixture).getAttribute('aria-disabled')).toBe('true');
  });

  it('stays closed after a gated period ends', async () => {
    const fixture = await render({ options: [option('a')], selectedId: 'a' });
    await open(fixture);
    expect(rows(fixture)).toHaveLength(1);

    fixture.componentRef.setInput('disabledReason', reason);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentRef.setInput('disabledReason', null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(rows(fixture)).toHaveLength(0);
    expect(pill(fixture).getAttribute('aria-expanded')).toBe('false');
  });

  it('clears a shown reason when the gate lifts under focus', async () => {
    const fixture = await render({ ...{ options: [option('a')], selectedId: 'a' }, disabledReason: reason });
    const revealed: string[] = [];
    let cleared = 0;
    fixture.componentInstance.reasonRevealed.subscribe((r) => revealed.push(r));
    fixture.componentInstance.reasonCleared.subscribe(() => cleared++);

    pill(fixture).dispatchEvent(new FocusEvent('focus'));
    expect(revealed).toEqual([reason]);

    // The gated pill is swapped out: its blur never fires.
    fixture.componentRef.setInput('disabledReason', null);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(cleared).toBe(1);
    expect(pill(fixture).getAttribute('aria-disabled')).toBeNull();
  });

  it('sends no clear when the gate lifts with no reason shown', async () => {
    const fixture = await render({ ...{ options: [option('a')], selectedId: 'a' }, disabledReason: reason });
    let cleared = 0;
    fixture.componentInstance.reasonCleared.subscribe(() => cleared++);

    fixture.componentRef.setInput('disabledReason', null);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(cleared).toBe(0);
  });
});
