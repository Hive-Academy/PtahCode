import { test, expect } from '../../support/fixtures';

test.describe('New project onboarding', () => {
  test('Home opens the intake and requires a brief', async ({ ui }) => {
    await ui.goto('onboarding');
    await ui.page.getByTestId('onboarding-path-link-new-project').click();
    await expect(ui.page.getByTestId('new-project-intake')).toBeVisible();
    await ui.page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      ui.page.getByTestId('new-project-intake').getByRole('alert'),
    ).toContainText('What are you building is required.');
  });

  test('submits the new intake and opens a chat tab', async ({
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
        seedPrompt: 'Plan a scheduling tool.',
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
    await ui.page
      .locator('#project-what')
      .fill('A scheduling tool for clinics');
    await ui.page.getByRole('button', { name: 'Continue' }).click();

    const call = await ui.waitForObservedCall('harness:start-new-project');
    expect(call.params).toEqual(
      expect.objectContaining({
        intake: expect.objectContaining({
          what: 'A scheduling tool for clinics',
          platform: 'node-ts',
          stack: 'recommend',
        }),
      }),
    );
    await expect(ui.page.locator('ptah-onboarding-shell')).toHaveCount(0);
    await expect(ui.page.locator('ptah-chat-view')).toBeVisible();
  });

  test('submits the .NET platform and stack in the wire payload', async ({
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
        seedPrompt: 'Plan it',
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
    const intake = ui.page.getByTestId('new-project-intake');
    await intake.locator('#project-what').fill('A clinic portal');
    await intake
      .getByRole('group', { name: 'Platform' })
      .getByRole('button', { name: '.NET' })
      .click();
    await intake
      .getByRole('group', { name: 'Stack' })
      .getByRole('button', { name: 'ASP.NET Core API only' })
      .click();
    await intake.getByRole('button', { name: 'Continue' }).click();
    const call = await ui.waitForObservedCall('harness:start-new-project');
    expect(call.params).toEqual(
      expect.objectContaining({
        intake: expect.objectContaining({
          platform: 'dotnet',
          stack: 'aspnetcore-api',
        }),
      }),
    );
    await expect(ui.page.locator('ptah-onboarding-shell')).toHaveCount(0);
    await expect(ui.page.locator('ptah-chat-view')).toBeVisible();
  });

  test('requires free text when Other stack is chosen', async ({ ui }) => {
    await ui.goto('onboarding');
    await ui.page.getByTestId('onboarding-path-link-new-project').click();
    const intake = ui.page.getByTestId('new-project-intake');
    await intake.locator('#project-what').fill('An inventory tracker');
    await intake
      .getByRole('group', { name: 'Stack' })
      .getByRole('button', { name: 'Other' })
      .click();
    await intake.getByRole('button', { name: 'Continue' }).click();
    await expect(intake.getByRole('alert')).toContainText('Enter your stack.');
    await intake.locator('#project-stack-other').fill('Ruby on Rails');
    await expect(intake.locator('#project-stack-other-error')).toHaveCount(0);
  });
});
