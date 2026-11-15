import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahDescriptionItem,
  PtahDescriptionItemComponent,
  PtahDescriptionListComponent,
  PtahEditableSectionComponent,
  PtahEditTemplateDirective,
  PtahFieldComponent,
  PtahFormActionsComponent,
  PtahFormSectionComponent,
  PtahInputDirective,
  PtahSettingsLayoutComponent,
  PtahSettingsTab,
} from '@ptah-extension/ui';
import { Bot, Settings, UserRound, Wallet } from 'lucide-angular';
import { GallerySectionComponent } from './gallery-section.component';

type GallerySettingsTabId = 'general' | 'accounts' | 'models' | 'billing';

/**
 * Gallery sections of the form patterns family (TASK_2026_1177_9109,
 * pattern-spec.md sections 1 to 5): `ptah-form-section`,
 * `ptah-description-list`, `ptah-form-actions`, `ptah-editable-section`
 * and `ptah-settings-layout` in their states.
 */
@Component({
  selector: 'ptah-gallery-patterns-family',
  standalone: true,
  imports: [
    GallerySectionComponent,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahDescriptionItemComponent,
    PtahDescriptionListComponent,
    PtahEditableSectionComponent,
    PtahEditTemplateDirective,
    PtahFieldComponent,
    PtahFormActionsComponent,
    PtahFormSectionComponent,
    PtahInputDirective,
    PtahSettingsLayoutComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="flex flex-col gap-ptah-section">
    <ptah-gallery-section id="patterns-form-section" title="Form section pattern">
      <p class="text-ptah-hint text-base-content-muted">
        A two-column row: title and description at the start, fields at the end.
        It stacks below the form split width.
      </p>

      <div data-testid="patterns-form-section-default">
        <ptah-form-section
          heading="Workspace"
          description="The name shows in the title bar and in the session list."
          [divider]="true"
        >
          <span aside ptahBadge size="xs" tone="info">Default</span>
          <ptah-field label="Workspace name"><input ptahInput value="ptah-extension" /></ptah-field>
          <ptah-field label="Branch prefix" hint="Used for new worktrees">
            <input ptahInput placeholder="feat/" />
          </ptah-field>
        </ptah-form-section>
        <ptah-form-section heading="Divider" description="A divider separates this section from the next." [divider]="true">
          <ptah-field label="Region"><input ptahInput value="us-east-1" /></ptah-field>
        </ptah-form-section>
        <ptah-form-section
          heading="Error"
          description="The alert shows at the top of the fields."
          error="The API key is not valid."
          [divider]="true"
        >
          <ptah-field label="API key"><input ptahInput type="password" value="invalid" /></ptah-field>
        </ptah-form-section>
        <ptah-form-section
          heading="Disabled"
          description="The fields are inert. The title keeps full contrast."
          [disabled]="true"
        >
          <ptah-field label="Model"><input ptahInput value="default" /></ptah-field>
          <div footer>
            <button ptahButton type="button" size="xs" variant="ghost" tone="danger">Remove workspace</button>
          </div>
        </ptah-form-section>
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="patterns-description-list" title="Description list pattern">
      <p class="text-ptah-hint text-base-content-muted">
        Read-only term and value rows for view mode. An empty value shows "Not set".
      </p>

      <div data-testid="patterns-description-list-data" class="grid gap-ptah-field lg:grid-cols-2">
        <ptah-description-list ariaLabel="Account details" [items]="accountItems" />
        <ptah-description-list ariaLabel="Not divided" [divided]="false" [items]="accountItems" />
      </div>

      <div data-testid="patterns-description-list-projection" class="grid gap-ptah-field lg:grid-cols-2">
        <ptah-description-list ariaLabel="Provider status">
          <div ptahDescriptionItem term="Status">
            <span ptahBadge status tone="ok" size="xs">Connected</span>
          </div>
          <div ptahDescriptionItem term="Endpoint" [mono]="true" [truncate]="true" value="https://api.example.com/v1/very/long/endpoint/path">
            <button actions ptahButton type="button" size="xs" variant="ghost">Copy</button>
          </div>
          <div ptahDescriptionItem term="Proxy" [value]="null"></div>
          <div ptahDescriptionItem term="Notes"></div>
        </ptah-description-list>
        <ptah-description-list ariaLabel="Empty list" [items]="[]" emptyText="No details yet" />
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="patterns-form-actions" title="Form actions pattern">
      <p class="text-ptah-hint text-base-content-muted">
        An action bar for Cancel and Save. The buttons are projected. Below 320 px
        the buttons stack, primary first.
      </p>

      <div data-testid="patterns-form-actions-states" class="flex flex-col gap-ptah-field">
        <ptah-form-actions>
          <button ptahButton type="button" variant="ghost">Cancel</button>
          <button ptahButton type="button" variant="primary">Save</button>
        </ptah-form-actions>

        <ptah-form-actions [dirty]="dirty()">
          <button start ptahButton type="button" size="xs" variant="ghost" (click)="dirty.set(!dirty())">
            Toggle dirty
          </button>
          <button ptahButton type="button" variant="ghost" (click)="dirty.set(false)">Cancel</button>
          <button ptahButton type="button" variant="primary" [disabled]="!dirty()">Save</button>
        </ptah-form-actions>

        <ptah-form-actions [dirty]="true" [saving]="true">
          <button ptahButton type="button" variant="ghost" disabled>Cancel</button>
          <button ptahButton type="button" variant="primary" [busy]="true">Save</button>
        </ptah-form-actions>

        <ptah-form-actions [disabled]="true">
          <button ptahButton type="button" variant="ghost" disabled>Cancel</button>
          <button ptahButton type="button" variant="primary" disabled>Save</button>
        </ptah-form-actions>

        <div class="max-w-[319px]">
          <ptah-form-actions [dirty]="true">
            <button ptahButton type="button" variant="ghost">Cancel</button>
            <button ptahButton type="button" variant="primary">Save</button>
          </ptah-form-actions>
        </div>
      </div>

      <div
        data-testid="patterns-form-actions-sticky"
        class="max-h-48 overflow-y-auto rounded-ptah-surface border border-surface-border"
      >
        <div class="flex flex-col gap-ptah-field p-ptah-surface">
          @for (row of stickyRows; track row) {
            <ptah-field [label]="'Setting ' + row"><input ptahInput /></ptah-field>
          }
        </div>
        <ptah-form-actions [sticky]="true" [dirty]="true">
          <button ptahButton type="button" variant="ghost">Cancel</button>
          <button ptahButton type="button" variant="primary">Save</button>
        </ptah-form-actions>
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="patterns-editable-section" title="Editable section pattern">
      <p class="text-ptah-hint text-base-content-muted">
        One section with a view mode and an edit mode. The parent owns the mode,
        the dirty state, the saving state and the error.
      </p>

      <div data-testid="patterns-editable-section-interactive">
        <ptah-editable-section
          heading="Profile"
          description="Edit the name, then save. Turn on the failure to see the error state."
          [surface]="true"
          [editing]="editing()"
          [dirty]="profileDirty()"
          [saving]="saving()"
          [error]="saveError()"
          (edit)="startEdit()"
          (save)="saveProfile()"
          (cancelEdit)="stopEdit()"
        >
          <span status ptahBadge size="xs" tone="info">Demo</span>
          <ptah-description-list view ariaLabel="Profile details">
            <div ptahDescriptionItem term="Display name" [value]="profileName()"></div>
            <div ptahDescriptionItem term="Email" [value]="null"></div>
          </ptah-description-list>
          <ng-template ptahEditTemplate>
            <ptah-field label="Display name">
              <input ptahInput [value]="profileName()" (input)="onNameInput($event)" />
            </ptah-field>
          </ng-template>
          <button
            actions-start
            ptahButton
            type="button"
            size="xs"
            variant="ghost"
            [selected]="failNextSave()"
            (click)="failNextSave.set(!failNextSave())"
          >Fail next save</button>
        </ptah-editable-section>
      </div>

      <div data-testid="patterns-editable-section-states" class="grid gap-ptah-field lg:grid-cols-2">
        <ptah-editable-section heading="View mode" description="Read-only rows and one Edit button.">
          <ptah-description-list view [items]="accountItems" />
        </ptah-editable-section>

        <ptah-editable-section heading="Empty" description="No view content: the button says Add." />

        <ptah-editable-section heading="Dirty" [editing]="true" [dirty]="true">
          <ng-template ptahEditTemplate>
            <ptah-field label="Region"><input ptahInput value="eu-west-1" /></ptah-field>
          </ng-template>
        </ptah-editable-section>

        <ptah-editable-section heading="Saving" [editing]="true" [dirty]="true" [saving]="true">
          <ng-template ptahEditTemplate>
            <ptah-field label="Region"><input ptahInput value="eu-west-1" /></ptah-field>
          </ng-template>
        </ptah-editable-section>

        <ptah-editable-section heading="Error" [editing]="true" [dirty]="true" error="The region is not available.">
          <ng-template ptahEditTemplate>
            <ptah-field label="Region"><input ptahInput value="mars-1" /></ptah-field>
          </ng-template>
        </ptah-editable-section>

        <ptah-editable-section heading="Disabled" [disabled]="true" disabledReason="Only an admin can edit this.">
          <ptah-description-list view [items]="accountItems" />
        </ptah-editable-section>
      </div>
    </ptah-gallery-section>

    <ptah-gallery-section id="patterns-settings-layout" title="Settings layout pattern">
      <p class="text-ptah-hint text-base-content-muted">
        The settings page frame: a side nav of tabs, a page header and one tab panel.
        Below 768 px of its own width the nav is a strip above the header. Arrow keys
        move focus. Enter, Space or a click selects.
      </p>

      <div
        data-testid="patterns-settings-layout-wide"
        class="rounded-ptah-surface border border-surface-border"
      >
        <ptah-settings-layout
          title="Settings"
          description="Accounts, models and billing for this workspace."
          [tabs]="settingsTabs"
          [selected]="wideTab()"
          (selectedChange)="wideTab.set($event)"
        >
          <span nav-header class="text-ptah-hint text-base-content-muted">Ptah</span>
          <span nav-footer class="text-ptah-hint text-base-content-muted">Version 1.0.0</span>
          <button actions ptahButton type="button" size="xs" variant="ghost">Reset</button>
          <ptah-form-section [heading]="tabLabel(wideTab())" description="The panel shows the content of the selected tab.">
            <ptah-field label="Name"><input ptahInput [value]="tabLabel(wideTab())" /></ptah-field>
          </ptah-form-section>
        </ptah-settings-layout>
      </div>

      <div
        data-testid="patterns-settings-layout-narrow"
        class="max-w-[480px] rounded-ptah-surface border border-surface-border"
      >
        <ptah-settings-layout
          title="Settings"
          [tabs]="settingsTabs"
          [selected]="narrowTab()"
          (selectedChange)="narrowTab.set($event)"
        >
          <ptah-form-section [heading]="tabLabel(narrowTab())" description="Narrow frame: the tabs scroll on the x axis.">
            <ptah-field label="Name"><input ptahInput [value]="tabLabel(narrowTab())" /></ptah-field>
          </ptah-form-section>
        </ptah-settings-layout>
      </div>
    </ptah-gallery-section>
  </div>`,
})
export class GalleryPatternsFamilyComponent {
  public readonly accountItems: readonly PtahDescriptionItem[] = [
    { key: 'name', term: 'Name', value: 'Work account' },
    { key: 'id', term: 'Account ID', value: 'acct_01HZX8Q2', mono: true },
    { key: 'sessions', term: 'Sessions', value: 0 },
    { key: 'email', term: 'Email', value: null },
    { key: 'org', term: 'Organization', value: '  ' },
  ];
  public readonly stickyRows: readonly number[] = [1, 2, 3, 4, 5];

  // Settings layout demo: the parent owns the selected tab.
  public readonly settingsTabs: readonly PtahSettingsTab<GallerySettingsTabId>[] = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'accounts', label: 'Accounts', icon: UserRound, badge: 2 },
    { id: 'models', label: 'Models', icon: Bot, badge: 'New' },
    {
      id: 'billing',
      label: 'Billing',
      icon: Wallet,
      disabled: true,
      disabledReason: 'Only an admin can open billing.',
    },
  ];
  public readonly wideTab = signal<GallerySettingsTabId>('general');
  public readonly narrowTab = signal<GallerySettingsTabId>('accounts');
  public readonly dirty = signal(false);

  // Editable section demo: the parent owns every state.
  public readonly editing = signal(false);
  public readonly profileDirty = signal(false);
  public readonly saving = signal(false);
  public readonly saveError = signal<string | null>(null);
  public readonly failNextSave = signal(false);
  public readonly profileName = signal('Ada Lovelace');
  private draftName = '';
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor() {
    inject(DestroyRef).onDestroy(() => this.clearSaveTimer());
  }

  public tabLabel(id: GallerySettingsTabId): string {
    return this.settingsTabs.find((tab) => tab.id === id)?.label ?? id;
  }

  public startEdit(): void {
    this.draftName = this.profileName();
    this.profileDirty.set(false);
    this.saveError.set(null);
    this.editing.set(true);
  }

  public onNameInput(event: Event): void {
    this.draftName = (event.target as HTMLInputElement).value;
    this.profileDirty.set(this.draftName !== this.profileName());
  }

  public saveProfile(): void {
    this.saving.set(true);
    this.saveError.set(null);
    this.clearSaveTimer();
    // One demo timer. It is cleared on cancel and on destroy.
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saving.set(false);
      if (this.failNextSave()) {
        this.saveError.set('The name could not be saved. Try again.');
        return;
      }
      this.profileName.set(this.draftName);
      this.stopEdit();
    }, 800);
  }

  public stopEdit(): void {
    this.clearSaveTimer();
    this.saving.set(false);
    this.profileDirty.set(false);
    this.saveError.set(null);
    this.editing.set(false);
  }

  private clearSaveTimer(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }
}
