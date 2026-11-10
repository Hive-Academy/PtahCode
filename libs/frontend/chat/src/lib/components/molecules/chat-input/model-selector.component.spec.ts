import { signal, type Signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ModelStateService } from '@ptah-extension/core';
import { TabId, TabManagerService } from '@ptah-extension/chat-state';
import { KeyboardNavigationService } from '@ptah-extension/ui';
import { ChatStore } from '../../../services/chat.store';
import { SESSION_CONTEXT } from '../../../tokens/session-context.token';
import { ModelSelectorComponent } from './model-selector.component';

// The rendered suites open ptah-native-dropdown, whose Floating UI pass has
// to settle inside jsdom. Same mock as peer-session-picker.component.spec.ts.
jest.mock('@floating-ui/dom', () => {
  const actual = jest.requireActual('@floating-ui/dom');
  return {
    ...actual,
    computePosition: jest.fn().mockResolvedValue({ x: 0, y: 0 }),
    autoUpdate: jest.fn().mockReturnValue(() => undefined),
  };
});

interface ModelTabStub {
  readonly id: TabId;
  readonly overrideModel?: string | null;
  readonly sessionModel?: string | null;
}

interface HarnessOptions {
  tabs: ModelTabStub[];
  activeTabId?: TabId | null;
  sessionContext?: Signal<TabId | null> | null;
  currentModel?: string;
  availableIds?: string[];
  /** IDs of rows the catalog pins into the "Other versions" group. */
  otherIds?: string[];
  selectedId?: string;
}

/** Service stubs shared by the direct-instantiation and rendered harnesses. */
function buildHarnessStubs(options: HarnessOptions) {
  const currentModel = signal(options.currentModel ?? 'default');
  const tabs = signal(options.tabs);
  const activeTabId = signal(options.activeTabId ?? null);
  const activeTab = () =>
    tabs().find((tab) => tab.id === activeTabId()) ?? null;

  const otherIds = new Set(options.otherIds ?? []);
  const modelState = {
    currentModel: currentModel.asReadonly(),
    availableModels: signal(
      (options.availableIds ?? []).map((id) => ({
        id,
        name: id,
        description: id,
        providerModelId: null as string | null,
        isSelected: id === options.selectedId,
        ...(otherIds.has(id) ? { group: 'other' as const } : {}),
      })),
    ).asReadonly(),
    isPending: signal(false).asReadonly(),
    isLoaded: signal(true).asReadonly(),
    switchModel: jest.fn().mockResolvedValue(undefined),
    refreshModels: jest.fn().mockResolvedValue(undefined),
  };
  const tabManager = {
    tabs: tabs.asReadonly(),
    activeTab,
    setOverrideModel: jest.fn(),
  };
  const keyboardNavigation = {
    activeIndex: signal(0).asReadonly(),
    setActiveIndex: jest.fn(),
  };
  const chatStore = {
    currentSessionId: signal(null).asReadonly(),
  };

  return {
    currentModel,
    modelState,
    tabManager,
    keyboardNavigation,
    chatStore,
  };
}

function configureTestBed(
  options: HarnessOptions,
  stubs: ReturnType<typeof buildHarnessStubs>,
  render: boolean,
): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    ...(render ? { imports: [ModelSelectorComponent] } : {}),
    providers: [
      {
        provide: ModelStateService,
        useValue: stubs.modelState as unknown as ModelStateService,
      },
      {
        provide: TabManagerService,
        useValue: stubs.tabManager as unknown as TabManagerService,
      },
      {
        provide: KeyboardNavigationService,
        useValue:
          stubs.keyboardNavigation as unknown as KeyboardNavigationService,
      },
      {
        provide: ChatStore,
        useValue: stubs.chatStore as unknown as ChatStore,
      },
      { provide: SESSION_CONTEXT, useValue: options.sessionContext ?? null },
    ],
  });
}

function makeHarness(options: HarnessOptions) {
  const stubs = buildHarnessStubs(options);
  configureTestBed(options, stubs, false);
  const component = TestBed.runInInjectionContext(
    () => new ModelSelectorComponent(),
  );
  return { component, stubs };
}

