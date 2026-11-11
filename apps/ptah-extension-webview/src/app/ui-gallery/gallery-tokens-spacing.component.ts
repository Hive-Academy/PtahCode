import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
  PtahButtonDirective,
  PtahFieldControlDirective,
} from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

interface SpacingStep {
  readonly token: string;
  readonly value: string;
  readonly step: string;
}

@Component({
  selector: 'ptah-gallery-tokens-spacing',
  standalone: true,
  imports: [
    GallerySectionComponent,
    PtahButtonDirective,
    PtahFieldControlDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ptah-gallery-section
    id="tokens-spacing"
    title="Spacing and white space"
  >
    <div class="flex flex-col gap-ptah-heading">
      <h3 class="text-ptah-group-title text-base-content">
        Spacing scale (4 px base)
      </h3>
      <div
        class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
      >
        @for (item of spacingSteps; track item.token) {
          <div
            class="flex flex-wrap items-center gap-ptah-field"
            data-testid="spacing-bar"
          >
            <code class="font-mono text-ptah-code text-base-content">{{
              item.token
            }}</code>
            <div
              class="h-ptah-icon-xs rounded-ptah-chip bg-primary"
              [style.width]="'var(' + item.token + ')'"
              aria-hidden="true"
            ></div>
            <span class="text-ptah-caption text-base-content-muted"
              >{{ item.value }} · Tailwind step {{ item.step }}</span
            >
          </div>
        }
      </div>
    </div>

    <div class="flex flex-col gap-ptah-heading">
      <h3 class="text-ptah-group-title text-base-content">
        White-space rules in use
      </h3>
      <div class="grid gap-ptah-field md:grid-cols-2">
        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
          data-testid="whitespace-specimen"
        >
          <div
            class="inline-flex h-ptah-control-sm items-center gap-ptah-inline self-start rounded-ptah-control border border-surface-border bg-base-200 px-ptah-control-x text-ptah-label text-base-content"
          >
            <svg
              aria-hidden="true"
              class="size-ptah-icon-sm"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span>Verify workspace</span>
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-gap-inline · gap-ptah-inline (8 px) · Icon to label in a
            control
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
          data-testid="whitespace-specimen"
        >
          <div class="flex flex-col gap-ptah-label">
            <label
              for="specimen-label-gap"
              class="text-ptah-label text-base-content"
              >Repository branch</label
            >
            <input
              id="specimen-label-gap"
              ptahFieldControl
              value="feat/ui-gallery-sections"
              readonly
            />
            <span class="text-ptah-hint text-base-content-muted"
              >Checked before look approval</span
            >
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-gap-label · gap-ptah-label (4 px) · Label to control and
            control to hint
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
          data-testid="whitespace-specimen"
        >
          <div class="flex flex-wrap items-center gap-ptah-controls">
            <button ptahButton variant="primary" size="sm" type="button">
              Approve look
            </button>
            <button ptahButton variant="secondary" size="sm" type="button">
              Compare diff
            </button>
            <button ptahButton variant="ghost" size="sm" type="button">
              Reset
            </button>
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-gap-controls · gap-ptah-controls (8 px) · Control to control
            in one row
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
          data-testid="whitespace-specimen"
        >
          <div class="grid gap-ptah-field sm:grid-cols-2">
            <div class="flex flex-col gap-ptah-label">
              <label
                for="specimen-field-a"
                class="text-ptah-label text-base-content"
                >Source branch</label
              >
              <input
                id="specimen-field-a"
                ptahFieldControl
                value="main"
                readonly
              />
            </div>
            <div class="flex flex-col gap-ptah-label">
              <label
                for="specimen-field-b"
                class="text-ptah-label text-base-content"
                >Target host</label
              >
              <input
                id="specimen-field-b"
                ptahFieldControl
                value="Electron"
                readonly
              />
            </div>
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-gap-field · gap-ptah-field (16 px) · Field to field
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
          data-testid="whitespace-specimen"
        >
          <div class="flex flex-col gap-ptah-group">
            <div
              class="rounded-ptah-control border border-surface-border bg-base-200 p-ptah-surface text-ptah-body text-base-content"
            >
              Group A · Connection credentials
            </div>
            <div
              class="rounded-ptah-control border border-surface-border bg-base-200 p-ptah-surface text-ptah-body text-base-content"
            >
              Group B · Retry policy
            </div>
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-gap-group · gap-ptah-group (24 px) · Group to group in one
            section
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
          data-testid="whitespace-specimen"
        >
          <div class="flex flex-col gap-ptah-section">
            <div
              class="rounded-ptah-surface border border-surface-border bg-base-200 p-ptah-surface text-ptah-body text-base-content"
            >
              Section A · Active review runs
            </div>
            <div
              class="rounded-ptah-surface border border-surface-border bg-base-200 p-ptah-surface text-ptah-body text-base-content"
            >
              Section B · Archived runs
            </div>
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-gap-section · gap-ptah-section (32 px) · Section to section
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
          data-testid="whitespace-specimen"
        >
          <div
            class="rounded-ptah-surface border border-surface-border bg-base-200 p-ptah-surface text-ptah-body text-base-content"
          >
            Card or panel content inset by surface padding
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-surface-pad · p-ptah-surface (16 px) · Card or panel padding
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface"
          data-testid="whitespace-specimen"
        >
          <div
            class="rounded-ptah-surface border border-surface-border bg-base-200 p-ptah-dialog text-ptah-body text-base-content"
          >
            Dialog content inset by dialog padding
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-dialog-pad · p-ptah-dialog (24 px) · Dialog padding
          </p>
        </div>

        <div
          class="flex flex-col gap-ptah-controls rounded-ptah-surface border border-surface-border bg-base-100 p-ptah-surface md:col-span-2"
          data-testid="whitespace-specimen"
        >
          <div
            class="flex flex-col gap-ptah-heading rounded-ptah-surface border border-surface-border bg-base-200 p-ptah-surface"
          >
            <p class="text-ptah-section-title text-base-content">
              Section heading specimen
            </p>
            <p class="text-ptah-body text-base-content-muted">
              First item sits below the heading using the heading gap token.
            </p>
          </div>
          <p class="text-ptah-caption text-base-content-muted">
            --ptah-gap-heading · gap-ptah-heading (12 px) · Section title to
            first item
          </p>
        </div>
      </div>
    </div>
  </ptah-gallery-section>`,
})
export class GalleryTokensSpacingComponent {
  public readonly spacingSteps: readonly SpacingStep[] = [
    { token: '--ptah-space-1', value: '0.25rem (4 px)', step: '1' },
    { token: '--ptah-space-2', value: '0.5rem (8 px)', step: '2' },
    { token: '--ptah-space-3', value: '0.75rem (12 px)', step: '3' },
    { token: '--ptah-space-4', value: '1rem (16 px)', step: '4' },
    { token: '--ptah-space-6', value: '1.5rem (24 px)', step: '6' },
    { token: '--ptah-space-8', value: '2rem (32 px)', step: '8' },
    { token: '--ptah-space-12', value: '3rem (48 px)', step: '12' },
  ];
}
