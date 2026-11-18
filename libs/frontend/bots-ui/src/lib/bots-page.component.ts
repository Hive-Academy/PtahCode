import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import {
  ClaudeRpcService,
  ElectronLayoutService,
  WORKSPACE_COORDINATOR,
} from '@ptah-extension/core';
import type { BotSummary, InstalledSkill } from '@ptah-extension/shared';
import {
  PROVIDER_MODELS_LOADER,
  PtahAlertComponent,
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahCheckboxDirective,
  PtahInputDirective,
  PtahListDetailComponent,
  PtahSelectDirective,
  PtahSkeletonComponent,
  PtahStatePanelComponent,
} from '@ptah-extension/ui';
import { BotEditorComponent } from './bot-editor.component';
import { BotListRowComponent } from './bot-list-row.component';
import { BotsStore } from './bots.store';
import { BotsProviderModelsLoader } from './bots-provider-models-loader';

@Component({
  selector: 'ptah-bots-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BotEditorComponent,
    BotListRowComponent,
    PtahAlertComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahCheckboxDirective,
    PtahInputDirective,
    PtahListDetailComponent,
    PtahSelectDirective,
    PtahSkeletonComponent,
    PtahStatePanelComponent,
  ],
  providers: [
    BotsStore,
    { provide: PROVIDER_MODELS_LOADER, useClass: BotsProviderModelsLoader },
  ],
  styleUrl: './bots-page.css',
  template: `
    <header>
      <div>
        <h1>Bots</h1>
        <p>
          Saved bots: instructions, model, skills, memory and approval rules.
        </p>
      </div>
      @if (!empty()) {
        <button ptahButton type="button" (click)="newBot()" [disabled]="busy()">
          New bot
        </button>
      }
    </header>
    <ptah-alert tone="info" title="Bots cannot start yet" [compact]="true">
      You can create and edit bots now. Starting a bot, and triggers such as
      schedules and messages, come in later updates.
    </ptah-alert>
    @if (workspaceNotice()) {
      <p role="status" aria-live="polite">{{ workspaceNotice() }}</p>
    }
    @if (store.requiresCreateScope() || !store.workspaceRoots().length) {
      <label class="create-scope"
        >New bot scope
        <select ptahSelect (change)="setCreateScope($event)">
          <option value="" [selected]="createScope() === ''">
            Choose a scope
          </option>
          <option value="user" [selected]="createScope() === 'user'">
            User
          </option>
          @for (root of store.workspaceRoots(); track root) {
            <option [value]="root" [selected]="createScope() === root">
              {{ root }}
            </option>
          }
        </select>
      </label>
    }
    @if (!store.draft() && store.error(); as error) {
      <ptah-alert tone="error" live="assertive">{{ error.message }}</ptah-alert>
    }
    @if (empty()) {
      <ptah-state-panel
        state="empty"
        title="No bots yet"
        body="A bot keeps a name, instructions, a model, skills, memory and approval rules in one place. Create one to get started."
        actionLabel="New bot"
        (action)="newBot()"
      />
    } @else {
      <ptah-list-detail
        [splitAt]="960"
        [selectedId]="detailOpen() ? (store.selected()?.id ?? 'new') : null"
        backLabel="Back to bots"
        (back)="back()"
      >
        <div list class="roster" [attr.aria-busy]="store.loading()">
          <div class="filters">
            <label
              >Search bots<input
                ptahInput
                type="search"
                [disabled]="firstLoading()"
                [value]="search()"
                (input)="setSearch($event)"
            /></label>
            <label
              >Scope<select
                ptahSelect
                [value]="scope()"
                (change)="setScope($event)"
              >
                <option value="all">All scopes</option>
                <option value="current">Current workspace</option>
                <option value="user">User</option>
              </select></label
            >
            <label class="archive-filter"
              ><input
                ptahCheckbox
                type="checkbox"
                [checked]="showArchived()"
                (change)="toggleArchived($event)"
              />Show archived ({{ archivedCount() }})</label
            >
          </div>
          @if (store.listError(); as error) {
            <ptah-alert
              tone="error"
              title="Could not load bots"
              [compact]="true"
              >{{ error.message
              }}<button
                alertAction
                ptahButton
                variant="ghost"
                type="button"
                (click)="reload()"
              >
                Retry
              </button></ptah-alert
            >
          }
          @if (firstLoading()) {
            <ptah-skeleton [lines]="3" />
          } @else {
            @if (store.unidentifiedRowNotice(); as notice) {
              <p role="note">{{ notice }}</p>
            }
            <nav aria-label="Bots">
              @for (bot of visibleRows(); track bot.id) {
                <ptah-bot-list-row
                  [bot]="bot"
                  [selected]="store.selected()?.id === bot.id"
                  [lastEdit]="lastEdit(bot)"
                  [avatar]="avatarFor(bot)"
                  (selectedBot)="selectBot($event)"
                  (avatarNeeded)="requestAvatar(bot, $event)"
                  (avatarRetry)="requestAvatar(bot, $event, true)"
                />
              }
            </nav>
            @if (!filtered().length && store.summaries().length) {
              <p>No bots match these filters.</p>
            }
            @for (item of store.unreadable(); track item.id) {
              <ptah-bot-list-row [unreadable]="item" />
            }
            @if (filtered().length > pageSize) {
              <div class="pagination">
                <button
                  ptahButton
                  variant="ghost"
                  type="button"
                  [disabled]="currentPage() === 0"
                  (click)="page.set(currentPage() - 1)"
                >
                  Previous</button
                ><span>Page {{ currentPage() + 1 }} of {{ pageCount() }}</span
                ><button
                  ptahButton
                  variant="ghost"
                  type="button"
                  [disabled]="currentPage() + 1 >= pageCount()"
                  (click)="page.set(currentPage() + 1)"
                >
                  Next
                </button>
              </div>
            }
          }
          <div class="import-preview">
            Import saved custom agents <span ptahBadge>Preview later</span>
          </div>
        </div>
        <div detail>
          <ptah-bot-editor
            [installedSkills]="installedSkills()"
            [knownToolIds]="knownToolIds()"
            [catalogLoaded]="catalogLoaded()"
            [catalogLoading]="catalogLoading()"
            [catalogFailed]="catalogFailed()"
          />
        </div>
        <ptah-state-panel
          class="selection-prompt"
          empty
          state="empty"
          title="Select a bot"
          body="Pick a bot in the list to edit it, or create a new one."
        />
      </ptah-list-detail>
    }
  `,
})
export class BotsPageComponent {
  protected readonly store = inject(BotsStore);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly layout = inject(ElectronLayoutService);
  private readonly coordinator = inject(WORKSPACE_COORDINATOR);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly search = signal('');
  protected readonly scope = signal('all');
  protected readonly createScope = signal('');
  protected readonly showArchived = signal(false);
  private readonly hasDraft = computed(() => this.store.draft() !== null);
  protected readonly detailOpen = linkedSignal({
    source: this.hasDraft,
    computation: () => false,
  });
  protected readonly workspaceNotice = signal('');
  protected readonly firstLoading = computed(
    () => this.store.loading() && this.store.list() === null,
  );
  protected readonly page = signal(0);
  protected readonly pageSize = 32;
  protected readonly installedSkills = signal<readonly InstalledSkill[]>([]);
  protected readonly knownToolIds = signal<readonly string[]>([]);
  protected readonly catalogLoading = signal(true);
  protected readonly catalogFailed = signal(false);
  protected readonly catalogLoaded = computed(
    () => !this.catalogLoading() && !this.catalogFailed(),
  );
  private readonly navigating = signal(false);
  protected readonly busy = computed(
    () => this.navigating() || this.store.selecting() || this.store.saving(),
  );
  protected readonly empty = computed(
    () =>
      !this.store.loading() &&
      !this.store.listError() &&
      this.store.list() !== null &&
      !this.store.summaries().length &&
      !this.store.unreadable().length &&
      !this.store.unidentifiedRowNotice() &&
      !this.detailOpen(),
  );
  private readonly matchingRows = computed(() =>
    this.store
      .summaries()
      .filter(
        (bot) =>
          (this.scope() === 'all' ||
            (this.scope() === 'user'
              ? bot.scope.kind === 'user'
              : bot.scope.kind === 'workspace' &&
                bot.scope.workspaceRoot ===
                  this.layout.activeWorkspace()?.path)) &&
          (bot.name + ' ' + bot.description)
            .toLocaleLowerCase()
            .includes(this.search().toLocaleLowerCase()),
      ),
  );
  protected readonly archivedCount = computed(
    () => this.matchingRows().filter((bot) => bot.archivedAt !== null).length,
  );
  protected readonly filtered = computed(() =>
    this.matchingRows().filter(
      (bot) => this.showArchived() || bot.archivedAt === null,
    ),
  );
  protected readonly pageCount = computed(() =>
    Math.ceil(this.filtered().length / this.pageSize),
  );
  protected readonly currentPage = computed(() =>
    Math.min(this.page(), Math.max(this.pageCount() - 1, 0)),
  );
  protected readonly visibleRows = computed(() =>
    this.filtered().slice(
      this.currentPage() * this.pageSize,
      (this.currentPage() + 1) * this.pageSize,
    ),
  );
  protected setCreateScope(event: Event): void {
    if (event.target instanceof HTMLSelectElement)
      this.createScope.set(event.target.value);
  }
  private readonly recoveredAvatars = new Set<string>();
  private readonly seenAvatars = new Set<string>();
  private readonly pendingAvatars = new Set<string>();
  private catalogSequence = 0;
  private workspaceKey: string | null = null;
  private workspaceGeneration = 0;

