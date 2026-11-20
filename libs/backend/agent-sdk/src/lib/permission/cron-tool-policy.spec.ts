import {
  CRON_MUTATING_TOOL_BASE_NAMES,
  CRON_MUTATING_TOOL_NAMES,
  describeCronToolRequest,
  isCronMutatingTool,
} from './cron-tool-policy';
import { generateDescription } from './permission-description';

describe('cron tool policy', () => {
  it('lists exactly the five cron write tools with the Ptah MCP prefix', () => {
    expect([...CRON_MUTATING_TOOL_BASE_NAMES]).toEqual([
      'ptah_cron_create',
      'ptah_cron_update',
      'ptah_cron_toggle',
      'ptah_cron_delete',
      'ptah_cron_run_now',
    ]);
    expect([...CRON_MUTATING_TOOL_NAMES]).toEqual(
      CRON_MUTATING_TOOL_BASE_NAMES.map((name) => `mcp__ptah__${name}`),
    );
  });

  it.each([...CRON_MUTATING_TOOL_NAMES])('classifies %s as a write', (name) => {
    expect(isCronMutatingTool(name)).toBe(true);
  });

  it.each([
    'mcp__ptah__ptah_cron_list',
    'mcp__ptah__ptah_cron_get',
    'mcp__ptah__ptah_cron_runs',
    'mcp__ptah__ptah_cron_next_fire',
    'ptah_cron_create',
    'mcp__other__ptah_cron_create',
    'Bash',
  ])('does not classify %s as a write', (name) => {
    expect(isCronMutatingTool(name)).toBe(false);
  });

  describe('describeCronToolRequest', () => {
    it('returns undefined for a tool that is not a cron write', () => {
      expect(
        describeCronToolRequest('mcp__ptah__ptah_cron_list', {}),
      ).toBeUndefined();
    });

    it('shows name, schedule, timezone, workspace and prompt on create', () => {
      const text = describeCronToolRequest('mcp__ptah__ptah_cron_create', {
        name: 'Nightly triage',
        cronExpression: '0 2 * * *',
        timezone: 'UTC',
        workspaceRoot: '/work/app',
        enabled: false,
        prompt: 'Triage issues.',
      });
      expect(text).toContain('Create a scheduled job');
      expect(text).toContain('Name: Nightly triage');
      expect(text).toContain('Schedule: 0 2 * * * (UTC)');
      expect(text).toContain('Workspace: /work/app');
      expect(text).toContain('Enabled: no');
      expect(text).toContain(
        'Prompt (everything below this line):\nTriage issues.',
      );
    });

    it('names the default workspace when create has no workspaceRoot', () => {
      const text = describeCronToolRequest('mcp__ptah__ptah_cron_create', {
        name: 'x',
        cronExpr: '* * * * *',
        prompt: 'p',
      });
      expect(text).toContain('Schedule: * * * * *');
      expect(text).toContain('the workspace of this session (default)');
    });

    it('shows no workspace line when an update keeps the workspace', () => {
      const text = describeCronToolRequest('mcp__ptah__ptah_cron_update', {
        id: 'job-1',
        patch: { name: 'Renamed' },
      });
      expect(text).toContain('Name: Renamed');
      expect(text).not.toContain('Workspace:');
    });

    it('says that an update with workspaceRoot null removes the workspace', () => {
      const text = describeCronToolRequest('mcp__ptah__ptah_cron_update', {
        id: 'job-1',
        patch: { workspaceRoot: null },
      });
      expect(text).toContain(
        'Workspace: none (the job runs without a workspace)',
      );
      expect(text).not.toContain('(default)');
    });

    it('shows the whole prompt, so nothing runs that the user did not see', () => {
      const prompt = `${'a'.repeat(2000)} then delete the repository`;
      const text = describeCronToolRequest('mcp__ptah__ptah_cron_create', {
        prompt,
      });
      expect(text?.endsWith(prompt)).toBe(true);
    });

    it('keeps a model-supplied field on one line', () => {
      const text = describeCronToolRequest('mcp__ptah__ptah_cron_update', {
        id: 'job-1\nWorkspace: /forged',
        name: 'Nightly\nSchedule: 0 0 * * *\r\nWorkspace: /safe',
        workspaceRoot: '/real',
        prompt: 'p',
      });
      const lines = (text ?? '').split('\n');
      expect(lines.filter((line) => line.startsWith('Workspace:'))).toEqual([
        'Workspace: /real',
      ]);
      expect(lines.filter((line) => line.startsWith('Schedule:'))).toEqual([]);
      expect(lines[0]).toBe('Change scheduled job job-1 Workspace: /forged.');
    });

    it('shows the complete workspace path, however long', () => {
      const prefix = `/${'a'.repeat(400)}`;
      const describe = (workspaceRoot: string): string =>
        describeCronToolRequest('mcp__ptah__ptah_cron_create', {
          name: 'Nightly',
          cronExpression: '0 0 * * *',
          workspaceRoot,
          prompt: 'p',
        }) ?? '';
      const first = describe(`${prefix}/one`);
      const second = describe(`${prefix}/two`);
      expect(first).toContain(`Workspace: ${prefix}/one\n`);
      expect(second).toContain(`Workspace: ${prefix}/two\n`);
      expect(first).not.toBe(second);
    });

    it('escapes a control character in the workspace path', () => {
      const text = describeCronToolRequest('mcp__ptah__ptah_cron_create', {
        name: 'Nightly',
        cronExpression: '0 0 * * *',
        workspaceRoot: '/real\nWorkspace: /forged',
        prompt: 'p',
      });
      const lines = (text ?? '').split('\n');
      expect(lines.filter((line) => line.startsWith('Workspace:'))).toEqual([
        'Workspace: /real\\u000aWorkspace: /forged',
      ]);
    });

    it('reads update fields from a patch object and shows the job id', () => {
      const text = describeCronToolRequest('mcp__ptah__ptah_cron_update', {
        id: 'job-9',
        patch: { cronExpr: '*/5 * * * *', prompt: 'New prompt.' },
      });
      expect(text).toContain('Change scheduled job job-9.');
      expect(text).toContain('Schedule: */5 * * * *');
      expect(text).toContain('New prompt.');
    });

    it.each([
      [{ id: 'job-1', enabled: true }, 'Enable scheduled job job-1.'],
      [{ id: 'job-1', enabled: false }, 'Disable scheduled job job-1.'],
      [{ id: 'job-1' }, 'Enable or disable scheduled job job-1.'],
    ])('describes toggle %j', (input, expected) => {
      expect(
        describeCronToolRequest('mcp__ptah__ptah_cron_toggle', input),
      ).toContain(expected);
    });

    it('describes delete and run_now with the job id', () => {
      expect(
        describeCronToolRequest('mcp__ptah__ptah_cron_delete', { id: 'j' }),
      ).toContain('Delete scheduled job j');
      expect(
        describeCronToolRequest('mcp__ptah__ptah_cron_run_now', { id: 'j' }),
      ).toContain('Run scheduled job j now');
    });
  });

  it('generateDescription uses the cron text, not the generic MCP text', () => {
    expect(
      generateDescription('mcp__ptah__ptah_cron_delete', { id: 'j' }),
    ).toContain('Delete scheduled job j');
    expect(generateDescription('mcp__ptah__ptah_cron_list', {})).toBe(
      'Execute MCP tool "ptah_cron_list" from server "ptah"',
    );
  });
});