/** Renders the component and returns a settled fixture. */
async function renderHarness(options: HarnessOptions) {
  const stubs = buildHarnessStubs(options);
  configureTestBed(options, stubs, true);
  const fixture = TestBed.createComponent(ModelSelectorComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { component: fixture.componentInstance, stubs, fixture };
}

function root(fixture: ComponentFixture<ModelSelectorComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

/** Opens the dropdown the way a user does: a trigger click, then settle. */
async function openDropdown(
  fixture: ComponentFixture<ModelSelectorComponent>,
): Promise<void> {
  triggerButton(fixture).click();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
}

function triggerButton(
  fixture: ComponentFixture<ModelSelectorComponent>,
): HTMLButtonElement {
  return root(fixture).querySelector('[trigger]') as HTMLButtonElement;
}

function optionRows(
  fixture: ComponentFixture<ModelSelectorComponent>,
): HTMLElement[] {
  return Array.from(
    root(fixture).querySelectorAll('ptah-native-option'),
  ) as HTMLElement[];
}

function otherVersionsToggle(
  fixture: ComponentFixture<ModelSelectorComponent>,
): HTMLButtonElement {
  return root(fixture).querySelector(
    '[id^="model-other-versions-toggle-"]',
  ) as HTMLButtonElement;
}

describe('ModelSelectorComponent.effectiveModel', () => {
  it('keeps a resumed main-panel tab sessionModel after a global models-list refresh selects default', () => {
    const activeTabId = TabId.create();
    const { component, stubs } = makeHarness({
      tabs: [{ id: activeTabId, sessionModel: 'claude-fable-5-1[1m]' }],
      activeTabId,
      currentModel: 'claude-fable-5-1[1m]',
    });

    expect(component.effectiveModel()).toBe('claude-fable-5-1[1m]');

    stubs.currentModel.set('default');

    expect(component.effectiveModel()).toBe('claude-fable-5-1[1m]');
  });

  it("keeps a canvas tile's overrideModel as the highest priority", () => {
    const activeTabId = TabId.create();
    const canvasTabId = TabId.create();
    const { component } = makeHarness({
      tabs: [
        { id: activeTabId, sessionModel: 'active-session-model' },
        {
          id: canvasTabId,
          overrideModel: 'canvas-override-model',
          sessionModel: 'canvas-session-model',
        },
      ],
      activeTabId,
      sessionContext: signal(canvasTabId),
      currentModel: 'default',
    });

    expect(component.effectiveModel()).toBe('canvas-override-model');
  });

  it('falls back to the global default for a fresh tab with no model fields', () => {
    const activeTabId = TabId.create();
    const { component } = makeHarness({
      tabs: [{ id: activeTabId }],
      activeTabId,
      currentModel: 'default',
    });

    expect(component.effectiveModel()).toBe('default');
  });

  it('drops an override the reloaded list no longer offers (provider switch)', () => {
    const activeTabId = TabId.create();
    const { component } = makeHarness({
      tabs: [{ id: activeTabId, overrideModel: 'gpt-5.6-luna' }],
      activeTabId,
      currentModel: 'default',
      availableIds: ['default', 'opus', 'sonnet', 'haiku'],
    });

    expect(component.effectiveModel()).toBe('default');
  });

  it('falls back like the send path, not to sessionModel, when the override is not offered', () => {
    const activeTabId = TabId.create();
    const { component } = makeHarness({
      tabs: [
        {
          id: activeTabId,
          overrideModel: 'gpt-5.6-luna',
          sessionModel: 'gpt-5.6-luna',
        },
      ],
      activeTabId,
      currentModel: 'haiku',
      availableIds: ['default', 'opus', 'haiku'],
      selectedId: 'haiku',
    });

    expect(component.effectiveModel()).toBe('haiku');
  });

  it('falls back to the first offered model when none is selected and there is no default', () => {
    const activeTabId = TabId.create();
    const { component } = makeHarness({
      tabs: [{ id: activeTabId, overrideModel: 'gone', sessionModel: 'gone' }],
      activeTabId,
      currentModel: 'gone',
      availableIds: ['opus', 'haiku'],
    });

    expect(component.effectiveModel()).toBe('opus');
  });

  it('keeps an override the list still offers', () => {
    const activeTabId = TabId.create();
    const { component } = makeHarness({
      tabs: [{ id: activeTabId, overrideModel: 'haiku' }],
      activeTabId,
      currentModel: 'default',
      availableIds: ['default', 'haiku'],
    });

    expect(component.effectiveModel()).toBe('haiku');
  });
});

describe('ModelSelectorComponent.modelGroups', () => {
  it('splits rows into primaryModels and otherModels keeping list order', () => {
    const { component } = makeHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-5', 'sonnet', 'sonnet-4-5'],
      otherIds: ['opus-4-5', 'sonnet-4-5'],
    });

    expect(component.primaryModels().map((model) => model.id)).toEqual([
      'default',
      'sonnet',
    ]);
    expect(component.otherModels().map((model) => model.id)).toEqual([
      'opus-4-5',
      'sonnet-4-5',
    ]);
  });

  it('defaults the Other versions section to closed, open when the selected model is other-group', () => {
    const primarySelected = makeHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-5'],
      otherIds: ['opus-4-5'],
      currentModel: 'default',
    });
    expect(primarySelected.component.isOtherSectionOpen()).toBe(false);

    const otherSelected = makeHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-5'],
      otherIds: ['opus-4-5'],
      currentModel: 'opus-4-5',
    });
    expect(otherSelected.component.isOtherSectionOpen()).toBe(true);
  });

  it('toggles the section without selecting a model', () => {
    const { component, stubs } = makeHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-5'],
      otherIds: ['opus-4-5'],
      currentModel: 'default',
    });

    component.toggleOtherVersions();
    expect(component.isOtherSectionOpen()).toBe(true);

    component.toggleOtherVersions();
    expect(component.isOtherSectionOpen()).toBe(false);

    expect(stubs.modelState.switchModel).not.toHaveBeenCalled();
    expect(stubs.tabManager.setOverrideModel).not.toHaveBeenCalled();
  });

  it('resets an explicit section choice when the dropdown reopens', () => {
    const { component } = makeHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-5'],
      otherIds: ['opus-4-5'],
      currentModel: 'opus-4-5',
    });

    // Default: the selected row stays visible.
    expect(component.isOtherSectionOpen()).toBe(true);

    component.toggleOtherVersions();
    expect(component.isOtherSectionOpen()).toBe(false);

    // Reopening returns to the default instead of the explicit choice.
    component.toggleDropdown();
    expect(component.isOtherSectionOpen()).toBe(true);
  });
});

