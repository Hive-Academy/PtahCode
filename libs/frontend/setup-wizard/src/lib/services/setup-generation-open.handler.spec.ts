import { TestBed } from '@angular/core/testing';
import { TabManagerService } from '@ptah-extension/chat-state';
import {
  SETUP_RUN_ENTRY,
  SurfaceRouterService,
  VSCodeService,
} from '@ptah-extension/core';
import { MESSAGE_TYPES } from '@ptah-extension/shared';
import { SetupGenerationOpenHandler } from './setup-generation-open.handler';

describe('SetupGenerationOpenHandler', () => {
  const payload = {
    workspacePath: '/ws',
    workflow: 'setup-agent-generation',
    origin: 'independent-start',
  };
  const openWorkflow = jest.fn();
  const navigateToSurface = jest.fn();
  const createTab = jest.fn();
  const createWorkflowTabForWorkspace = jest.fn();

  function setup({ electron = true, hasEntry = true } = {}) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TabManagerService,
          useValue: {
            activeWorkspacePath: electron ? '/ws' : null,
            createTab,
            createWorkflowTabForWorkspace,
          },
        },
        {
          provide: VSCodeService,
          useValue: {
            config: () => ({
              workspaceRoot: electron ? '/ws' : 'C:\\ws',
              isVSCode: !electron,
            }),
          },
        },
        { provide: SurfaceRouterService, useValue: { navigateToSurface } },
        ...(hasEntry
          ? [{ provide: SETUP_RUN_ENTRY, useValue: { openWorkflow } }]
          : []),
      ],
    });
    return TestBed.inject(SetupGenerationOpenHandler);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    openWorkflow.mockResolvedValue('navigated');
    navigateToSurface.mockResolvedValue('navigated');
  });

  function push(handler: SetupGenerationOpenHandler, value: unknown = payload) {
    handler.handleMessage({
      type: MESSAGE_TYPES.SETUP_GENERATION_OPEN,
      payload: value,
    });
  }

  it('delegates both workflows to the entry port with host origin and creates no tabs', () => {
    const handler = setup();
    push(handler);
    push(handler, { ...payload, workflow: 'setup-project-prompt' });

    expect(openWorkflow.mock.calls).toEqual([
      ['setup-agent-generation', 'host'],
      ['setup-project-prompt', 'host'],
    ]);
    expect(createTab).not.toHaveBeenCalled();
    expect(createWorkflowTabForWorkspace).not.toHaveBeenCalled();
    expect(navigateToSurface).not.toHaveBeenCalled();
  });

  it('ignores malformed pushes and pushes for a different workspace', () => {
    const handler = setup();
    handler.handleMessage({ type: 'other', payload });
    push(handler, { ...payload, workspacePath: '/other' });
    push(handler, { ...payload, workflow: 'bogus' });
    push(handler, { ...payload, origin: 'bogus' });
    push(handler, null);

    expect(openWorkflow).not.toHaveBeenCalled();
  });

  it('accepts the VS Code workspace root with normalized separators', () => {
    const handler = setup({ electron: false });
    push(handler, { ...payload, workspacePath: 'c:/ws/' });
    push(handler, { ...payload, workspacePath: 'c:/other' });

    expect(openWorkflow).toHaveBeenCalledTimes(1);
    expect(openWorkflow).toHaveBeenCalledWith('setup-agent-generation', 'host');
  });

  it('only falls back to Setup Home for guidance without an entry provider', () => {
    const handler = setup({ hasEntry: false });
    push(handler);
    expect(navigateToSurface).not.toHaveBeenCalled();

    push(handler, { ...payload, workflow: 'setup-project-prompt' });
    expect(navigateToSurface).toHaveBeenCalledWith('onboarding');
    expect(createWorkflowTabForWorkspace).not.toHaveBeenCalled();
  });

  it.each(['failed', 'rejected'])(
    'shows the retry notice when navigation is %s',
    async (outcome) => {
      if (outcome === 'rejected') openWorkflow.mockRejectedValue(new Error());
      else openWorkflow.mockResolvedValue(outcome);
      const handler = setup();
      push(handler, { ...payload, workflow: 'setup-project-prompt' });
      await Promise.resolve();

      expect(handler.launchNotice()).toContain('Try Continue again');
    },
  );

  it('points declined agent generation opens to Setup', async () => {
    openWorkflow.mockResolvedValue('failed');
    const handler = setup();
    push(handler);
    await Promise.resolve();
    expect(handler.launchNotice()).toContain('Open Setup to find saved runs.');
  });

  it.each(['cancelled', 'already-there'])(
    'leaves the retry notice clear when navigation is %s',
    async (outcome) => {
      openWorkflow.mockResolvedValue(outcome);
      const handler = setup();
      push(handler);
      await Promise.resolve();

      expect(handler.launchNotice()).toBeNull();
    },
  );
});
