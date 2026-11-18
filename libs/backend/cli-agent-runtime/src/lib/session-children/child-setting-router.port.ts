import type {
  ChildSettingSource,
  EffortLevel,
  PhaseKind,
} from '@ptah-extension/shared';

export type ChildWorkKind =
  'coordination' | 'code' | 'investigation' | 'design' | 'security';

export interface ChildSettingReason {
  readonly rule: string;
  readonly input: string;
}

export interface ChildSettingRoute {
  readonly model?: string;
  readonly effort?: EffortLevel;
  readonly reason: ChildSettingReason;
  readonly candidates: readonly string[];
  readonly modelSource: ChildSettingSource;
  readonly effortSource: ChildSettingSource;
}

export interface IChildSettingRouter {
  route(input: {
    readonly brief: string;
    readonly phaseKind?: PhaseKind;
    readonly workKind?: ChildWorkKind;
    readonly models: readonly string[];
    readonly model?: string;
    readonly effort?: EffortLevel;
  }): Promise<ChildSettingRoute>;
}
