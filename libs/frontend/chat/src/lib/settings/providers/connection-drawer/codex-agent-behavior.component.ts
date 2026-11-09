import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdvancedSettingsGroupComponent } from '../../advanced/advanced-settings-group.component';
import { CodexSandboxSettingComponent } from '../../advanced/codex-sandbox-setting.component';

/** Codex settings available from Credentials even before sign-in. */
@Component({
  selector: 'ptah-codex-agent-behavior',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdvancedSettingsGroupComponent, CodexSandboxSettingComponent],
  template: `
    <section class="flex flex-col gap-4" data-testid="codex-agent-behavior">
      <ptah-advanced-settings-group groupId="codex-agents" />
      <ptah-codex-sandbox-setting />
    </section>
  `,
})
export class CodexAgentBehaviorComponent {}
