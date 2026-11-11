/**
 * The Machines tab of the Electron shell (TASK_2026_858, Batch 26).
 *
 * Pins design-spec section 3 and decisions D11 and D12:
 *   - the tab sits between Tasks and the tabs after it, before Analytics;
 *   - it renders outside the `hasWorkspaceFolders()` guard, so without a
 *     local folder the strip shrinks to Machines alone;
 *   - the no-folder welcome branch yields to `'machines'`, so the bare outlet
 *     really activates the Machines route without a folder;
 *   - a pending-approval count badge is a hint on the label, not a button.
 */
import { PtahButtonDirective, PtahIconButtonDirective } from '@ptah-extension/ui';
import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { Server } from 'lucide-angular';
import {
  AppStateManager,
  type ConfigurationSurfaceId,
  ElectronLayoutService,
  SurfaceRouterService,
  VSCodeService,
} from '@ptah-extension/core';
import { MachinesStore } from '@ptah-extension/machines-ui/services';
import { ElectronShellComponent } from './electron-shell.component';
import { ClosedTabSessionEnderService } from '../../services/closed-tab-session-ender.service';

@Component({
  selector: 'ptah-machines-route-test',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div data-test="machines-route-marker">Machines route</div>',
})
class MachinesRouteTestComponent {}

