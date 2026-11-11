import 'reflect-metadata';

import type { HarnessWorkspaceContextService } from '../workspace/harness-workspace-context.service';
import { HarnessWorkflowPromptService } from './harness-workflow-prompt.service';

type Mocked<T> = jest.Mocked<T>;

function buildService(): {
  service: HarnessWorkflowPromptService;
  workspaceContext: Mocked<HarnessWorkspaceContextService>;
} {
  const workspaceContext = {
    resolveWorkspaceContext: jest.fn().mockResolvedValue({
      projectName: 'acme-app',
      projectType: 'nx-monorepo',
      frameworks: ['NestJS', 'Angular'],
      languages: ['TypeScript'],
    }),
    getAvailableAgents: jest.fn().mockReturnValue([
      {
        id: 'codex',
        name: 'Codex CLI',
        description: 'OpenAI Codex CLI',
        type: 'cli',
        available: true,
      },
    ]),
    discoverAvailableSkills: jest.fn().mockReturnValue([
      {
        id: 'lint',
        name: 'Linter',
        description: 'runs lint',
        source: 'plugin',
        isActive: true,
      },
    ]),
    isWorkspaceEffectivelyEmpty: jest.fn().mockResolvedValue(false),
  } as unknown as Mocked<HarnessWorkspaceContextService>;

  const service = new HarnessWorkflowPromptService(workspaceContext);
  return { service, workspaceContext };
}

describe('HarnessWorkflowPromptService', () => {
  it.each([false, true])(
    'composes a context-only preamble for empty workspace = %s',
    async (isEmpty) => {
      const { service, workspaceContext } = buildService();
      workspaceContext.isWorkspaceEffectivelyEmpty.mockResolvedValue(isEmpty);

      const { prompt } = await service.composePrompt({
        mode: 'configure-harness',
        contextOnly: true,
      });

      expect(prompt).toContain('acme-app');
      expect(prompt).toContain('proposeConfig');
      expect(prompt).toContain('What Apply Writes');
      expect(prompt.includes('## Empty Workspace')).toBe(isEmpty);
      expect(prompt).not.toContain("## User's Intent");
      expect(prompt).not.toContain('undefined');
    },
  );

  it('composes a prompt containing workspace context, the proposeConfig instruction, and the user intent', async () => {
    const { service, workspaceContext } = buildService();

    const { prompt } = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'build a real estate CRM harness',
    });

    expect(workspaceContext.resolveWorkspaceContext).toHaveBeenCalled();
    expect(prompt).toContain('acme-app');
    expect(prompt).toContain('NestJS');
    expect(prompt).toContain('proposeConfig');
    expect(prompt).toContain('isConfigComplete');
    expect(prompt).toContain('build a real estate CRM harness');
    expect(prompt).toContain('Codex CLI');
    expect(prompt).toContain('Linter');
  });

  it('renders "(none discovered)" when no skills are available', async () => {
    const { service, workspaceContext } = buildService();
    workspaceContext.discoverAvailableSkills.mockReturnValue([]);

    const { prompt } = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'anything',
    });

    expect(prompt).toContain('(none discovered)');
  });

  it('frames the session as a team Ptah runs, not a product build', async () => {
    const { service } = buildService();

    const { prompt } = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'a social media team',
    });

    expect(prompt).toContain('a team that Ptah itself runs');
    expect(prompt).toMatch(/not an application/i);
    expect(prompt).toContain('Setup > New project');
    expect(prompt).not.toMatch(/coding assistant configuration/i);
    expect(prompt).toContain('drive the configuration to completion');
  });

  it('interviews about the work in an empty workspace and plans no project', async () => {
    const { service, workspaceContext } = buildService();
    workspaceContext.isWorkspaceEffectivelyEmpty.mockResolvedValue(true);

    const { prompt } = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'a social media team',
    });

    expect(prompt).toContain('## Empty Workspace');
    expect(prompt).toMatch(/interview the user about the work/i);
    expect(prompt).not.toContain('Project Planning');
    expect(prompt).not.toMatch(/propose an architecture/i);
    expect(prompt.indexOf('## Empty Workspace')).toBeLessThan(
      prompt.indexOf('## Available Agents'),
    );
  });

  it('leaves the empty workspace block out when the workspace has files', async () => {
    const { service } = buildService();

    const { prompt } = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'anything',
    });

    expect(prompt).not.toContain('## Empty Workspace');
  });

  it('names no Claude-only tool in either variant', async () => {
    const { service, workspaceContext } = buildService();
    const forbidden =
      /AskUserQuestion|TodoWrite|WebFetch|\bGlob\b|\bGrep\b|\bSkill tool\b|`Skill`/;

    const nonEmpty = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'anything',
    });
    expect(nonEmpty.prompt).not.toMatch(forbidden);

    workspaceContext.isWorkspaceEffectivelyEmpty.mockResolvedValue(true);
    const empty = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'anything',
    });
    expect(empty.prompt).not.toMatch(forbidden);
  });

  it('tells the user what Apply writes in both variants', async () => {
    const { service, workspaceContext } = buildService();

    const nonEmpty = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'anything',
    });
    expect(nonEmpty.prompt).toContain('.claude/CLAUDE.md');
    expect(nonEmpty.prompt).toContain('.claude/agents/');
    expect(nonEmpty.prompt).toContain('.claude/skills/');

    workspaceContext.isWorkspaceEffectivelyEmpty.mockResolvedValue(true);
    const empty = await service.composePrompt({
      mode: 'configure-harness',
      intent: 'anything',
    });
    expect(empty.prompt).toContain('.claude/CLAUDE.md');
    expect(empty.prompt).toContain('.claude/agents/');
    expect(empty.prompt).toContain('.claude/skills/');
  });
});
