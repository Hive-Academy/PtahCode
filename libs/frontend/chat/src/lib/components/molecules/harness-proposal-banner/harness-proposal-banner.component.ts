import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { PtahButtonDirective } from '@ptah-extension/ui';
import {
  IDLE_HARNESS_APPLY_STATE,
  fingerprintHarnessConfig,
  hasMeaningfulHarnessProposal,
  summarizeHarnessProposal,
  type HarnessProposalApplyState,
  type HarnessProposalRecord,
} from '../../../services/harness-chat-proposal.store';

/**
 * HarnessProposalBannerComponent — compact in-chat banner rendered above the
 * composer (`sessionControls` slot) when the active session has a staged
 * harness proposal (`harness:config-proposed` or `harness:get-proposal`).
 *
 * Presentational only: receives session-scoped state via signal inputs and
 * emits `applyRequested` when the user clicks **Apply to Workspace**.
 */
@Component({
  selector: 'ptah-harness-proposal-banner',
  standalone: true,
  imports: [PtahButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visibleProposal(); as current) {
      <section
        class="rounded border border-primary/30 bg-base-300/35 px-2.5 py-2 text-xs"
        data-glass-surface="plate"
        aria-label="Harness configuration proposal"
        data-testid="harness-proposal-banner"
      >
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <svg
            class="h-3.5 w-3.5 flex-shrink-0 text-primary"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M8 1.75 14 5v6l-6 3.25L2 11V5l6-3.25Z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M2 5l6 3.25L14 5M8 8.25v6"
            />
          </svg>

          <div class="min-w-40 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                class="font-semibold text-base-content"
                data-testid="harness-proposal-name"
              >
                {{ displayName() }}
              </span>
              @if (!current.isConfigComplete) {
                <span class="text-[11px] text-base-content-muted">Draft</span>
              }
            </div>

            <div
              class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-base-content-muted"
              data-testid="harness-proposal-counts"
            >
              @for (item of countItems(); track $index; let last = $last) {
                <span>{{ item }}</span>
                @if (!last) {
                  <span aria-hidden="true">·</span>
                }
              }
            </div>
          </div>

          <div class="ml-auto flex flex-shrink-0 items-center gap-2">
            @if (isStreaming() && !isApplying()) {
              <span class="text-[11px] text-base-content-muted">
                Waiting for response…
              </span>
            }
            <button
              ptahButton
              variant="primary"
              size="xs"
              [busy]="isApplying()"
              class="gap-1 px-2.5"
              [disabled]="isApplyDisabled()"
              (click)="onApplyClick()"
              data-testid="harness-proposal-apply"
            >
              @if (isApplying()) {
                Applying…
              } @else {
                Apply to Workspace
              }
            </button>
          </div>
        </div>

        @if (appliedLabel(); as confirmation) {
          <div
            role="status"
            aria-live="polite"
            class="mt-1.5 rounded border border-success/35 bg-success/10 px-2 py-1 text-[11px] text-base-content"
            data-testid="harness-proposal-applied"
          >
            <div class="flex items-center gap-1.5 font-medium text-success">
              <svg
                class="h-3.5 w-3.5 flex-shrink-0"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m3.25 8.5 3 3 6.5-6.75"
                />
              </svg>
              <span>{{ confirmation }}</span>
            </div>

            @if (warnings().length > 0) {
              <ul
                class="mt-1 list-disc space-y-0.5 pl-4 text-warning"
                data-testid="harness-proposal-warnings"
              >
                @for (warning of warnings(); track $index) {
                  <li>{{ warning }}</li>
                }
              </ul>
            }
          </div>
        }

        @if (applyError(); as errorText) {
          <div
            role="alert"
            class="mt-1.5 rounded border border-error/40 bg-error/10 px-2 py-1 text-[11px] text-error"
            data-testid="harness-proposal-error"
          >
            {{ errorText }}
          </div>
        }
      </section>
    }
  `,
})
export class HarnessProposalBannerComponent {
  /** Active session's staged harness proposal, or `null` when none exists. */
  readonly proposal = input<HarnessProposalRecord | null>(null);

  /** Per-session apply lifecycle state (`idle` | `applying` | `applied` | `error`). */
  readonly applyState = input<HarnessProposalApplyState>(
    IDLE_HARNESS_APPLY_STATE,
  );

  /** True while the active session is streaming a turn (disables Apply). */
  readonly isStreaming = input<boolean>(false);

  /** Emitted when the user activates **Apply to Workspace**. */
  readonly applyRequested = output<void>();

  protected readonly visibleProposal = computed<HarnessProposalRecord | null>(
    () => {
      const current = this.proposal();
      if (!current || !hasMeaningfulHarnessProposal(current.configUpdates)) {
        return null;
      }
      return current;
    },
  );

  protected readonly summary = computed(() => {
    const current = this.visibleProposal();
    return current ? summarizeHarnessProposal(current.configUpdates) : null;
  });

  protected readonly displayName = computed(
    () => this.summary()?.name ?? 'Harness proposal',
  );

  protected readonly countItems = computed<readonly string[]>(() => {
    const current = this.summary();
    if (!current) return [];

    const items: string[] = [];
    if (current.enabledAgentCount > 0) {
      items.push(
        `${current.enabledAgentCount} ${
          current.enabledAgentCount === 1 ? 'agent' : 'agents'
        }`,
      );
    }
    if (current.subagentCount > 0) {
      items.push(
        `${current.subagentCount} ${
          current.subagentCount === 1 ? 'subagent' : 'subagents'
        }`,
      );
    }
    if (current.skillCount > 0) {
      items.push(
        `${current.skillCount} ${current.skillCount === 1 ? 'skill' : 'skills'}`,
      );
    }
    if (current.mcpServerCount > 0) {
      items.push(
        `${current.mcpServerCount} ${
          current.mcpServerCount === 1 ? 'MCP server' : 'MCP servers'
        }`,
      );
    }
    if (current.hasClaudeMd) {
      items.push('CLAUDE.md');
    }
    if (current.hasSystemPrompt) {
      items.push('System prompt');
    }
    return items.length > 0 ? items : ['Persona configuration'];
  });

  protected readonly isApplying = computed(
    () => this.applyState().status === 'applying',
  );

  /** True when the applied state still matches the shown proposal (nothing new to write). */
  private readonly isAlreadyApplied = computed(() => {
    const state = this.applyState();
    const current = this.visibleProposal();
    if (state.status !== 'applied' || !current) return false;
    return (
      state.appliedConfigFingerprint === undefined ||
      state.appliedConfigFingerprint ===
        fingerprintHarnessConfig(current.configUpdates)
    );
  });

  protected readonly isApplyDisabled = computed(
    () =>
      this.isStreaming() ||
      this.isApplying() ||
      this.isAlreadyApplied() ||
      this.visibleProposal()?.isConfigComplete === false,
  );

  protected readonly appliedLabel = computed<string | null>(() => {
    const state = this.applyState();
    if (state.status !== 'applied') return null;
    const count = state.appliedCount ?? 0;
    return `Applied · ${count} ${count === 1 ? 'file' : 'files'} written`;
  });

  protected readonly warnings = computed<readonly string[]>(() => {
    const state = this.applyState();
    return state.status === 'applied' ? (state.warnings ?? []) : [];
  });

  protected readonly applyError = computed<string | null>(() => {
    const state = this.applyState();
    if (state.status !== 'error') return null;
    return (
      state.errorMessage ??
      'Could not apply the harness configuration. Please try again.'
    );
  });

  protected onApplyClick(): void {
    if (this.isApplyDisabled()) return;
    this.applyRequested.emit();
  }
}
