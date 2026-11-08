import { Injectable, inject } from '@angular/core';
import { ProvidersSettingsStateService } from '@ptah-extension/core';
import type { CliLaneDefaults, CliType } from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';

type Choice = NonNullable<CliLaneDefaults[CliType]>;

@Injectable()
export class CliLaneDefaultsStore {
  private readonly state = inject(ProvidersSettingsStateService);
  private readonly feedback = inject(SettingsSaveFeedbackService);

  async save(cli: CliType, name: string, choice: Choice): Promise<void> {
    const context = this.state.reviewContext();
    if (!context || this.feedback.saving()) return;
    const previous = this.state.orchestration().data?.cliLaneDefaults?.[cli];
    const write = (value: Choice) => () => this.state.saveSettings(
      { orchestration: { cliLaneDefaults: { [cli]: value } } }, context,
    );
    await this.feedback.save({ label: `${name} lane default`, scope: 'global',
      write: write(choice), undo: previous ? write(previous) : null });
  }

  async reset(cli: CliType, name: string): Promise<void> {
    const context = this.state.reviewContext();
    const previous = this.state.orchestration().data?.cliLaneDefaults?.[cli];
    if (!context || !previous || this.feedback.saving()) return;
    await this.feedback.save({ label: `${name} lane default`, scope: 'global',
      write: () => this.state.saveSettings({ orchestration: { cliLaneDefaults: { [cli]: null } } }, context),
      undo: () => this.state.saveSettings({ orchestration: { cliLaneDefaults: { [cli]: previous } } }, context) });
  }
}
