import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PtahFieldControlDirective } from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

interface TypeRoleSpecimen {
  readonly role: string;
  readonly token: string;
  readonly utilityClass: string;
  readonly metrics: string;
  readonly sample: string;
}

@Component({
  selector: 'ptah-gallery-tokens-type',
  standalone: true,
  imports: [GallerySectionComponent, PtahFieldControlDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section
    id="tokens-type"
    title="Typography and hierarchy"
  >
    <div class="flex flex-col gap-ptah-heading">
      <h3 class="text-ptah-group-title text-base-content">Type scale roles</h3>
      <div
        class="flex flex-col gap-ptah-field rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
      >
        @for (item of roles; track item.token) {
          <div
            class="flex flex-col gap-ptah-label border-b border-surface-border pb-ptah-field last:border-b-0 last:pb-0"
            data-testid="type-role-row"
          >
            <p [class]="item.utilityClass">{{ item.sample }}</p>
            <p class="text-ptah-caption text-base-content-muted">
              {{ item.role }} ·
              <code class="font-mono text-ptah-code text-base-content">{{
                item.token
              }}</code>
              · {{ item.metrics }}
            </p>
          </div>
        }
      </div>
    </div>

    <div class="flex flex-col gap-ptah-heading">
      <h3 class="text-ptah-group-title text-base-content">Hierarchy in use</h3>
      <div
        class="flex flex-col gap-ptah-group rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
        data-testid="type-hierarchy-specimen"
      >
        <div class="flex flex-col gap-ptah-heading">
          <p class="text-ptah-page-title text-base-content">
            Workspace verification settings
          </p>
          <p class="text-ptah-section-title text-base-content">
            Branch protection and check gates
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-field rounded-ptah-surface border border-surface-border bg-base-200 p-ptah-surface"
        >
          <p class="text-ptah-group-title text-base-content">
            Required verification command
          </p>
          <p class="text-ptah-body text-base-content">
            Each review run executes the configured command in an isolated
            worktree before reporting status.
          </p>
          <div class="flex flex-col gap-ptah-label">
            <label
              for="hierarchy-verify-input"
              class="text-ptah-label text-base-content"
              >Command line</label
            >
            <input
              id="hierarchy-verify-input"
              ptahFieldControl
              value="npm run verify -- -p ptah-extension-webview"
              readonly
            />
            <span class="text-ptah-hint text-base-content-muted">
              Uses the machine-wide verification lock and reports diagnostics to
              the parent lane.
            </span>
          </div>
        </div>
      </div>
    </div>
  </ptah-gallery-section>`,
})
export class GalleryTokensTypeComponent {
  public readonly roles: readonly TypeRoleSpecimen[] = [
    {
      role: 'Page title',
      token: '--ptah-text-page-title (text-ptah-page-title)',
      utilityClass: 'text-ptah-page-title text-base-content',
      metrics: '1.25rem (20 px) / 1.75rem · weight 600 · base-content',
      sample: 'Review runs and connected machines',
    },
    {
      role: 'Section title',
      token: '--ptah-text-section-title (text-ptah-section-title)',
      utilityClass: 'text-ptah-section-title text-base-content',
      metrics: '1rem (16 px) / 1.5rem · weight 600 · base-content',
      sample: 'Active verification lanes across workspaces',
    },
    {
      role: 'Group title',
      token: '--ptah-text-group-title (text-ptah-group-title)',
      utilityClass: 'text-ptah-group-title text-base-content',
      metrics: '0.875rem (14 px) / 1.25rem · weight 600 · base-content',
      sample: 'Execution policy and timeout threshold',
    },
    {
      role: 'Body',
      token: '--ptah-text-body (text-ptah-body)',
      utilityClass: 'text-ptah-body text-base-content',
      metrics: '0.875rem (14 px) / 1.25rem · weight 400 · base-content',
      sample:
        'Each lane runs in an isolated git worktree and reports diagnostics before merge.',
    },
    {
      role: 'Field label',
      token: '--ptah-text-label (text-ptah-label)',
      utilityClass: 'text-ptah-label text-base-content',
      metrics: '0.75rem (12 px) / 1rem · weight 500 · base-content',
      sample: 'Target branch for automated review',
    },
    {
      role: 'Hint',
      token: '--ptah-text-hint (text-ptah-hint)',
      utilityClass: 'text-ptah-hint text-base-content-muted',
      metrics: '0.75rem (12 px) / 1rem · weight 400 · base-content-muted',
      sample: 'Only branches pushed to the remote origin appear in this list.',
    },
    {
      role: 'Caption',
      token: '--ptah-text-caption (text-ptah-caption)',
      utilityClass: 'text-ptah-caption text-base-content-muted',
      metrics: '0.6875rem (11 px) / 1rem · weight 500 · base-content-muted',
      sample: 'Updated 3 minutes ago · 14 checks passed',
    },
    {
      role: 'Code',
      token: '--ptah-text-code (text-ptah-code)',
      utilityClass: 'font-mono text-ptah-code text-base-content',
      metrics: '0.8125rem (13 px) / 1.25rem · weight 400 · base-content',
      sample: 'npm run verify -- -p ptah-extension-webview',
    },
  ];
}