describe('ModelSelectorComponent dropdown (rendered)', () => {
  it('renders rows without any recommended badge', async () => {
    const { fixture } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'sonnet', 'opus'],
    });
    await openDropdown(fixture);

    expect(optionRows(fixture).length).toBe(3);
    expect(root(fixture).querySelector('.badge')).toBeNull();
    expect(root(fixture).textContent ?? '').not.toContain('Recommended');
  });

  it('renders no Other versions toggle when no model is in the other group', async () => {
    const { fixture } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'sonnet'],
    });
    await openDropdown(fixture);

    expect(otherVersionsToggle(fixture)).toBeNull();
    expect(
      root(fixture).querySelector('[id^="model-other-versions-"]'),
    ).toBeNull();
    expect(optionRows(fixture).length).toBe(2);
  });

  it('keeps the Other versions section closed by default and its rows out of the DOM', async () => {
    const { fixture } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-6', 'opus-4-5', 'opus-4-1'],
      otherIds: ['opus-4-5', 'opus-4-1'],
      currentModel: 'default',
    });
    await openDropdown(fixture);

    const toggle = otherVersionsToggle(fixture);
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(
      root(fixture).querySelector('[id^="model-other-versions-"]:not(button)')
        ?.id,
    );
    expect(toggle.type).toBe('button');
    expect(toggle.textContent).toContain('Other versions');
    expect(toggle.textContent).toContain('2');

    // Only the primary rows render; the pinned rows are absent.
    expect(optionRows(fixture).length).toBe(2);
    expect(root(fixture).textContent ?? '').not.toContain('opus-4-5');
    expect(root(fixture).textContent ?? '').not.toContain('opus-4-1');
  });

  it('shows the other rows on a toggle click without selecting a model or closing', async () => {
    const { fixture, stubs } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-6', 'opus-4-5', 'opus-4-1'],
      otherIds: ['opus-4-5', 'opus-4-1'],
      currentModel: 'default',
    });
    await openDropdown(fixture);

    otherVersionsToggle(fixture).click();
    fixture.detectChanges();

    const toggle = otherVersionsToggle(fixture);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(optionRows(fixture).length).toBe(4);
    expect(
      optionRows(fixture).some((row) =>
        (row.textContent ?? '').includes('opus-4-5'),
      ),
    ).toBe(true);

    // A toggle click is not a model selection, and it keeps the dropdown open.
    expect(stubs.modelState.switchModel).not.toHaveBeenCalled();
    expect(stubs.tabManager.setOverrideModel).not.toHaveBeenCalled();
    expect(root(fixture).querySelector('.dropdown-panel')).not.toBeNull();
  });

  it('starts the section open when the selected model is in the other group', async () => {
    const { fixture } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-6', 'opus-4-5'],
      otherIds: ['opus-4-5'],
      currentModel: 'opus-4-5',
    });
    await openDropdown(fixture);

    const toggle = otherVersionsToggle(fixture);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    // All rows render without a toggle click, the selected row last.
    const rows = optionRows(fixture);
    expect(rows.length).toBe(3);
    expect(rows[2].textContent ?? '').toContain('opus-4-5');
  });

  it('keeps toggle, section, and option ids unique across rendered instances', async () => {
    const { fixture: first } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'opus-4-5'],
      otherIds: ['opus-4-5'],
      currentModel: 'opus-4-5',
    });
    const second = TestBed.createComponent(ModelSelectorComponent);
    second.detectChanges();
    await second.whenStable();
    second.detectChanges();

    await openDropdown(first);
    await openDropdown(second);

    const firstToggle = otherVersionsToggle(first);
    const secondToggle = otherVersionsToggle(second);
    const firstSection = root(first).querySelector(
      '[id^="model-other-versions-"]:not(button)',
    ) as HTMLElement;
    const secondSection = root(second).querySelector(
      '[id^="model-other-versions-"]:not(button)',
    ) as HTMLElement;

    expect(firstToggle.getAttribute('aria-controls')).toBe(firstSection.id);
    expect(secondToggle.getAttribute('aria-controls')).toBe(secondSection.id);
    expect(firstSection.id).not.toBe(secondSection.id);

    const ids = Array.from(
      document.querySelectorAll('[id]'),
      (element) => element.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps rows rendered while refreshModels is pending and after it resolves', async () => {
    const { fixture, stubs } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'sonnet'],
    });
    let resolveRefresh!: () => void;
    const refresh = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    stubs.modelState.refreshModels.mockReturnValue(refresh);

    triggerButton(fixture).click();
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(stubs.modelState.refreshModels).toHaveBeenCalledTimes(1);
    expect(optionRows(fixture).length).toBe(2);

    resolveRefresh();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(optionRows(fixture).length).toBe(2);
  });

  it('keeps rows rendered and handles a rejected refreshModels promise', async () => {
    const { fixture, stubs } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'sonnet'],
    });
    const error = new Error('refresh failed');
    stubs.modelState.refreshModels.mockRejectedValue(error);
    const errorLog = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    try {
      await openDropdown(fixture);
      await Promise.resolve();
      fixture.detectChanges();

      expect(stubs.modelState.refreshModels).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(
        '[ModelSelectorComponent] Failed to refresh models:',
        error,
      );
      expect(optionRows(fixture).length).toBe(2);
    } finally {
      errorLog.mockRestore();
    }
  });

  it('calls refreshModels once when the dropdown opens, and again on a reopen', async () => {
    const { fixture, stubs } = await renderHarness({
      tabs: [],
      availableIds: ['default', 'sonnet'],
    });

    expect(stubs.modelState.refreshModels).not.toHaveBeenCalled();

    await openDropdown(fixture);
    expect(stubs.modelState.refreshModels).toHaveBeenCalledTimes(1);

    // Close on a second trigger click, then reopen: one more refresh.
    triggerButton(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();

    await openDropdown(fixture);
    expect(stubs.modelState.refreshModels).toHaveBeenCalledTimes(2);
  });
});
