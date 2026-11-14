import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import type { GatewayPlatformId } from '@ptah-extension/shared';

import { GatewayStateService } from '../services/gateway-state.service';
import { PtahButtonDirective, PtahFieldComponent, PtahTextareaDirective } from '@ptah-extension/ui';

@Component({
  selector: 'ptah-allow-list-editor',
  standalone: true,
  imports: [PtahButtonDirective, PtahFieldComponent, PtahTextareaDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[var(--ptah-gap-field)]">
      <ptah-field [label]="'Allow-list (' + label() + ')'" appearance="stacked" hint="One ID per line. Empty = accept any sender it can see.">
      <textarea
        ptahTextarea
        size="sm"
        tone="mono"
        class="w-full"
        rows="3"
        [attr.data-testid]="'gateway-allowlist-' + platform()"
        [attr.aria-label]="label() + ' allow-list'"
        [value]="allowListValue()"
        (input)="onAllowListInput($event)"
      ></textarea>
      </ptah-field>
      <div class="flex items-center gap-[var(--ptah-gap-controls)]">
        <button
          type="button"
          ptahButton
          [attr.data-testid]="'gateway-allowlist-save-' + platform()"
          (click)="onSave()"
        >
          Save allow-list
        </button>
        @if (feedback(); as fb) {
          <span class="text-xs text-base-content-muted">{{ fb }}</span>
        }
      </div>
    </div>
  `,
})
export class AllowListEditorComponent {
  private readonly state = inject(GatewayStateService);

  public readonly platform = input.required<GatewayPlatformId>();
  public readonly label = input.required<string>();

  private readonly draft = signal<string | null>(null);
  protected readonly feedback = signal<string | null>(null);

  protected allowListValue(): string {
    const draft = this.draft();
    if (draft !== null) return draft;
    return this.state.allowLists()[this.platform()].join('\n');
  }

  protected onAllowListInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    if (!target) return;
    this.draft.set(target.value);
  }

  protected async onSave(): Promise<void> {
    const entries = this.allowListValue()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const result = await this.state.saveAllowList(this.platform(), entries);
    this.draft.set(null);
    this.feedback.set(result.ok ? 'Saved.' : `Save failed: ${result.error}`);
  }
}
