import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type {
  OperatorSettings,
  RepositorySettings,
  ReviewLaneListing,
  ReviewLaneListState,
  ReviewLaneSettings,
} from '@ptah-extension/review-contracts';
import {
  NativeDrawerComponent,
  PtahAlertComponent,
  PtahButtonDirective,
  PtahFieldComponent,
  PtahIconButtonDirective,
  PtahInputDirective,
  PtahStatePanelComponent,
  PtahToggleDirective,
} from '@ptah-extension/ui';
import {
  GitPullRequest,
  LucideAngularModule,
  Pause,
  Save,
  Send,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-angular';
import { ReviewRunsStore } from '../review-runs.store';
import { ReviewConfirmDialogComponent } from './review-confirm-dialog.component';
import { ReviewRepositoriesEditorComponent } from './review-repositories-editor.component';
import { ReviewBotIdentityComponent } from './review-bot-identity.component';
import { ReviewLanesSectionComponent } from './review-lanes/review-lanes-section.component';

/**
 * Review settings drawer (design-spec section 1). The shell is `ptah-native-drawer`: a top-layer
 * popover with an opaque panel, pinned header and footer. The native drawer owns the focus trap,
 * Escape and focus restore; this component only moves focus to the title once the drawer opened.
 * Confirm dialogs render as top-layer siblings of the drawer, so they paint above it and sit
 * outside its focus trap and keydown handler.
 */
@Component({
  selector: 'ptah-review-settings-drawer',
  standalone: true,
  imports: [
    LucideAngularModule,
    NativeDrawerComponent,
    PtahAlertComponent,
    PtahButtonDirective,
    PtahFieldComponent,
    PtahIconButtonDirective,
    PtahInputDirective,
    PtahStatePanelComponent,
    PtahToggleDirective,
    ReviewBotIdentityComponent,
    ReviewConfirmDialogComponent,
    ReviewLanesSectionComponent,
    ReviewRepositoriesEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './review-settings-drawer.component.html',
})
export class ReviewSettingsDrawerComponent {
  protected readonly GitPullRequestIcon = GitPullRequest;
  protected readonly XIcon = X;
  protected readonly UsersIcon = Users;
  protected readonly SlidersIcon = SlidersHorizontal;
  protected readonly SendIcon = Send;
  protected readonly PauseIcon = Pause;
  protected readonly SaveIcon = Save;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly store = inject(ReviewRunsStore);
  readonly confirmation = signal<
    'pause-off' | 'live-enable' | 'remove-token' | 'replace-token' | null
  >(null);
  readonly draft = input.required<OperatorSettings>();
  readonly lanes = input.required<ReviewLaneSettings>();
  readonly laneListing = input<ReviewLaneListing | null>(null);
  readonly laneListState = input<ReviewLaneListState>('idle');
  readonly lanesSaveError = input<string | null>(null);
  readonly lanesCorrupt = input(false);
  readonly hasToken = input(false);
  readonly saving = input(false);
  readonly saveError = input<string | null>(null);
  readonly loadState = input<'loading' | 'ready' | 'error'>('ready');
  readonly closed = output<void>();
  readonly retry = output<void>();
  readonly changed = output<Partial<OperatorSettings>>();
  readonly lanesChanged = output<ReviewLaneSettings>();
  readonly retryLanes = output<void>();
  readonly save = output<void>();
  readonly newRepository = signal('');
  readonly repositoryError = signal<string | null>(null);
  readonly pendingLiveRepository = signal<string | null>(null);
  setNewRepository(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.newRepository.set(event.target.value);
      this.repositoryError.set(null);
    }
  }
  addRepository(): void {
    const value = this.newRepository().trim();
    const match =
      /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/.exec(
        value,
      );
    if (!match || match[2] === '.' || match[2] === '..') {
      this.repositoryError.set('Enter a valid GitHub owner/name.');
      return;
    }
    const key = value.toLowerCase();
    if (
      this.draft().repositories.some(
        (repo) => `${repo.owner}/${repo.name}`.toLowerCase() === key,
      )
    ) {
      this.repositoryError.set('This repository is already added.');
      return;
    }
    this.changed.emit({
      repositories: [
        ...this.draft().repositories,
        {
          owner: match[1],
          name: match[2],
          enabled: false,
          dryRun: true,
          publicationPaused: false,
        },
      ],
    });
    this.newRepository.set('');
    this.repositoryError.set(null);
  }
  removeRepository(target: RepositorySettings): void {
    this.changed.emit({
      repositories: this.draft().repositories.filter(
        (repo) => repo.owner !== target.owner || repo.name !== target.name,
      ),
    });
  }
  setRepositoryEnabled(target: RepositorySettings, event: Event): void {
    if (event.target instanceof HTMLInputElement)
      this.updateRepository(target, { enabled: event.target.checked });
  }
  setRepositoryDryRun(target: RepositorySettings, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!event.target.checked) {
      event.target.checked = true;
      if (!this.hasToken() || !this.store.botIdentity()) return;
      this.pendingLiveRepository.set(`${target.owner}/${target.name}`);
      this.confirmation.set('live-enable');
      return;
    }
    this.updateRepository(target, { dryRun: true });
  }
  confirmLiveEnable(): void {
    this.confirmation.set(null);
    if (!this.hasToken() || !this.store.botIdentity()) return;
    const key = this.pendingLiveRepository();
    const repo = this.draft().repositories.find(
      (entry) => `${entry.owner}/${entry.name}` === key,
    );
    if (!repo) return;
    this.store.liveAttested.set(true);
    this.updateRepository(repo, { dryRun: false });
    this.pendingLiveRepository.set(null);
  }
  private updateRepository(
    target: RepositorySettings,
    patch: Partial<RepositorySettings>,
  ): void {
    this.changed.emit({
      repositories: this.draft().repositories.map((repo) =>
        repo.owner === target.owner && repo.name === target.name
          ? { ...repo, ...patch }
          : repo,
      ),
    });
  }
  setRepositoryPause(repo: RepositorySettings, event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.updateRepository(repo, { publicationPaused: event.target.checked });
    void this.store.setPublicationPause(event.target.checked, true, repo);
  }
  setGlobalPause(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (!event.target.checked) {
      event.target.checked = true;
      this.confirmation.set('pause-off');
      return;
    }
    this.changed.emit({ globalPublicationPaused: true });
    void this.store.setPublicationPause(true);
  }
  confirmPauseOff(): void {
    this.confirmation.set(null);
    this.changed.emit({ globalPublicationPaused: false });
    void this.store.setPublicationPause(false, true);
  }
  confirmRemoveToken(): void {
    this.confirmation.set(null);
    void this.store.clearBotToken();
  }
  confirmReplaceToken(): void {
    this.confirmation.set(null);
    const input =
      this.element.nativeElement.querySelector<HTMLInputElement>(
        '#review-bot-token',
      );
    if (input) void this.writeToken(input);
  }
  async submitToken(input: HTMLInputElement): Promise<void> {
    if (this.hasToken()) {
      this.confirmation.set('replace-token');
      return;
    }
    await this.writeToken(input);
  }
  private async writeToken(input: HTMLInputElement): Promise<void> {
    const token = input.value;
    input.value = '';
    if (!(await this.store.setBotToken(token))) return;
    const liveRepo = this.draft().repositories.find(
      (repo) => repo.enabled && !repo.dryRun,
    );
    if (!liveRepo) return;
    // The new token clears the live gate; confirmLiveEnable needs the repository to re-attest.
    this.pendingLiveRepository.set(`${liveRepo.owner}/${liveRepo.name}`);
    this.confirmation.set('live-enable');
  }
  setLogins(event: Event): void {
    if (event.target instanceof HTMLInputElement)
      this.changed.emit({
        maintainerLogins: event.target.value
          .split(',')
          .map((login) => login.trim())
          .filter(Boolean),
      });
  }
  setAttestor(event: Event): void {
    if (event.target instanceof HTMLInputElement)
      this.store.attestorLogin.set(event.target.value);
  }
  setNumber(
    field: 'pollMinutes' | 'maxNewInline' | 'confidenceFloor' | 'laneCapPerPr',
    event: Event,
  ): void {
    if (event.target instanceof HTMLInputElement)
      this.changed.emit({ [field]: Number(event.target.value) });
  }
  /** Runs on the native drawer's `opened`, after it moved focus into the panel (parity: title focus). */
  focusTitle(): void {
    this.element.nativeElement
      .querySelector<HTMLElement>('#review-settings-title')
      ?.focus();
  }
}
