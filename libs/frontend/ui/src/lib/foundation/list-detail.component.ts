import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { PtahButtonDirective } from '../button/button.directive';

/** Consumers using ngListbox must set selectionMode="explicit" so arrow keys do not hide the narrow list. */
@Component({
  selector: 'ptah-list-detail', standalone: true, imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block [container-type:inline-size]' },
  template: `<div class="surface-1 min-h-0 overflow-hidden rounded-ptah-surface" [class]="splitClasses().grid + ' ' + gridColumns()">
    <section #list class="min-w-0 overflow-auto border-surface-border" [class]="splitClasses().pane + ' ' + splitClasses().border" [class.hidden]="hasSelection()"><ng-content select="[list]" /></section>
    <section class="min-w-0 overflow-auto" [class]="splitClasses().pane" [class.hidden]="!hasSelection()">
      @if (hasSelection()) { <div class="px-ptah-surface pt-ptah-controls" [class]="splitClasses().back"><button #backButton ptahButton variant="ghost" size="xs" type="button" (click)="goBack()">{{ backLabel() }}</button></div><ng-content select="[detail]" /> }
      @else { <ng-content select="[empty]" /> }
    </section>
    @if (withMeta()) {
    <!-- Optional third column for consumers with separate metadata. -->
    <aside class="hidden min-w-0 border-l border-surface-border [@container(min-width:1200px)]:block"><ng-content select="[meta]" /></aside>
    }
  </div>`,
})
export class PtahListDetailComponent {
  /** Supported container split widths; literals keep Tailwind queries discoverable. */
  readonly splitAt = input<768 | 960>(768);
  protected readonly splitClasses = computed(() => this.splitAt() === 960 ? {
    grid: '[@container(min-width:960px)]:grid',
    pane: '[@container(min-width:960px)]:!block',
    border: '[@container(min-width:960px)]:border-r',
    back: '[@container(min-width:960px)]:hidden',
    columns: '[@container(min-width:960px)]:grid-cols-[320px_minmax(0,1fr)]',
    metaColumns: '[@container(min-width:960px)_and_(max-width:1199.98px)]:grid-cols-[320px_minmax(0,1fr)]',
  } : {
    grid: '[@container(min-width:768px)]:grid',
    pane: '[@container(min-width:768px)]:!block',
    border: '[@container(min-width:768px)]:border-r',
    back: '[@container(min-width:768px)]:hidden',
    columns: '[@container(min-width:768px)]:grid-cols-[320px_minmax(0,1fr)]',
    metaColumns: '[@container(min-width:768px)_and_(max-width:1199.98px)]:grid-cols-[320px_minmax(0,1fr)]',
  });
  readonly selectedId = input<string | null>(null);
  readonly hasSelection = computed(() => this.selectedId() !== null && this.selectedId() !== '');
  readonly backLabel = input('Back to list');
  /** Reserve a third column from 1200 px for the `[meta]` slot. Off by default so no empty column shows. */
  readonly withMeta = input(false);
  protected readonly gridColumns = computed(() =>
    this.withMeta()
      ? this.splitClasses().metaColumns + ' [@container(min-width:1200px)]:grid-cols-[320px_minmax(0,1fr)_280px]'
      : this.splitClasses().columns,
  );
  readonly back = output<void>();
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly backButton = viewChild<ElementRef<HTMLButtonElement>>('backButton');
  private previousSelection: string | null | undefined;
  private previousOption: HTMLElement | null = null;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    if (typeof ResizeObserver !== 'undefined') {
      let previousWidth = this.host.nativeElement.clientWidth;
      const observer = new ResizeObserver(([entry]) => {
        if (!entry) return;
        const width = entry.contentRect.width;
        if (previousWidth >= this.splitAt() && width < this.splitAt() && this.hasSelection()) {
          const list = this.list()?.nativeElement;
          if (list?.contains(document.activeElement)) {
            this.backButton()?.nativeElement.focus();
          }
        }
        previousWidth = width;
      });
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
    afterRenderEffect(() => {
      const selected = this.hasSelection() ? this.selectedId() : null;
      const list = this.list()?.nativeElement;
      const backButton = this.backButton()?.nativeElement;
      if (this.previousSelection === selected) return;
      const oldSelection = this.previousSelection;
      this.previousSelection = selected;
      if (!list || (list.parentElement?.clientWidth ?? 0) >= this.splitAt()) return;
      if (selected) {
        this.previousOption = list.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.querySelector<HTMLElement>(':focus');
        backButton?.focus();
      } else if (oldSelection) {
        (this.previousOption?.isConnected ? this.previousOption : list.querySelector<HTMLElement>('[ngOption]'))?.focus();
      }
    });
  }

  goBack(): void { this.back.emit(); }
}
