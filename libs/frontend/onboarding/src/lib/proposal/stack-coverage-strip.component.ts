import {
  afterNextRender,
  ElementRef,
  Injector,
  inject,
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
  input,
  output,
} from '@angular/core';
import {
  PtahButtonDirective,
  PtahSkeletonComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';
import type { StackCoverageItem } from './stack-coverage';

@Component({
  selector: 'ptah-stack-coverage-strip',
  standalone: true,
  imports: [PtahButtonDirective, PtahSkeletonComponent, PtahStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stack-coverage-strip.component.html',
})
export class StackCoverageStripComponent {
  public readonly items = input<StackCoverageItem[]>([]);
  public readonly activeItem = input<string | null>(null);
  public readonly loading = input(false);
  public readonly filterChanged = output<string | null>();
  protected readonly coveredCount = computed(
    () => this.items().filter((item) => item.state === 'covered').length,
  );
  private readonly expandedState = signal(false);
  protected readonly expanded = this.expandedState.asReadonly();
  protected readonly visibleItems = computed(() =>
    this.expanded() || this.items().length <= 12
      ? this.items()
      : this.items().slice(0, 11),
  );
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected expand(): void {
    const firstNew = this.items()[11];
    afterNextRender(
      () => {
        if (firstNew)
          this.host.nativeElement
            .querySelector<HTMLButtonElement>(
              `button[aria-describedby="${this.descriptionId(firstNew)}"]`,
            )
            ?.focus();
      },
      { injector: this.injector },
    );
    this.expandedState.set(true);
  }
  protected readonly skeletons = [1, 2, 3, 4, 5, 6];
  protected descriptionId(item: StackCoverageItem): string {
    return `stack-evidence-${encodeURIComponent(item.kind + ':' + item.name)}`;
  }
  protected status(
    item: StackCoverageItem,
  ): 'completed' | 'pending' | 'warning' {
    return item.state === 'covered'
      ? 'completed'
      : item.state === 'available'
        ? 'pending'
        : 'warning';
  }
  protected summary(item: StackCoverageItem): string {
    return item.state === 'failed'
      ? 'search failed'
      : item.state === 'none'
        ? 'no match'
        : item.state === 'available'
          ? `${item.totalCount} available`
          : `${item.selectedCount} selected`;
  }
  protected accessibleName(item: StackCoverageItem): string {
    return item.state === 'covered'
      ? `${item.name}, covered by ${item.selectedCount} selected ${item.selectedCount === 1 ? 'skill' : 'skills'}`
      : `${item.name}, ${this.summary(item)}`;
  }
}
