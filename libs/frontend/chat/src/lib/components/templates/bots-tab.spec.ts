import { CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterOutlet } from '@angular/router';
import { Bot } from 'lucide-angular';
import {
  AppStateManager,
  type ConfigurationSurfaceId,
  ElectronLayoutService,
  SurfaceRouterService,
  VSCodeService,
} from '@ptah-extension/core';
import { MachinesStore } from '@ptah-extension/machines-ui/services';
import {
  PtahButtonDirective,
  PtahIconButtonDirective,
} from '@ptah-extension/ui';
import { ClosedTabSessionEnderService } from '../../services/closed-tab-session-ender.service';
import { ElectronShellComponent } from './electron-shell.component';

describe('Electron shell Bots tab', () => {
  let fixture: ComponentFixture<ElectronShellComponent>;
  const layout = {
    hasWorkspaceFolders: signal(true),
    workspaceResolved: signal(true),
    pendingWorkspaceName: signal<string | null>(null),
    workspaceSidebarVisible: signal(false),
    workspaceSidebarWidth: signal(240),
    editorPanelVisible: signal(false),
    editorPanelWidth: signal(320),
  };
  const appState = {
    currentView: signal('chat'),
    openConfigurationSurface: signal<ConfigurationSurfaceId | null>(null),
    configurationSurfaceRemountTick: signal(0),
    thothFirstRunDismissed: signal(true),
    setCurrentView: jest.fn(),
    dismissThothFirstRun: jest.fn(),
  };

  function shell(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function tabs(): HTMLButtonElement[] {
    return Array.from(
      shell().querySelectorAll<HTMLButtonElement>(
        '.electron-tabs [role="tab"]',
      ),
    );
  }

  function tab(title: string): HTMLButtonElement {
    const match = tabs().find((entry) => entry.title === title);
    if (!match) throw new Error(`Missing ${title} tab`);
    return match;
  }

  beforeEach(async () => {
    layout.hasWorkspaceFolders.set(true);
    layout.workspaceResolved.set(true);
    appState.currentView.set('chat');
    appState.openConfigurationSurface.set(null);
    appState.setCurrentView.mockReset();
    await TestBed.configureTestingModule({
      imports: [ElectronShellComponent],
      providers: [
        provideRouter([]),
        { provide: ClosedTabSessionEnderService, useValue: {} },
        { provide: ElectronLayoutService, useValue: layout },
        { provide: AppStateManager, useValue: appState },
        {
          provide: SurfaceRouterService,
          useValue: {
            remountActiveSurface: jest.fn(),
            pendingSurface: () => null,
          },
        },
        {
          provide: MachinesStore,
          useValue: { pendingApprovalCount: signal(0) },
        },
        {
          provide: VSCodeService,
          useValue: {
            isElectron: true,
            getPtahIconUri: () => 'icon.png',
            config: () => ({ platform: 'win32' }),
          },
        },
      ],
    })
      .overrideComponent(ElectronShellComponent, {
        set: {
          imports: [RouterOutlet, PtahButtonDirective, PtahIconButtonDirective],
          schemas: [CUSTOM_ELEMENTS_SCHEMA],
        },
      })
      .compileComponents();
    fixture = TestBed.createComponent(ElectronShellComponent);
    fixture.detectChanges();
    appState.setCurrentView.mockReset();
  });

  afterEach(() => fixture.destroy());

  it('inserts Bots after Tasks with the Bot icon and accessible label', () => {
    expect(tabs().map((entry) => entry.title)).toEqual([
      'Chat',
      'Voice',
      'Apps',
      'Tasks',
      'Bots',
      'Machines',
      'Reviews',
      'Analytics',
      'Setup',
    ]);
    expect(tab('Bots').getAttribute('aria-label')).toBe('Bots');
    const icon = tab('Bots').querySelector<HTMLElement & { img?: unknown }>(
      'lucide-angular',
    );
    expect(icon?.img).toBe(Bot);
    expect(icon?.className).toBe('w-3.5 h-3.5');
  });

  it.each([
    ['Bots', 'bots'],
    ['Tasks', 'tasks'],
    ['Machines', 'machines'],
    ['Chat', 'chat'],
  ])('navigates %s by its surface id %s', (title, surface) => {
    tab(title).click();
    expect(appState.setCurrentView).toHaveBeenCalledTimes(1);
    expect(appState.setCurrentView).toHaveBeenCalledWith(surface);
  });

  it.each([
    ['Bots', 'bots'],
    ['Tasks', 'tasks'],
    ['Machines', 'machines'],
    ['Chat', 'chat'],
  ])('selects only %s for surface %s', (title, surface) => {
    appState.currentView.set(surface);
    fixture.detectChanges();
    expect(
      tabs()
        .filter((entry) => entry.getAttribute('aria-selected') === 'true')
        .map((entry) => entry.title),
    ).toEqual([title]);
  });

  it('renders Bots without a folder, yields the welcome to its outlet and offers a way back', () => {
    layout.hasWorkspaceFolders.set(false);
    fixture.detectChanges();
    expect(tabs().map((entry) => entry.title)).toEqual(['Bots', 'Machines']);
    tab('Bots').click();
    expect(appState.setCurrentView).toHaveBeenCalledWith('bots');
    appState.currentView.set('bots');
    fixture.detectChanges();
    expect(
      shell().querySelector(
        'ptah-electron-welcome, [data-testid="electron-welcome-placeholder"]',
      ),
    ).toBeNull();
    expect(shell().querySelectorAll('router-outlet')).toHaveLength(1);
    expect(shell().querySelector('ptah-app-shell')).toBeNull();
    const back = shell().querySelector<HTMLButtonElement>(
      '[data-test="config-back-to-welcome"]',
    );
    expect(back?.getAttribute('aria-label')).toBe('Back to welcome');
    back?.click();
    expect(appState.setCurrentView).toHaveBeenLastCalledWith('chat');
    appState.currentView.set('chat');
    fixture.detectChanges();
    expect(
      shell().querySelector('[data-testid="electron-welcome-placeholder"]'),
    ).not.toBeNull();
    expect(shell().querySelector('router-outlet')).toBeNull();
  });

  it('keeps the workspace loading gate before the Bots outlet', () => {
    layout.hasWorkspaceFolders.set(false);
    layout.workspaceResolved.set(false);
    appState.currentView.set('bots');
    fixture.detectChanges();
    expect(
      shell().querySelector('ptah-workspace-loading-state'),
    ).not.toBeNull();
    expect(shell().querySelector('router-outlet')).toBeNull();
    expect(tabs()).toHaveLength(0);
  });

  it('allows the Bots outlet and back action without a workspace folder', () => {
    layout.hasWorkspaceFolders.set(false);
    appState.currentView.set('bots');
    fixture.detectChanges();
    expect(
      shell().querySelector(
        'ptah-electron-welcome, [data-testid="electron-welcome-placeholder"]',
      ),
    ).toBeNull();
    expect(shell().querySelectorAll('router-outlet')).toHaveLength(1);
    const back = shell().querySelector<HTMLButtonElement>(
      '[data-test="config-back-to-welcome"]',
    );
    expect(back?.getAttribute('aria-label')).toBe('Back to welcome');
    back?.click();
    expect(appState.setCurrentView).toHaveBeenCalledWith('chat');
  });
});
