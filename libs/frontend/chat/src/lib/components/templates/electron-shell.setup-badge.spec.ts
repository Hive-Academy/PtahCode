/**
 * The Setup tab badge of the Electron shell (TASK_2026_2330, Batch 13).
 *
 * Pins plan component 5 and the revision-1 review contracts:
 *   - the tab names the attention count in its aria-label
 *     ("Setup: 2 runs need attention") and shows it as an aria-hidden hint
 *     badge, the same pattern as the Machines approvals badge (D11);
 *   - while a run is running, a small dot pulses opacity/transform only;
 *   - `openSetupHub` delegates to the `SETUP_RUN_ENTRY` port, never acts on a
 *     `cancelled` outcome (the newer navigation owns the screen), falls back
 *     to the bare onboarding root through the surface router on `failed` or
 *     a thrown/rejected call, and uses the app-state switch from outside
 *     Setup when the port is absent;
 *   - a late failure of a superseded Setup click never runs the Home
 *     fallback: every shell navigation claims a monotonic intent id first.
 */
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahIconButtonDirective,
} from '@ptah-extension/ui';
import {
  AppStateManager,
  type ConfigurationSurfaceId,
  ElectronLayoutService,
  SETUP_RUN_ENTRY,
  SurfaceRouterService,
  VSCodeService,
} from '@ptah-extension/core';
import { MachinesStore } from '@ptah-extension/machines-ui/services';
import { ElectronShellComponent } from './electron-shell.component';
import { ClosedTabSessionEnderService } from '../../services/closed-tab-session-ender.service';

@Component({
  selector: 'ptah-setup-badge-route-test',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div data-test="setup-badge-route-marker"></div>',
})
class SetupBadgeRouteTestComponent {}

