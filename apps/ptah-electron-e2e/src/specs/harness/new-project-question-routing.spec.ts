import { test, expect } from '../../support/fixtures';

const QUESTION_ID = '1f3a5c7e-9b2d-4e6f-8a1c-3d5e7f9a1b3c';

test('a new-project workflow question opens in the chat view and can be answered', async ({
  ui,
}) => {
  await ui.mockRpc({
    'harness:initialize': {
      workspaceEffectivelyEmpty: true,
      workspaceContext: {
        projectName: 'ptah-e2e-ws',
        projectType: 'unknown',
        frameworks: [],
        languages: [],
      },
      availableAgents: [],
      availableSkills: [],
      existingPresets: [],
      workspaceRoot: 'C:\\ptah-e2e-ws',
    },
    'harness:start-new-project': {
      success: true,
      seedPrompt: 'Plan a route-planning app.',
      plugins: {
        enabledBundled: [],
        missingExternal: [],
        availableSkillIds: [],
      },
    },
    'chat:start': { success: true },
  });
  await ui.goto('onboarding');
  await ui.page.getByTestId('onboarding-path-link-new-project').click();
  await ui.page.locator('#project-what').fill('A route-planning app');
  await ui.page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(ui.page.locator('ptah-onboarding-shell')).toHaveCount(0);
  await expect(ui.page.locator('ptah-chat-view')).toBeVisible();

  const call = await ui.waitForObservedCall('chat:start');
  const tabId = (call.params as { tabId?: string }).tabId;
  if (!tabId) throw new Error('New project did not start a chat tab');

  await ui.pushEvent({
    type: 'ask-user-question:request',
    payload: {
      id: QUESTION_ID,
      toolName: 'AskUserQuestion',
      questions: [
        {
          question: 'Which platform should we target first?',
          header: 'Platform',
          options: [
            { label: 'Web', description: 'Browser first' },
            { label: 'Mobile', description: 'iOS and Android first' },
          ],
          multiSelect: false,
        },
      ],
      toolUseId: 'tu-onboarding',
      timestamp: Date.now(),
      timeoutAt: 0,
      sessionId: tabId,
      tabId,
      surfaceMode: false,
    },
  });

  const card = ui.page.locator(
    `ptah-chat-view ptah-question-card[data-request-id="${QUESTION_ID}"]`,
  );
  await expect(card).toBeVisible();
  await card.locator('label', { hasText: 'Mobile' }).click();
  await card.getByRole('button', { name: 'Submit' }).click();
  const response = await ui.waitForObservedMessage(
    'ask-user-question:response',
  );
  expect(response.payload).toEqual({
    id: QUESTION_ID,
    answers: { 'Which platform should we target first?': 'Mobile' },
  });
});
