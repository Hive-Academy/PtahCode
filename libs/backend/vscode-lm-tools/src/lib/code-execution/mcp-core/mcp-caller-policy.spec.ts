import {
  isCronWriteDenied,
  isToolPermitted,
  toolClass,
} from './mcp-caller-policy';

describe('mcp caller policy', () => {
  it('classifies read tools, execute_code, browsers, and unknown names', () => {
    expect(toolClass('ptah_workspace_analyze')).toBe('read');
    expect(toolClass('ptah_task_check')).toBe('read');
    expect(toolClass('ptah_surface_get_state')).toBe('read');
    expect(toolClass('execute_code')).toBe('execute-code');
    expect(toolClass('approval_prompt')).toBe('approval');
    expect(toolClass('ptah_task_create')).toBe('task-git-mutation');
    expect(toolClass('ptah_web_search')).toBe('network');
    expect(toolClass('ptah_browser_status')).toBe('browser-control');
    expect(toolClass('ptah_browser_navigate')).toBe('browser-control');
    expect(toolClass('ptah_not_a_real_tool')).toBe('agent-control');
    expect(toolClass('ptah_agent_message_control')).toBe('agent-control');
    expect(toolClass('ptah_agent_message_ack')).toBe('agent-control');
    expect(toolClass('ptah_session_clear_finished')).toBe('agent-control');
  });

  it('permits only the read class for read-only callers', () => {
    expect(isToolPermitted('ptah_task_get', 'read-only')).toBe(true);
    expect(isToolPermitted('execute_code', 'read-only')).toBe(false);
    expect(isToolPermitted('ptah_task_create', 'read-only')).toBe(false);
    expect(isToolPermitted('ptah_browser_status', 'read-only')).toBe(false);
    expect(isToolPermitted('ptah_not_a_real_tool', 'read-only')).toBe(false);
  });

  it('permits lane reports and read tools without privileged access', () => {
    expect(isToolPermitted('ptah_workspace_analyze', 'lane-report')).toBe(true);
    expect(isToolPermitted('ptah_agent_report', 'lane-report')).toBe(true);
    expect(isToolPermitted('ptah_agent_message_status', 'lane-report')).toBe(
      true,
    );
    expect(isToolPermitted('ptah_agent_message_ack', 'lane-report')).toBe(true);
    for (const name of [
      'ptah_agent_spawn',
      'ptah_agent_message',
      'ptah_agent_message_control',
      'ptah_agent_stop',
      'ptah_task_create',
      'ptah_browser_status',
      'approval_prompt',
      'execute_code',
    ]) {
      expect(isToolPermitted(name, 'lane-report')).toBe(false);
    }
  });

  it('permits every class for a privileged caller', () => {
    expect(isToolPermitted('execute_code', 'privileged')).toBe(true);
    expect(isToolPermitted('ptah_task_create', 'privileged')).toBe(true);
    expect(isToolPermitted('ptah_not_a_real_tool', 'privileged')).toBe(true);
    expect(isToolPermitted('ptah_agent_message_ack', 'privileged')).toBe(true);
    expect(isToolPermitted('ptah_agent_message_control', 'privileged')).toBe(
      true,
    );
  });

  it('keeps the message write tools away from read-only callers', () => {
    for (const name of [
      'ptah_agent_message',
      'ptah_agent_message_control',
      'ptah_agent_message_ack',
    ])
      expect(isToolPermitted(name, 'read-only')).toBe(false);
  });
  describe('cron write tools', () => {
    const writes = [
      'ptah_cron_create',
      'ptah_cron_update',
      'ptah_cron_toggle',
      'ptah_cron_delete',
      'ptah_cron_run_now',
    ];

    it('allows them only for a credential that proves user approval', () => {
      for (const name of writes) {
        expect(
          isCronWriteDenied(name, {
            kind: 'session',
            sessionId: 's',
            capability: 'privileged',
            cronWriteApproval: true,
          }),
        ).toBe(false);
      }
    });

    it('denies them for every other caller, whatever its capability', () => {
      const callers = [
        undefined,
        { kind: 'session', sessionId: 's', capability: 'privileged' },
        { kind: 'agent', agentId: 'a', capability: 'privileged' },
        { kind: 'internal-query', capability: 'privileged' },
        { kind: 'workspace', capability: 'privileged' },
      ] as const;
      for (const name of writes) {
        for (const binding of callers) {
          expect(isCronWriteDenied(name, binding)).toBe(true);
        }
      }
    });

    it('does not gate the cron read tools or other tools', () => {
      for (const name of [
        'ptah_cron_list',
        'ptah_cron_get',
        'ptah_cron_runs',
        'ptah_cron_next_fire',
        'ptah_task_create',
      ]) {
        expect(isCronWriteDenied(name, undefined)).toBe(false);
      }
    });
  });

  it('puts every gateway name in class gateway, privileged only', () => {
    expect(toolClass('zernio__create_post', 'gateway')).toBe('gateway');
    // A host-origin name keeps its own class even when the shape matches.
    expect(toolClass('ptah_workspace_analyze', 'host')).toBe('read');
    expect(
      isToolPermitted('zernio__create_post', 'privileged', 'gateway'),
    ).toBe(true);
    for (const capability of ['read-only', 'lane-report'] as const) {
      expect(
        isToolPermitted('zernio__create_post', capability, 'gateway'),
      ).toBe(false);
      // A read-class name served by the gateway is still a gateway tool.
      expect(
        isToolPermitted('ptah_workspace_analyze', capability, 'gateway'),
      ).toBe(false);
    }
  });
});
