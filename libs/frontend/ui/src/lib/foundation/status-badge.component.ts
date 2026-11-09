import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PtahStatus = 'running' | 'queued' | 'pending' | 'needs-review' | 'warning' | 'failed' | 'offline' | 'completed' | 'online';

@Component({
  selector: 'ptah-ui-status-badge', standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge badge-sm gap-1.5 text-xs"><span aria-hidden="true" class="inline-block size-2 shrink-0" [class.rounded-full]="ink() === 'run' || ink() === 'idle' || ink() === 'done'" [class.border]="ink() === 'run' || ink() === 'idle'" [class.border-state-run]="ink() === 'run'" [class.animate-pulse]="ink() === 'run'" [class.motion-reduce:animate-none]="ink() === 'run'" [class.rotate-45]="ink() === 'need'" [class.bg-state-need]="ink() === 'need'" [class.bg-state-err]="ink() === 'err'" [class.bg-state-done]="ink() === 'done'"></span><span>{{ label() ?? displayLabel() }}</span></span>`,
})
export class PtahStatusBadgeComponent {
  readonly status = input.required<PtahStatus>();
  readonly label = input<string | null>(null);
  readonly ink = computed(() => {
    switch (this.status()) {
      case 'running': return 'run';
      case 'queued': case 'pending': return 'idle';
      case 'needs-review': case 'warning': return 'need';
      case 'failed': case 'offline': return 'err';
      case 'completed': case 'online': return 'done';
    }
  });
  readonly displayLabel = computed(() => this.status().replace('-', ' '));
}
