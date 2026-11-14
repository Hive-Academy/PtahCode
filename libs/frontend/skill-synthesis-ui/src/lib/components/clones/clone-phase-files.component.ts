/**
 * The phase-file rows of a skill clone (U-D13 (1)).
 *
 * A skill that has a `phases/` folder lists each phase file here. Each row has
 * Enhance, a History toggle and a one-file revert per snapshot. The parent
 * drawer owns the gating: it passes whether enhance and revert are enabled,
 * and it renders this list only for a skill that is not a retired role.
 */
import {
  ChangeDetectionStrategy,
  Component,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { PtahButtonDirective } from '@ptah-extension/ui';
import type {
  SkillCloneHistoryEntry,
  SkillClonePhaseFile,
} from '@ptah-extension/shared';

import { formatHistoryTimestamp } from './clone-action-gating';

/** A one-file revert of a phase file to a folder snapshot. */
export interface PhaseFileRevertRequest {
  readonly file: SkillClonePhaseFile;
  readonly ts: string;
}

@Component({
  selector: 'ptah-clone-phase-files',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective],
  template: `
    <section class="space-y-2" data-testid="drawer-phase-files">
      <h3 class="text-xs font-medium text-base-content-muted">
        Phase files
        <span class="font-normal text-base-content-muted"
          >({{ files().length }})</span
        >
      </h3>
      <p class="text-[11px] text-base-content-muted">
        Snapshots hold the whole folder. A revert here restores only the
        selected phase file.
      </p>
      <ul class="space-y-1">
        @for (file of files(); track file) {
          <li
            class="space-y-1 rounded-lg border border-base-300 bg-base-200/30 px-3 py-2"
            data-testid="drawer-phase-file"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="min-w-0 truncate font-mono text-xs">{{ file }}</span>
              <span class="flex items-center gap-1">
                <button
                  type="button"
                  ptahButton
                  variant="ghost"
                  size="xs"
                  data-testid="drawer-phase-enhance-btn"
                  [disabled]="!enhanceEnabled() || busy()"
                  [title]="enhanceTitle()"
                  (click)="enhance.emit(file)"
                >
                  Enhance
                </button>
                <button
                  type="button"
                  ptahButton
                  variant="ghost"
                  size="xs"
                  data-testid="drawer-phase-history-btn"
                  [attr.aria-expanded]="openFile() === file"
                  (click)="toggle(file)"
                >
                  History
                </button>
              </span>
            </div>
            @if (openFile() === file) {
              @if (history().length === 0) {
                <p
                  class="text-[11px] text-base-content-muted"
                  data-testid="drawer-phase-history-empty"
                >
                  No snapshots yet.
                </p>
              } @else {
                <ol class="space-y-1" data-testid="drawer-phase-history">
                  @for (h of history(); track h.ts) {
                    <li class="flex items-center justify-between gap-2">
                      <span class="text-xs tabular-nums">{{
                        formatTs(h.ts)
                      }}</span>
                      <button
                        type="button"
                        ptahButton
                        variant="ghost"
                        size="xs"
                        data-testid="drawer-phase-revert-btn"
                        [disabled]="!revertEnabled() || busy()"
                        [title]="revertTitle()"
                        (click)="revert.emit({ file, ts: h.ts })"
                      >
                        Revert this file
                      </button>
                    </li>
                  }
                </ol>
              }
            }
          </li>
        }
      </ul>
    </section>
  `,
})
export class ClonePhaseFilesComponent {
  public readonly files = input.required<readonly SkillClonePhaseFile[]>();
  public readonly history = input<readonly SkillCloneHistoryEntry[]>([]);
  public readonly busy = input(false);
  public readonly enhanceEnabled = input(false);
  public readonly enhanceTitle = input('');
  public readonly revertEnabled = input(false);
  public readonly revertTitle = input('');

  public readonly enhance = output<SkillClonePhaseFile>();
  public readonly revert = output<PhaseFileRevertRequest>();

  /** The row whose history is open. Reset when the file list changes. */
  protected readonly openFile = linkedSignal<
    readonly SkillClonePhaseFile[],
    SkillClonePhaseFile | null
  >({
    source: this.files,
    computation: () => null,
  });

  protected toggle(file: SkillClonePhaseFile): void {
    this.openFile.update((open) => (open === file ? null : file));
  }

  protected formatTs(ts: string): string {
    return formatHistoryTimestamp(ts);
  }
}
