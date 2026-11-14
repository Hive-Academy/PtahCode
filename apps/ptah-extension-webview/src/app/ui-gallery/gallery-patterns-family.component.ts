import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahDescriptionItem,
  PtahDescriptionItemComponent,
  PtahDescriptionListComponent,
  PtahFieldComponent,
  PtahFormActionsComponent,
  PtahFormSectionComponent,
  PtahInputDirective,
} from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

/**
 * Gallery sections of the form patterns family (TASK_2026_1177_9109,
 * pattern-spec.md sections 1 to 3): `ptah-form-section`,
 * `ptah-description-list` and `ptah-form-actions` in their states.
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
    PtahFieldComponent,
    PtahFormActionsComponent,
    PtahFormSectionComponent,
    PtahInputDirective,
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
          <ptah-description-item term="Status">
            <span ptahBadge status tone="ok" size="xs">Connected</span>
          </ptah-description-item>
          <ptah-description-item term="Endpoint" [mono]="true" [truncate]="true" value="https://api.example.com/v1/very/long/endpoint/path">
            <button actions ptahButton type="button" size="xs" variant="ghost">Copy</button>
          </ptah-description-item>
          <ptah-description-item term="Proxy" [value]="null" />
          <ptah-description-item term="Notes" />
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
  public readonly dirty = signal(false);
}
