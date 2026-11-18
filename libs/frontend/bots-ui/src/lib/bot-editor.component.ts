import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import type { InstalledSkill } from '@ptah-extension/shared';
import {
  NativeDropdownComponent,
  PtahButtonDirective,
  PtahIconButtonDirective,
  PtahToggleDirective,
} from '@ptah-extension/ui';
import { BotsStore } from './bots.store';
import { BotIdentityRuntimeSectionComponent } from './bot-identity-runtime-section.component';
import { BotSkillsToolsSectionComponent } from './bot-skills-tools-section.component';
import { BotMemoryApprovalSectionComponent } from './bot-memory-approval-section.component';
import {
  BotDeleteDialogComponent,
  type BotRemovalIntent,
} from './bot-delete-dialog.component';
import {
  BotSaveBarComponent,
  type BotSaveDisplayState,
} from './bot-save-bar.component';
import { BotConflictDrawerComponent } from './bot-conflict-drawer.component';

@Component({
  selector: 'ptah-bot-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NativeDropdownComponent,
    PtahButtonDirective,
    PtahIconButtonDirective,
    PtahToggleDirective,
    BotIdentityRuntimeSectionComponent,
    BotSkillsToolsSectionComponent,
    BotMemoryApprovalSectionComponent,
    BotDeleteDialogComponent,
    BotSaveBarComponent,
    BotConflictDrawerComponent,
  ],
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      fieldset {
        min-width: 0;
      }
      fieldset[disabled] {
        opacity: 0.75;
      }
    `,
  ],
  template: `@if (store.draft(); as draft) {
    <article #editor aria-labelledby="bot-editor-title">
      <header class="flex flex-wrap items-center gap-3 py-4">
        <h2 id="bot-editor-title" class="text-lg font-semibold">
          {{ isNew() ? 'New bot' : store.selected()?.name }}
        </h2>
        <span>{{
          archived() ? 'Archived' : draft.enabled ? 'Enabled' : 'Disabled'
        }}</span>
        @if (!isNew()) {
          <span class="text-xs font-mono">Revision {{ draft.revision }}</span>
          <label class="flex items-center gap-2">
            <input
              ptahToggle
              type="checkbox"
              role="switch"
              [checked]="draft.enabled"
              aria-describedby="bot-enabled-hint"
              [disabled]="ordinaryBlocked()"
              (change)="toggle($event)"
            />Enabled
          </label>
          <span id="bot-enabled-hint" class="text-xs"
            >Applies at once. Does not save other edits.</span
          >
          <ptah-native-dropdown
            [isOpen]="menuOpen()"
            [panelRole]="null"
            placement="bottom-end"
            (opened)="focusMenu()"
            (closed)="closeMenu()"
          >
            <button
              #menuTrigger
              trigger
              type="button"
              ptahIconButton
              label="More actions"
              aria-haspopup="menu"
              [attr.aria-expanded]="menuOpen()"
              [disabled]="restoreBlocked()"
              (click)="menuOpen.set(!menuOpen())"
            >
              ⋯
            </button>
            <div
              content
              #menuPanel
              role="menu"
              tabindex="-1"
              aria-label="Bot actions"
              class="menu rounded-lg bg-base-100 p-2 shadow-lg"
              (keydown)="menuKeydown($event)"
            >
              @if (archived()) {
                <button
                  type="button"
                  role="menuitem"
                  ptahButton
                  variant="ghost"
                  [disabled]="restoreBlocked()"
                  (click)="closeMenu(); restore()"
                >
                  Restore
                </button>
              } @else {
                <button
                  type="button"
                  role="menuitem"
                  ptahButton
                  variant="ghost"
                  [disabled]="ordinaryBlocked()"
                  (click)="closeMenu(); focusName()"
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  ptahButton
                  variant="ghost"
                  [disabled]="ordinaryBlocked()"
                  (click)="closeMenu(); changeEnabled()"
                >
                  {{ draft.enabled ? 'Disable' : 'Enable' }}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  ptahButton
                  variant="ghost"
                  [disabled]="ordinaryBlocked()"
                  (click)="closeMenu(); openRemoval()"
                >
                  Archive
                </button>
              }
              <hr />
              <button
                type="button"
                role="menuitem"
                ptahButton
                variant="ghost"
                tone="danger"
                [disabled]="restoreBlocked()"
                (click)="closeMenu(); openRemoval()"
              >
                Delete…
              </button>
            </div>
          </ptah-native-dropdown>
        }
      </header>
      <div role="note" class="border border-base-300 rounded-lg p-4 mb-4">
        <h3 class="font-semibold">Bots cannot start yet</h3>
        <p>
          Execution is not available yet. You can save a bot's definition now.
        </p>
      </div>
      @if (archived()) {
        <div
          role="note"
          class="border border-dashed border-base-300 rounded-lg p-4"
        >
          <h3>This bot is archived</h3>
          <p>It keeps its memory and history. Restore it to edit it.</p>
          <button
            type="button"
            ptahButton
            [disabled]="restoreBlocked()"
            (click)="restore()"
          >
            Restore
          </button>
        </div>
      } @else if (!draft.enabled && !isNew()) {
        <div role="note">
          <h3>This bot is disabled</h3>
          <p>
            You can still edit it. A disabled bot will not start from any
            trigger.
          </p>
        </div>
      }
      @if (!store.conflict() && store.error(); as error) {
        <div role="alert" class="border border-error rounded-lg p-4 my-4">
          <h3>Could not complete the action</h3>
          <p>{{ error.message }}</p>
          <p>Your changes are still here.</p>
          @if (!archived() && !store.conflict()) {
            <button
              type="button"
              ptahButton
              [disabled]="ordinaryBlocked()"
              (click)="save()"
            >
              Retry save
            </button>
          }
        </div>
      }
      <ptah-bot-conflict-drawer
        [conflict]="store.conflict()"
        [isOpen]="comparing()"
        [busy]="store.readonly()"
        (compare)="comparing.set(true)"
        (closed)="comparing.set(false)"
        (editMine)="editMine()"
        (resubmit)="resubmit()"
        (loadLatest)="loadLatest()"
      />
      <form novalidate (submit)="submit($event)">
        <fieldset [disabled]="fieldsBlocked()">
          <legend class="sr-only">Bot definition</legend>
          <ptah-bot-identity-runtime-section />
          <ptah-bot-skills-tools-section
            [installedSkills]="installedSkills()"
            [knownToolIds]="knownToolIds()"
            [catalogLoaded]="
              catalogLoaded() && !catalogLoading() && !catalogFailed()
            "
            [catalogLoading]="catalogLoading()"
            [catalogFailed]="catalogFailed()"
          />
          <ptah-bot-memory-approval-section />
        </fieldset>
        @if (!archived()) {
          <ptah-bot-save-bar
            [state]="displayState()"
            [isNew]="isNew()"
            [revision]="draft.revision"
            [invalidCount]="invalidCount()"
            [blocked]="
              store.readonly() ||
              (store.blockedReason() !== null &&
                store.blockedReason() !== 'conflict')
            "
            (save)="save()"
            (discard)="discard()"
          />
        }
      </form>
      <ptah-bot-delete-dialog
        [isOpen]="removing()"
        [name]="store.selected()?.name ?? draft.definition.name"
        [archived]="archived()"
        [dirty]="store.dirty()"
        (cancelled)="removing.set(false)"
        (confirmed)="remove($event)"
      />
    </article>
  }`,
})
export class BotEditorComponent {
  protected readonly store = inject(BotsStore);
  private readonly injector = inject(Injector);
  public readonly installedSkills = input<readonly InstalledSkill[]>([]);
  public readonly knownToolIds = input<readonly string[]>([]);
  public readonly catalogLoaded = input(false);
  public readonly catalogLoading = input(false);
  public readonly catalogFailed = input(false);
  private readonly editor = viewChild<ElementRef<HTMLElement>>('editor');
  private readonly menuTrigger =
    viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  private readonly menuPanel = viewChild<ElementRef<HTMLElement>>('menuPanel');
  private readonly selection = computed(
    () => this.store.selected()?.id ?? null,
  );
  protected readonly comparing = linkedSignal({
    source: () => this.store.conflict(),
    computation: () => false,
  });
  protected readonly editingConflict = linkedSignal({
    source: () => this.store.conflict() !== null,
    computation: () => false,
  });
  protected readonly removing = linkedSignal({
    source: this.selection,
    computation: () => false,
  });
  protected readonly menuOpen = linkedSignal({
    source: this.selection,
    computation: () => false,
  });
  private readonly attempted = linkedSignal({
    source: this.store.draftEpoch,
    computation: () => false,
  });
  protected readonly isNew = computed(() => !this.store.selected());
  protected readonly archived = computed(
    () => this.store.selected()?.archivedAt != null,
  );
  protected readonly ordinaryBlocked = computed(
    () => this.store.readonly() || this.store.blockedReason() !== null,
  );
  protected readonly fieldsBlocked = computed(
    () =>
      this.store.readonly() ||
      (this.store.blockedReason() !== null &&
        !(this.store.blockedReason() === 'conflict' && this.editingConflict())),
  );
  protected readonly restoreBlocked = computed(
    () =>
      this.store.saving() ||
      this.store.selecting() ||
      this.store.conflict() !== null,
  );
  protected readonly invalidCount = computed(
    () =>
      new Set(this.store.validation().map((issue) => issue.path.join('.')))
        .size,
  );
  protected readonly displayState = computed<BotSaveDisplayState>(() => {
    const state = this.store.saveState();
    if (this.store.saving()) return 'saving';
    if (this.store.conflict()) return 'conflict';
    if (this.attempted() && this.invalidCount()) return 'invalid';
    if (state === 'error' || state === 'saved') return state;
    if (this.isNew()) return 'new';
    return this.store.dirty() ? 'dirty' : 'pristine';
  });
  public constructor() {
    afterRenderEffect(() => {
      const isNew = this.isNew();
      if (isNew) untracked(() => this.focusName());
    });
  }
  public focusName(): void {
    this.editor()
      ?.nativeElement.querySelector<HTMLElement>('#bot-name')
      ?.focus();
  }
  public closeMenu(): void {
    this.menuOpen.set(false);
    this.menuTrigger()?.nativeElement.focus();
  }
  public focusMenu(): void {
    afterNextRender(
      () =>
        this.menuPanel()
          ?.nativeElement.querySelector<HTMLButtonElement>(
            'button:not([disabled])',
          )
          ?.focus(),
      { injector: this.injector },
    );
  }
  public menuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeMenu();
      return;
    }
    const buttons = Array.from(
      this.menuPanel()?.nativeElement.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])',
      ) ?? [],
    );
    const current = buttons.findIndex((button) => button === event.target);
    if (
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
      buttons.length
    ) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) %
              buttons.length;
      buttons[next]?.focus();
    }
  }
  public changeEnabled(): void {
    if (!this.ordinaryBlocked())
      void this.store.setEnabled(!this.store.draft()?.enabled);
  }
  public submit(event: Event): void {
    event.preventDefault();
    this.save();
  }
  public save(): void {
    if (this.ordinaryBlocked()) return;
    this.attempted.set(true);
    if (this.invalidCount()) {
      this.focusInvalid();
      return;
    }
    void this.store.save();
  }
  private focusInvalid(): void {
    const root = this.editor()?.nativeElement;
    if (!root) return;
    // Existing sections mark invalid fields. Fall back to the issue's section.
    const issue = this.store.validation()[0]?.path[0];
    const target =
      root.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      root.querySelector<HTMLElement>(
        issue === 'name'
          ? '#bot-name'
          : issue === 'instructions'
            ? '#bot-instructions'
            : issue === 'memoryScope'
              ? '#bot-memory-root'
              : 'ptah-bot-identity-runtime-section button',
      );
    target?.focus();
  }
  public async toggle(event: Event): Promise<void> {
    const checkbox = event.target;
    if (!(checkbox instanceof HTMLInputElement)) return;
    try {
      if (!this.ordinaryBlocked())
        await this.store.setEnabled(checkbox.checked);
    } finally {
      checkbox.checked = this.store.draft()?.enabled ?? false;
    }
  }
  public discard(): void {
    if (!this.store.readonly()) {
      this.store.discard();
      this.attempted.set(false);
    }
  }
  public editMine(): void {
    this.comparing.set(false);
    this.editingConflict.set(true);
    afterNextRender(() => this.focusName(), { injector: this.injector });
  }
  public resubmit(): void {
    if (this.store.readonly()) return;
    this.attempted.set(true);
    if (this.invalidCount()) {
      this.editMine();
      afterNextRender(() => this.focusInvalid(), { injector: this.injector });
      return;
    }
    void this.store.resubmitConflict();
  }
  public loadLatest(): void {
    if (!this.store.readonly()) this.store.loadConflictLatest();
  }
  public restore(): void {
    if (!this.restoreBlocked()) void this.store.restore();
  }
  public openRemoval(): void {
    if (!this.restoreBlocked()) this.removing.set(true);
  }
  public remove(intent: BotRemovalIntent): void {
    if (this.restoreBlocked()) return;
    this.removing.set(false);
    if (intent.kind === 'archive') void this.store.archive();
    else void this.store.delete(intent.retention);
  }
}
