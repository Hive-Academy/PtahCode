import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type { SurfaceLeaderboardProps } from '@ptah-extension/shared';
import { surfaceIcon } from './surface-icons';

@Component({
  selector: 'ptah-dashboard-leaderboard',
  standalone: true,
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex min-w-0 flex-col gap-2 tabular-nums" [attr.aria-label]="title() ?? 'Leaderboard'">
      @if (title(); as title) {
        <h3 class="text-sm font-semibold">{{ title }}</h3>
      }
      @for (group of groups(); track $index) {
        @if (group.title || group.icon) {
          <div class="flex items-center gap-2 text-xs font-semibold text-base-content-muted">
            @if (group.icon; as glyph) {
              <lucide-angular [img]="glyph" class="h-4 w-4 shrink-0" aria-hidden="true" />
            }
            @if (group.title; as title) {
              <span>{{ title }}</span>
            }
          </div>
        }
        <ol class="flex flex-col gap-1" [attr.aria-label]="group.title ?? null">
          @for (row of group.entries; track $index) {
            <li class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 text-xs">
              <span class="sr-only">{{ row.label }}: {{ row.value }}, share {{ row.share }}%</span>
              <span class="inline-flex h-5 w-5 items-center justify-center rounded-md bg-base-content/10 text-[11px]"
                aria-hidden="true">{{ $index + 1 }}</span>
              <span class="truncate" aria-hidden="true" [attr.title]="row.label">{{ row.label }}</span>
              <span class="flex items-center justify-end gap-2" aria-hidden="true">
                <span class="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-base-content/10">
                  <span class="block h-full rounded-full bg-primary" [style.width.%]="row.share"></span>
                </span>
                <span class="min-w-10 text-right font-semibold">{{ row.value }}</span>
              </span>
              @if (row.detail; as detail) {
                <span class="col-start-2 col-span-2 break-words text-base-content-muted">{{ detail }}</span>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class DashboardLeaderboardComponent {
  public readonly node = input.required<SurfaceLeaderboardProps>();
  protected readonly title = computed(() => this.node().title?.trim() || undefined);
  protected readonly groups = computed(() => this.node().groups.map(group => ({
    title: group.title?.trim() || undefined,
    icon: surfaceIcon(group.icon),
    entries: group.entries.map(entry => {
      const share = Number.isFinite(entry.share) ? Math.min(100, Math.max(0, entry.share)) : 0;
      return { ...entry, share, value: entry.value ?? `${share}%` };
    }),
  })));
}
