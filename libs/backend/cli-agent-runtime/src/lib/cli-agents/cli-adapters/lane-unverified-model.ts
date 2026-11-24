/**
 * A next-spawn model no live list could check (M3).
 *
 * Copilot, Pi and OpenCode check a per-turn model against the CLI's own model
 * list. When that list is empty the model cannot be checked: it is still
 * taken (the spawn-time model is unchecked the same way), but the lane says
 * so, and a turn that fails with it drops it again. A typo therefore costs one
 * failed turn, not every later spawn.
 */
import type { CliOutputSegment } from '@ptah-extension/shared';
import {
  LaneTurnSettingRefusal,
  type CliModelInfo,
} from './cli-adapter.interface';

export class UnverifiedLaneModel {
  private unverified?: string;

  constructor(
    private readonly cliName: string,
    private readonly emit: (segment: CliOutputSegment) => void,
  ) {}

  /**
   * Refuses `model` when `known` lists models without it. With an empty list
   * the model is recorded as unchecked and an info segment says so.
   */
  accept(model: string, known: readonly CliModelInfo[]): void {
    if (known.length > 0) {
      if (!known.some((entry) => entry.id === model))
        throw new LaneTurnSettingRefusal('model', `${this.cliName} has no model "${model}".`);
      this.unverified = undefined;
      return;
    }
    this.unverified = model;
    this.emit({
      type: 'info',
      content: `${this.cliName} lists no models, so "${model}" was not checked. The next turn uses it.`,
    });
  }

  /**
   * Settles a turn that ran with `model`. A failed turn with the unchecked
   * model returns true: the caller drops it, and an info segment says so.
   * A successful turn proves the model.
   */
  settle(model: string | undefined, succeeded: boolean): boolean {
    if (model === undefined || model !== this.unverified) return false;
    this.unverified = undefined;
    if (succeeded) return false;
    this.emit({
      type: 'info',
      content: `The turn with the unchecked model "${model}" failed. The next turn uses the lane's model again.`,
    });
    return true;
  }
}