  public constructor() {
    effect(() => {
      const roots = this.layout.workspaceFolders().map((folder) => folder.path);
      const active = this.layout.activeWorkspace()?.path ?? '';
      untracked(() => {
        const key = JSON.stringify({ roots, active });
        if (key === this.workspaceKey) return;
        if (this.workspaceKey !== null) {
          const dirty = this.store.dirty();
          // Existing public methods clear selection and invalidate pending editor requests without persistence.
          this.store.newDraft({ kind: 'user' });
          this.store.discard();
          this.detailOpen.set(false);
          this.workspaceNotice.set(
            dirty
              ? 'Unsaved changes were discarded because the workspace changed.'
              : '',
          );
        }
        this.workspaceKey = key;
        this.workspaceGeneration++;
        this.createScope.set('');
        this.page.set(0);
        this.store.setWorkspaceRoots(roots);
        void this.store.load({
          workspaceRoot: active,
          scopeFilter: 'all',
          includeArchived: true,
        });
        void this.store.loadLaneChoices();
        void this.loadCatalogs();
      });
    });
  }
  protected reload(): void {
    void this.store.refresh();
  }
  protected setSearch(event: Event): void {
    const value =
      event.target instanceof HTMLInputElement ? event.target.value : '';
    this.search.set(value);
    this.page.set(0);
  }
  protected setScope(event: Event): void {
    const value =
      event.target instanceof HTMLSelectElement ? event.target.value : 'all';
    this.scope.set(value);
    this.page.set(0);
  }
  protected toggleArchived(event: Event): void {
    const value =
      event.target instanceof HTMLInputElement && event.target.checked;
    this.showArchived.set(value);
    this.page.set(0);
  }
  protected lastEdit(bot: BotSummary): string {
    return 'Edited ' + new Date(bot.updatedAt).toLocaleString();
  }
  protected avatarFor(bot: BotSummary) {
    if (bot.avatar?.kind !== 'image') return null;
    const avatar = this.store.avatars().get(bot.avatar.imageId) ?? null;
    // A row's one-time output cannot repeat after cache eviction. Re-request only mounted rows.
    if (avatar) this.seenAvatars.add(bot.avatar.imageId);
    if (
      !avatar &&
      this.seenAvatars.has(bot.avatar.imageId) &&
      !this.recoveredAvatars.has(bot.avatar.imageId)
    ) {
      // One recovery per mount prevents request churn when images exceed the cache byte budget.
      this.recoveredAvatars.add(bot.avatar.imageId);
      this.requestAvatar(bot, bot.avatar.imageId);
    }
    const visibleImages = new Set(
      this.visibleRows().flatMap((row) =>
        row.avatar?.kind === 'image' ? [row.avatar.imageId] : [],
      ),
    );
    for (const id of this.seenAvatars)
      if (!visibleImages.has(id)) {
        this.seenAvatars.delete(id);
        this.recoveredAvatars.delete(id);
      }
    return avatar;
  }
  protected requestAvatar(
    bot: BotSummary,
    imageId: string,
    retry = false,
  ): void {
    if (this.pendingAvatars.has(imageId)) return;
    this.pendingAvatars.add(imageId);
    queueMicrotask(() => {
      if (
        this.destroyRef.destroyed ||
        !this.visibleRows().some((row) => row.id === bot.id)
      ) {
        this.pendingAvatars.delete(imageId);
        return;
      }
      void this.store
        .loadAvatar(bot.id, imageId, retry)
        .finally(() => this.pendingAvatars.delete(imageId));
    });
  }
  private async leaveDraft(): Promise<boolean> {
    if (!this.store.dirty()) return true;
    const generation = this.workspaceGeneration;
    const confirmed = await this.coordinator.confirm({
      title: 'Discard changes?',
      message: 'Your unsaved bot changes will be lost.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      confirmStyle: 'warning',
    });
    if (generation !== this.workspaceGeneration) return false;
    if (confirmed) this.store.discard();
    return confirmed;
  }
  protected async selectBot(id: string): Promise<void> {
    if (this.busy()) return;
    if (id === this.store.selected()?.id) {
      this.detailOpen.set(true);
      return;
    }
    this.navigating.set(true);
    const generation = this.workspaceGeneration;
    try {
      if (
        (await this.leaveDraft()) &&
        generation === this.workspaceGeneration
      ) {
        await this.store.select(id);
        this.detailOpen.set(this.store.draft() !== null);
      }
    } finally {
      this.navigating.set(false);
    }
  }
  protected async newBot(): Promise<void> {
    if (this.busy()) return;
    this.navigating.set(true);
    const generation = this.workspaceGeneration;
    try {
      if (!(await this.leaveDraft()) || generation !== this.workspaceGeneration)
        return;
      const requested = this.createScope();
      const choice =
        requested === 'user' || this.store.workspaceRoots().includes(requested)
          ? requested
          : '';
      if (requested !== choice) this.createScope.set('');
      const scope =
        choice === 'user'
          ? { kind: 'user' as const }
          : choice
            ? { kind: 'workspace' as const, workspaceRoot: choice }
            : undefined;
      if (this.store.newDraft(scope)) this.detailOpen.set(true);
    } finally {
      this.navigating.set(false);
    }
  }
  protected async back(): Promise<void> {
    if (this.busy()) return;
    this.navigating.set(true);
    const generation = this.workspaceGeneration;
    try {
      if ((await this.leaveDraft()) && generation === this.workspaceGeneration)
        this.detailOpen.set(false);
    } finally {
      this.navigating.set(false);
    }
  }
  private async loadCatalogs(): Promise<void> {
    const sequence = ++this.catalogSequence;
    this.catalogLoading.set(true);
    this.catalogFailed.set(false);
    try {
      const [skills, tools] = await Promise.all([
        this.rpc.call('skillsSh:listInstalled', {}),
        this.rpc.call('agent:getClaudeBuiltins', {}),
      ]);
      if (sequence !== this.catalogSequence || this.destroyRef.destroyed)
        return;
      this.installedSkills.set(skills.isSuccess() ? skills.data.skills : []);
      this.knownToolIds.set(
        tools.isSuccess() ? tools.data.tools.map((tool) => tool.id) : [],
      );
      this.catalogFailed.set(!skills.isSuccess() || !tools.isSuccess());
    } catch {
      // degradation-audit: reported - editor displays the failed catalogue state.
      if (sequence === this.catalogSequence && !this.destroyRef.destroyed)
        this.catalogFailed.set(true);
    } finally {
      if (sequence === this.catalogSequence && !this.destroyRef.destroyed)
        this.catalogLoading.set(false);
    }
  }
}
