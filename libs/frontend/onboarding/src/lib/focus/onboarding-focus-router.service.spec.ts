import { TestBed } from '@angular/core/testing';
import {
  SurfaceRouterService,
  WORKSPACE_COORDINATOR,
} from '@ptah-extension/core';
import {
  SetupRunStore,
  type SetupRunRecord,
} from '@ptah-extension/setup-wizard';
import { OnboardingFocusRouter } from './onboarding-focus-router.service';

const generation: SetupRunRecord = {
  id: 'setup-generation',
  workspacePath: '/work',
  workflow: 'agent-generation',
  status: 'running',
  step: 'generating',
  backendRunId: 'backend-generation',
  analysisRunId: 'analysis',
  parentId: null,
  unseen: false,
  createdAt: 0,
  updatedAt: 0,
};

describe('OnboardingFocusRouter', () => {
  const runs = { workspacePath: () => '/work', get: jest.fn() };
  const surface = { navigateToSurface: jest.fn() };
  const workspace = { switchWorkspace: jest.fn() };
  let router: OnboardingFocusRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    workspace.switchWorkspace.mockResolvedValue(undefined);
    surface.navigateToSurface.mockResolvedValue('navigated');
    TestBed.configureTestingModule({
      providers: [
        OnboardingFocusRouter,
        { provide: SetupRunStore, useValue: runs },
        { provide: SurfaceRouterService, useValue: surface },
        { provide: WORKSPACE_COORDINATOR, useValue: workspace },
      ],
    });
    router = TestBed.inject(OnboardingFocusRouter);
  });

  it.each([
    [generation, ['analyze', 'generate']],
    [
      {
        ...generation,
        id: 'setup-guidance',
        workflow: 'project-guidance',
        workspacePath: '/elsewhere',
        parentId: generation.id,
      },
      ['analyze', 'guidance'],
    ],
    [
      {
        ...generation,
        id: 'setup-done',
        workflow: 'project-guidance',
        status: 'completed',
        parentId: generation.id,
      },
      ['analyze', 'done'],
    ],
  ] as const)('focuses %s on its owning Setup step', async (record, path) => {
    runs.get.mockReturnValue(record);
    expect(router.canFocus(record.id)).toBe(true);
    await expect(router.focus(record.id)).resolves.toEqual({
      success: true,
      outcome: 'focused',
    });
    expect(runs.get).toHaveBeenCalledWith(record.id);
    expect(surface.navigateToSurface).toHaveBeenCalledWith('onboarding', path, {
      queryParams: { tab: record.id, analysis: 'analysis' },
    });
    if (record.workspacePath === '/elsewhere')
      expect(workspace.switchWorkspace).toHaveBeenCalledWith('/elsewhere');
    else expect(workspace.switchWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { ...generation, workflow: 'team-builder', step: 'handed-off' },
  ] as const)(
    'rejects a notification without an owning generation record',
    async (record) => {
      runs.get.mockReturnValue(record);
      expect(router.canFocus('other')).toBe(false);
      await expect(router.focus('other')).resolves.toEqual({
        success: false,
        outcome: 'missing',
      });
      expect(surface.navigateToSurface).not.toHaveBeenCalled();
    },
  );

  it('reports unsuccessful navigation as missing', async () => {
    runs.get.mockReturnValue(generation);
    surface.navigateToSurface.mockResolvedValue('cancelled');
    await expect(router.focus(generation.id)).resolves.toEqual({
      success: false,
      outcome: 'missing',
    });
  });
});