/** Route-backed fallback test: an onboarding root with one Setup child. */
@Component({
  selector: 'ptah-onboarding-root-test',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class OnboardingRootTestComponent {}

@Component({
  selector: 'ptah-onboarding-skills-test',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div data-test="onboarding-skills-marker"></div>',
})
class OnboardingSkillsTestComponent {}

describe('ElectronShellComponent Setup tab badge', () => {
  let fixture: ComponentFixture<ElectronShellComponent>;
  const layoutStub = {
    hasWorkspaceFolders: signal(true),
    workspaceResolved: signal(true),
    pendingWorkspaceName: signal<string | null>(null),
    workspaceSidebarVisible: signal(false),
    workspaceSidebarWidth: signal(240),
    editorPanelVisible: signal(false),
    editorPanelWidth: signal(320),
  };
  const appStateStub = {
    currentView: signal('chat'),
    openConfigurationSurface: signal<ConfigurationSurfaceId | null>(null),
    configurationSurfaceRemountTick: signal(0),
    thothFirstRunDismissed: signal(true),
    canSwitchViews: signal(true),
    setCurrentView: jest.fn(),
    dismissThothFirstRun: jest.fn(),
  };
  const surfaceRouterStub = {
    remountActiveSurface: jest.fn(),
    pendingSurface: jest.fn(() => null),
    navigateToSurface: jest.fn().mockResolvedValue('navigated'),
  };
  const machinesStub = { pendingApprovalCount: signal(0) };
  const entryStub = {
    attentionCount: signal(0),
    runningCount: signal(0),
    openSetup: jest.fn().mockResolvedValue('navigated'),
  };

  function shell(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function setupTab(): HTMLButtonElement | null {
    return shell().querySelector<HTMLButtonElement>(
      '[data-test="config-menu-item-setup-hub"]',
    );
  }

  function machinesTab(): HTMLButtonElement | null {
    return shell().querySelector<HTMLButtonElement>(
      '[data-testid="machines-tab"]',
    );
  }

  function attentionBadge(): HTMLElement | null {
    return shell().querySelector('[data-testid="setup-tab-attention"]');
  }

  function runningDot(): HTMLElement | null {
    return shell().querySelector('[data-testid="setup-tab-running"]');
  }

  /**
   * `realRouter` mounts the real `SurfaceRouterService` over an onboarding
   * route table, for the tests that assert the settled URL. The stub mode
   * (default) keeps the unit seam: the stub records `navigateToSurface`.
   */
  async function mount(options: {
    withEntry?: boolean;
    realRouter?: boolean;
  } = {}): Promise<void> {
    const { withEntry = true, realRouter = false } = options;
    await TestBed.configureTestingModule({
      imports: [ElectronShellComponent],
      providers: [
        // Eager root singleton stubbed; covered by its own spec.
        { provide: ClosedTabSessionEnderService, useValue: {} },
        provideRouter(
          realRouter
            ? [
                {
                  path: 'onboarding',
                  component: OnboardingRootTestComponent,
                  children: [
                    {
                      path: 'analyze/skills',
                      component: OnboardingSkillsTestComponent,
                    },
                  ],
                },
                {
                  path: 'machines',
                  component: SetupBadgeRouteTestComponent,
                },
                {
                  path: 'settings',
                  component: SetupBadgeRouteTestComponent,
                },
              ]
            : [{ path: 'machines', component: SetupBadgeRouteTestComponent }],
        ),
        { provide: ElectronLayoutService, useValue: layoutStub },
        { provide: AppStateManager, useValue: appStateStub },
        ...(realRouter
          ? []
          : [{ provide: SurfaceRouterService, useValue: surfaceRouterStub }]),
        { provide: MachinesStore, useValue: machinesStub },
        ...(withEntry
          ? [{ provide: SETUP_RUN_ENTRY, useValue: entryStub }]
          : []),
        {
          provide: VSCodeService,
          // The shell renders only on the Electron host.
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
          imports: [
            RouterOutlet,
            PtahButtonDirective,
            PtahIconButtonDirective,
            PtahBadgeDirective,
          ],
          schemas: [CUSTOM_ELEMENTS_SCHEMA],
        },
      })
      .compileComponents();
    fixture = TestBed.createComponent(ElectronShellComponent);
    fixture.detectChanges();
    appStateStub.setCurrentView.mockReset();
    surfaceRouterStub.navigateToSurface.mockClear();
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    entryStub.attentionCount.set(0);
    entryStub.runningCount.set(0);
    entryStub.openSetup.mockReset().mockResolvedValue('navigated');
    appStateStub.currentView.set('chat');
    appStateStub.openConfigurationSurface.set(null);
    await mount();
  });

  afterEach(() => fixture.destroy());

  describe('attention badge and label', () => {
    it('shows no badge and keeps the plain label while nothing needs attention', () => {
      expect(attentionBadge()).toBeNull();
      expect(setupTab()!.getAttribute('aria-label')).toBe('Setup');
    });

    it('names the attention count in the tab label and shows it as a hint', () => {
      entryStub.attentionCount.set(2);
      fixture.detectChanges();
      const badge = attentionBadge()!;
      expect(badge.textContent?.trim()).toBe('2');
      expect(badge.getAttribute('aria-hidden')).toBe('true');
      expect(badge.tagName).toBe('SPAN');
      expect(setupTab()!.getAttribute('aria-label')).toBe(
        'Setup: 2 runs need attention',
      );
    });

    it('keeps singular copy for a single run', () => {
      entryStub.attentionCount.set(1);
      fixture.detectChanges();
      expect(attentionBadge()!.textContent?.trim()).toBe('1');
      expect(setupTab()!.getAttribute('aria-label')).toBe(
        'Setup: 1 run needs attention',
      );
    });
  });

  describe('running dot', () => {
    it('shows no dot while no run is running', () => {
      expect(runningDot()).toBeNull();
    });

    it('shows a pulsing dot while a run is running', () => {
      entryStub.runningCount.set(1);
      fixture.detectChanges();
      const dot = runningDot()!;
      expect(dot.tagName).toBe('SPAN');
      expect(dot.getAttribute('aria-hidden')).toBe('true');
      expect(dot.className).toContain('setup-running-dot');

      entryStub.runningCount.set(0);
      fixture.detectChanges();
      expect(runningDot()).toBeNull();
    });
  });

  describe('openSetupHub delegation', () => {
    it('opens the active run through the entry port', async () => {
      setupTab()!.click();
      await fixture.whenStable();
      expect(entryStub.openSetup).toHaveBeenCalledTimes(1);
      expect(appStateStub.setCurrentView).not.toHaveBeenCalled();
      expect(surfaceRouterStub.navigateToSurface).not.toHaveBeenCalled();
    });

    it('does not act on an already-there outcome', async () => {
      entryStub.openSetup.mockResolvedValueOnce('already-there');
      setupTab()!.click();
      await fixture.whenStable();
      expect(appStateStub.setCurrentView).not.toHaveBeenCalled();
      expect(surfaceRouterStub.navigateToSurface).not.toHaveBeenCalled();
    });

    it('does not fall back when a newer navigation supersedes the Setup click', async () => {
      let resolveSetup: (outcome: 'navigated' | 'cancelled') => void =
        () => undefined;
      entryStub.openSetup.mockReturnValueOnce(
        new Promise<'navigated' | 'cancelled'>((done) => {
          resolveSetup = done;
        }),
      );
      setupTab()!.click();
      // The user clicks Machines while the Setup navigation is still
      // pending. The newer navigation owns the screen; the superseded Setup
      // request must not override it with a Home fallback.
      appStateStub.setCurrentView('machines');
      resolveSetup('cancelled');
      await fixture.whenStable();
      expect(appStateStub.setCurrentView).toHaveBeenCalledTimes(1);
      expect(appStateStub.setCurrentView).toHaveBeenCalledWith('machines');
      expect(surfaceRouterStub.navigateToSurface).not.toHaveBeenCalled();
    });

    it('falls back to the bare onboarding root when the port fails', async () => {
      entryStub.openSetup.mockResolvedValueOnce('failed');
      setupTab()!.click();
      await fixture.whenStable();
      expect(surfaceRouterStub.navigateToSurface).toHaveBeenCalledWith(
        'onboarding',
      );
      expect(appStateStub.setCurrentView).not.toHaveBeenCalled();
    });

    it('routes a rejected port call through the same failure fallback', async () => {
      entryStub.openSetup.mockRejectedValueOnce(new Error('port broke'));
      setupTab()!.click();
      await fixture.whenStable();
      expect(surfaceRouterStub.navigateToSurface).toHaveBeenCalledWith(
        'onboarding',
      );
      expect(appStateStub.setCurrentView).not.toHaveBeenCalled();
    });

    it('routes a synchronous port throw through the same failure fallback', async () => {
      entryStub.openSetup.mockImplementationOnce(() => {
        throw new Error('sync throw');
      });
      setupTab()!.click();
      await fixture.whenStable();
      expect(surfaceRouterStub.navigateToSurface).toHaveBeenCalledWith(
        'onboarding',
      );
    });

    it('lets only the newest Setup click own the Home fallback', async () => {
      let resolveFirst: (outcome: 'navigated' | 'failed') => void =
        () => undefined;
      entryStub.openSetup.mockReturnValueOnce(
        new Promise<'navigated' | 'failed'>((done) => {
          resolveFirst = done;
        }),
      );
      setupTab()!.click();
      // A second Setup click supersedes the first and succeeds.
      entryStub.openSetup.mockResolvedValueOnce('navigated');
      setupTab()!.click();
      await fixture.whenStable();
      // The first click's late failure is stale; it must not reach Home.
      resolveFirst('failed');
      await fixture.whenStable();
      expect(surfaceRouterStub.navigateToSurface).not.toHaveBeenCalled();
    });

    it('keeps the settled Machines destination when a pending Setup call rejects late', async () => {
      TestBed.resetTestingModule();
      await mount({ realRouter: true });
      const router = TestBed.inject(Router);

      let rejectSetup: (reason?: Error) => void = () => undefined;
      entryStub.openSetup.mockReturnValueOnce(
        new Promise<never>((_done, reject) => {
          rejectSetup = reject;
        }),
      );
      setupTab()!.click();

      // The user clicks Machines, and that newer navigation settles.
      machinesTab()!.click();
      await router.navigateByUrl('/machines');
      fixture.detectChanges();
      expect(router.url).toBe('/machines');

      rejectSetup(new Error('late port failure'));
      await fixture.whenStable();
      expect(router.url).toBe('/machines');
      expect(appStateStub.setCurrentView).not.toHaveBeenCalledWith(
        'onboarding',
      );
    });

    it('keeps the settled Machines destination when a failed Setup outcome arrives late', async () => {
      TestBed.resetTestingModule();
      await mount({ realRouter: true });
      const router = TestBed.inject(Router);

      let resolveSetup: (outcome: 'navigated' | 'failed') => void =
        () => undefined;
      entryStub.openSetup.mockReturnValueOnce(
        new Promise<'navigated' | 'failed'>((done) => {
          resolveSetup = done;
        }),
      );
      setupTab()!.click();

      machinesTab()!.click();
      await router.navigateByUrl('/machines');
      fixture.detectChanges();
      expect(router.url).toBe('/machines');

      resolveSetup('failed');
      await fixture.whenStable();
      expect(router.url).toBe('/machines');
      expect(appStateStub.setCurrentView).not.toHaveBeenCalledWith(
        'onboarding',
      );
    });

    it('falls back to the bare onboarding view when the token is absent', async () => {
      TestBed.resetTestingModule();
      await mount({ withEntry: false });
      setupTab()!.click();
      await fixture.whenStable();
      expect(entryStub.openSetup).not.toHaveBeenCalled();
      expect(appStateStub.setCurrentView).toHaveBeenCalledWith('onboarding');
    });

    it('opens Setup Home from a child route when the token is absent', async () => {
      TestBed.resetTestingModule();
      await mount({ withEntry: false, realRouter: true });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/onboarding/analyze/skills');
      appStateStub.currentView.set('onboarding');
      fixture.detectChanges();

      setupTab()?.click();
      await fixture.whenStable();

      expect(router.url).toBe('/onboarding');
      expect(appStateStub.setCurrentView).not.toHaveBeenCalled();
    });

    it('keeps a Settings route that bypassed the shell handlers when Setup fails late', async () => {
      TestBed.resetTestingModule();
      await mount({ realRouter: true });
      const router = TestBed.inject(Router);

      let rejectSetup: (reason?: Error) => void = () => undefined;
      entryStub.openSetup.mockReturnValueOnce(
        new Promise<never>((_done, reject) => {
          rejectSetup = reject;
        }),
      );
      setupTab()!.click();

      // The global config actions navigate without any shell tab handler.
      await router.navigateByUrl('/settings');
      fixture.detectChanges();
      expect(router.url).toBe('/settings');

      rejectSetup(new Error('late port failure'));
      await fixture.whenStable();
      expect(router.url).toBe('/settings');
      expect(appStateStub.setCurrentView).not.toHaveBeenCalledWith(
        'onboarding',
      );
    });

    it('keeps a Settings route reached by a round trip when Setup fails late', async () => {
      TestBed.resetTestingModule();
      await mount({ realRouter: true });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/settings');
      fixture.detectChanges();

      let resolveSetup: (outcome: 'failed') => void = () => undefined;
      entryStub.openSetup.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSetup = resolve;
        }),
      );
      setupTab()!.click();

      // Settings -> Machines -> Settings restores the URL seen at the click.
      await router.navigateByUrl('/machines');
      await router.navigateByUrl('/settings');
      fixture.detectChanges();
      expect(router.url).toBe('/settings');

      resolveSetup('failed');
      await fixture.whenStable();
      expect(router.url).toBe('/settings');
    });

    it('keeps a host view switch that changed no URL when Setup fails late', async () => {
      let resolveSetup: (outcome: 'failed') => void = () => undefined;
      entryStub.openSetup.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSetup = resolve;
        }),
      );
      setupTab()!.click();

      // A host SWITCH_VIEW goes straight to app state.
      appStateStub.currentView.set('settings');
      resolveSetup('failed');
      await fixture.whenStable();
      expect(surfaceRouterStub.navigateToSurface).not.toHaveBeenCalled();
    });

    it('requests the onboarding root URL from a Setup child page when the port fails', async () => {
      TestBed.resetTestingModule();
      await mount({ realRouter: true });
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/onboarding/analyze/skills');
      fixture.detectChanges();
      expect(router.url).toBe('/onboarding/analyze/skills');

      entryStub.openSetup.mockResolvedValueOnce('failed');
      setupTab()!.click();
      await fixture.whenStable();

      // `setCurrentView('onboarding')` alone is a no-op on a Setup child
      // page (the workspace owns the surface), so the fallback must land on
      // the bare Home URL.
      expect(router.url).toBe('/onboarding');
      expect(appStateStub.setCurrentView).not.toHaveBeenCalled();
    });
  });
});
