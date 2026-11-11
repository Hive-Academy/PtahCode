import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  SurfaceRouterService,
  WORKSPACE_COORDINATOR,
} from '@ptah-extension/core';
import { OnboardingFocusRouter } from './onboarding-focus-router.service';

describe('OnboardingFocusRouter', () => {
  const tabs = {
    activeWorkspacePath: '/work',
    findTabBySessionIdAcrossWorkspaces: jest.fn(),
    switchTab: jest.fn(),
  };
  const surface = { navigateToSurface: jest.fn() };
  const workspace = { switchWorkspace: jest.fn() };
  let router: OnboardingFocusRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.switchWorkspace.mockResolvedValue(undefined);
    surface.navigateToSurface.mockResolvedValue('navigated');
    tabs.findTabBySessionIdAcrossWorkspaces.mockImplementation((id: string) => {
      const workflow =
        id === 'generation'
          ? 'setup-agent-generation'
          : id === 'guidance'
            ? 'setup-project-prompt'
            : id === 'harness-new'
              ? 'harness-new-project'
              : id === 'harness-config'
                ? 'harness-configure'
                : null;
      return workflow
        ? {
            tab: { id: `tab-${id}`, workflow },
            workspacePath: id === 'guidance' ? '/elsewhere' : '/work',
          }
        : null;
    });
    TestBed.configureTestingModule({
      providers: [
        OnboardingFocusRouter,
        { provide: TabManagerService, useValue: tabs },
        { provide: SurfaceRouterService, useValue: surface },
        { provide: WORKSPACE_COORDINATOR, useValue: workspace },
      ],
    });
    router = TestBed.inject(OnboardingFocusRouter);
  });

  it.each([
    ['generation', ['analyze', 'agents']],
    ['guidance', ['guidance']],
  ] as const)(
    'focuses %s on its owning step with tab identity',
    async (sessionId, path) => {
      expect(router.canFocus(sessionId)).toBe(true);
      await expect(router.focus(sessionId)).resolves.toEqual({
        success: true,
        outcome: 'focused',
      });
      expect(surface.navigateToSurface).toHaveBeenCalledWith(
        'onboarding',
        path,
        {
          queryParams: { tab: `tab-${sessionId}` },
        },
      );
      expect(tabs.switchTab).toHaveBeenCalledWith(`tab-${sessionId}`);
      if (sessionId === 'guidance')
        expect(workspace.switchWorkspace).toHaveBeenCalledWith('/elsewhere');
    },
  );

  it.each(['harness-new', 'harness-config'] as const)(
    'delegates %s chat tabs to normal chat tab focus instead of onboarding',
    async (sessionId) => {
      expect(router.canFocus(sessionId)).toBe(false);
      await expect(router.focus(sessionId)).resolves.toEqual({
        success: false,
        outcome: 'missing',
      });
      expect(surface.navigateToSurface).not.toHaveBeenCalled();
    },
  );

  it('rejects a session with no owning tab', async () => {
    expect(router.canFocus('missing')).toBe(false);
    await expect(router.focus('missing')).resolves.toEqual({
      success: false,
      outcome: 'missing',
    });
  });
});