describe('ElectronShellComponent Machines tab', () => {
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
    setCurrentView: jest.fn(),
    dismissThothFirstRun: jest.fn(),
  };
  const surfaceRouterStub = {
    remountActiveSurface: jest.fn(),
    pendingSurface: jest.fn(() => null),
  };
  const machinesStub = { pendingApprovalCount: signal(0) };

  function shell(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function tabs(): HTMLButtonElement[] {
    return Array.from(
      shell().querySelectorAll<HTMLButtonElement>(
        '[role="tablist"].electron-tabs button[role="tab"]',
      ),
    );
  }

  function machinesTab(): HTMLButtonElement | undefined {
    return tabs().find((tab) => tab.title === 'Machines');
  }

  function badge(): HTMLElement | null {
    return shell().querySelector('[data-testid="machines-tab-approvals"]');
  }

  function backButton(): HTMLButtonElement | null {
    return shell().querySelector('[data-test="config-back-to-welcome"]');
  }

  function withoutFolders(): void {
    layoutStub.hasWorkspaceFolders.set(false);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    layoutStub.hasWorkspaceFolders.set(true);
    layoutStub.workspaceResolved.set(true);
    appStateStub.currentView.set('chat');
    appStateStub.openConfigurationSurface.set(null);
    appStateStub.configurationSurfaceRemountTick.set(0);
    appStateStub.setCurrentView.mockReset();
    machinesStub.pendingApprovalCount.set(0);
    await TestBed.configureTestingModule({
      imports: [ElectronShellComponent],
      providers: [
        // Eager root singleton stubbed; covered by its own spec.
        { provide: ClosedTabSessionEnderService, useValue: {} },
        provideRouter([
          { path: 'machines', component: MachinesRouteTestComponent },
        ]),
        { provide: ElectronLayoutService, useValue: layoutStub },
        { provide: AppStateManager, useValue: appStateStub },
        { provide: SurfaceRouterService, useValue: surfaceRouterStub },
        { provide: MachinesStore, useValue: machinesStub },
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
          imports: [RouterOutlet, PtahButtonDirective, PtahIconButtonDirective],
          schemas: [CUSTOM_ELEMENTS_SCHEMA],
        },
      })
      .compileComponents();
    fixture = TestBed.createComponent(ElectronShellComponent);
    fixture.detectChanges();
    appStateStub.setCurrentView.mockReset();
  });

  afterEach(() => fixture.destroy());

  it('places Machines after Tasks and before Analytics', () => {
    const titles = tabs().map((tab) => tab.title);
    expect(titles.indexOf('Machines')).toBe(titles.indexOf('Tasks') + 1);
    expect(titles.indexOf('Machines')).toBeLessThan(
      titles.indexOf('Analytics'),
    );
  });

  it('follows the sibling tab pattern with the Server icon', () => {
    const tab = machinesTab()!;
    const tasks = tabs().find((t) => t.title === 'Tasks')!;
    expect(tab.className).toBe(tasks.className);
    expect(tab.getAttribute('aria-label')).toBe('Machines');
    expect(tab.querySelector('.tab-label')?.textContent).toBe('Machines');
    const icon = tab.querySelector('lucide-angular') as
      (HTMLElement & { img?: unknown }) | null;
    expect(icon?.img).toBe(Server);
  });

  it('opens the machines surface and marks the tab selected', () => {
    machinesTab()!.click();
    expect(appStateStub.setCurrentView).toHaveBeenCalledWith('machines');

    appStateStub.currentView.set('machines');
    fixture.detectChanges();
    expect(machinesTab()!.getAttribute('aria-selected')).toBe('true');
    expect(machinesTab()!.classList).toContain('tab-active');
  });

  describe('approval badge (D11)', () => {
    it('shows no badge while nothing is pending', () => {
      expect(badge()).toBeNull();
    });

    it('shows the pending count as a hint and names it in the tab label', () => {
      machinesStub.pendingApprovalCount.set(1);
      fixture.detectChanges();
      expect(badge()?.textContent?.trim()).toBe('1');
      expect(badge()?.getAttribute('aria-hidden')).toBe('true');
      expect(badge()?.tagName).toBe('SPAN');
      expect(machinesTab()!.getAttribute('aria-label')).toBe(
        'Machines, 1 approval waiting',
      );

      machinesStub.pendingApprovalCount.set(3);
      fixture.detectChanges();
      expect(badge()?.textContent?.trim()).toBe('3');
      expect(machinesTab()!.getAttribute('aria-label')).toBe(
        'Machines, 3 approvals waiting',
      );
    });

    it('keeps the badge on the no-folder strip too', () => {
      machinesStub.pendingApprovalCount.set(2);
      withoutFolders();
      expect(badge()?.textContent?.trim()).toBe('2');
    });
  });

  describe('without a local folder (D12)', () => {
    it('shrinks the tab strip to Machines alone', () => {
      withoutFolders();
      expect(tabs().map((tab) => tab.title)).toEqual(['Machines']);
    });

    it('shows no strip until the first workspace sync settles', () => {
      layoutStub.workspaceResolved.set(false);
      withoutFolders();
      expect(shell().querySelector('[role="tablist"]')).toBeNull();
    });

    it('yields the welcome to the machines surface and shows the bare outlet', () => {
      withoutFolders();
      // The welcome branch is showing (its `@defer` placeholder or the
      // welcome itself) and no outlet is rendered yet.
      expect(
        shell().querySelector(
          'ptah-electron-welcome, [data-testid="electron-welcome-placeholder"]',
        ),
      ).not.toBeNull();
      expect(shell().querySelector('router-outlet')).toBeNull();

      appStateStub.currentView.set('machines');
      fixture.detectChanges();
      expect(shell().querySelector('ptah-electron-welcome')).toBeNull();
      expect(
        shell().querySelector('[data-testid="electron-welcome-placeholder"]'),
      ).toBeNull();
      expect(shell().querySelectorAll('router-outlet')).toHaveLength(1);
      expect(shell().querySelector('ptah-app-shell')).toBeNull();
      expect(backButton()?.getAttribute('aria-label')).toBe('Back to welcome');
    });

    it('reaches the Machines view through the outlet', async () => {
      withoutFolders();
      appStateStub.currentView.set('machines');
      fixture.detectChanges();

      expect(await TestBed.inject(Router).navigateByUrl('/machines')).toBe(
        true,
      );
      fixture.detectChanges();
      await fixture.whenStable();

      const outlet = fixture.debugElement
        .query(By.directive(RouterOutlet))
        .injector.get(RouterOutlet);
      expect(outlet.isActivated).toBe(true);
      expect(outlet.component).toBeInstanceOf(MachinesRouteTestComponent);
      expect(
        shell().querySelector('[data-test="machines-route-marker"]')
          ?.textContent,
      ).toBe('Machines route');
    });

    it('returns to welcome from the back button', () => {
      withoutFolders();
      appStateStub.currentView.set('machines');
      fixture.detectChanges();
      backButton()!.click();
      expect(appStateStub.setCurrentView).toHaveBeenCalledWith('chat');
    });

    it('restores every tab when a folder opens', () => {
      withoutFolders();
      layoutStub.hasWorkspaceFolders.set(true);
      fixture.detectChanges();
      expect(tabs()).toHaveLength(8);
    });
  });
});
