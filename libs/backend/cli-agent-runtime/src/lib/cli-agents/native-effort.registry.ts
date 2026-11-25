import { LANE_DEFAULT_MODEL } from '@ptah-extension/shared';
import type { EffortSupport } from '@ptah-extension/shared';
import type { CliModelInfo } from './cli-adapters/cli-adapter.interface';

type NativeEfforts = Extract<EffortSupport, { provenance: 'native' }>;

interface LaneEfforts {
  readonly models: Map<string, NativeEfforts>;
  readonly defaultModel?: string;
}

export class NativeEffortRegistry {
  private readonly lanes = new Map<string, LaneEfforts>();

  /** Replace the evidence for a CLI or a specific Ptah CLI row. */
  recordCatalog(laneKey: string, models: readonly CliModelInfo[]): void {
    const efforts = new Map<string, NativeEfforts>();
    for (const model of models) {
      if (model.efforts?.provenance === 'native') {
        efforts.set(model.id, model.efforts);
      }
    }
    const defaultModel = models.find((model) => model.isDefault === true)?.id;
    this.lanes.set(laneKey, { models: efforts, defaultModel });
  }

  /** Update one model from native evidence advertised by a live session. */
  recordSession(laneKey: string, model: string, efforts: EffortSupport): void {
    if (efforts.provenance !== 'native') return;

    const lane = this.lanes.get(laneKey);
    if (lane) {
      lane.models.set(model, efforts);
    } else {
      this.lanes.set(laneKey, { models: new Map([[model, efforts]]) });
    }
  }

  lookup(laneKey: string, model: string | undefined): EffortSupport {
    const lane = this.lanes.get(laneKey);
    if (lane) {
      const modelId =
        model === undefined || model === LANE_DEFAULT_MODEL
          ? lane.defaultModel
          : model;
      if (modelId !== undefined) {
        return lane.models.get(modelId) ?? { provenance: 'unknown' };
      }
    }
    return { provenance: 'unknown' };
  }
}
