import type { ChildSettingSource, EffortLevel } from '@ptah-extension/shared';

export interface ChildSettingRoute {
  readonly model?: string;
  readonly effort?: EffortLevel;
  readonly modelSource: ChildSettingSource;
  readonly effortSource: ChildSettingSource;
}

export interface IChildSettingRouter {
  route(input: {
    readonly brief: string;
    readonly models: readonly string[];
    readonly model?: string;
    readonly effort?: EffortLevel;
  }): Promise<ChildSettingRoute>;
}
