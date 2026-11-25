import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  DestroyRef,
  ElementRef,
  inject,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {
  PtahButtonDirective,
  PtahFormActionsComponent,
} from '@ptah-extension/ui';
import { LucideAngularModule, X } from 'lucide-angular';

export interface SelectedSkillItem {
  key: string;
  name: string;
}
let nextRailId = 0;

@Component({
  selector: 'ptah-skill-selection-rail',
  standalone: true,
  imports: [PtahButtonDirective, PtahFormActionsComponent, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.responsive]': 'responsive()',
    '[attr.data-layout]': 'layout()',
    '[class]':
      "layout() === 'rail' ? 'sticky top-6 block min-h-0' : 'sticky bottom-0 z-[var(--ptah-z-raised)] block w-full box-border'",
  },
  templateUrl: './skill-selection-rail.component.html',
  styleUrl: './skill-selection-rail.component.css',
})
export class SkillSelectionRailComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  public constructor() {
    afterNextRender(() => this.observeScrollHeight());
  }
  private observeScrollHeight(): void {
    const element = this.host.nativeElement;
    let scroller = element.parentElement;
    while (
      scroller &&
      !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
    ) {
      scroller = scroller.parentElement;
    }
    const measure = (): void => {
      const rect = scroller?.getBoundingClientRect();
      const bottom = Math.min(
        window.innerHeight,
        rect?.bottom ?? window.innerHeight,
      );
      const top = Math.max(
        0,
        rect?.top ?? 0,
        element.getBoundingClientRect().top,
      );
      element.style.setProperty(
        '--skill-rail-height',
        `${Math.max(0, bottom - top)}px`,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    observer?.observe(scroller ?? document.documentElement);
    window.addEventListener('resize', measure);
    scroller?.addEventListener('scroll', measure, { passive: true });
    this.destroyRef.onDestroy(() => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      scroller?.removeEventListener('scroll', measure);
    });
  }
  public readonly responsive = input(false);
  public readonly selected = input<SelectedSkillItem[]>([]);
  public readonly total = input(0);
  public readonly coveredCount = input(0);
  public readonly stackCount = input(0);
  public readonly busy = input(false);
  public readonly loading = input(false);
  public readonly previewing = input(false);
  public readonly previewScriptCount = input<number | null>(null);
  public readonly installBlockedReason = input<string | null>(null);
  public readonly layout = input<'rail' | 'bar'>('rail');
  public readonly primary = output<void>();
  public readonly skip = output<void>();
  public readonly removed = output<string>();
  protected readonly close = X;
  private readonly instanceId = nextRailId++;
  protected readonly helperId = `skill-selection-helper-${this.instanceId}`;
  protected readonly installBlockedId = `skill-selection-blocked-${this.instanceId}`;
  protected readonly selectedListId = `skill-selection-list-${this.instanceId}`;
  protected readonly selectedListOpen = signal(false);
  protected readonly normalizedInstallBlockedReason = computed(() => {
    const reason = this.installBlockedReason()?.trim() ?? '';
    return reason.length > 0 ? reason : null;
  });
  protected readonly blocked = computed(
    () => this.busy() || this.loading() || this.previewing(),
  );
  protected readonly primaryDisabled = computed(
    () => this.blocked() || this.normalizedInstallBlockedReason() !== null,
  );
  protected readonly primaryDescribedBy = computed(() => {
    if (this.normalizedInstallBlockedReason() !== null) {
      return this.installBlockedId;
    }
    return this.loading() ? null : this.helperId;
  });
  protected toggleSelectedList(): void {
    this.selectedListOpen.update((open) => !open);
  }
  protected onPrimaryClick(): void {
    if (this.primaryDisabled()) {
      return;
    }
    this.primary.emit();
  }
  protected readonly primaryLabel = computed(() =>
    this.previewing()
      ? 'Preparing install…'
      : this.loading() || !this.selected().length
        ? 'Continue without skills'
        : `Install ${this.selected().length} ${this.selected().length === 1 ? 'skill' : 'skills'} and continue`,
  );
  protected readonly scriptHelper = computed(() => {
    if (!this.selected().length || this.loading()) return null;
    const count = this.previewScriptCount();
    return count === null
      ? 'You approve skills that contain scripts before the install.'
      : count === 0
        ? null
        : count === 1
          ? '1 selected skill contains scripts. You approve it before the install.'
          : `${count} selected skills contain scripts. You approve them before the install.`;
  });
}
