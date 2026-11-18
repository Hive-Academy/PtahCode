/**
 * McpPortConfigComponent - MCP Server Port & Browser automation configuration
 *
 * Card on the Advanced tab (pattern map rows A30-A32, P2/P3/P4).
 * Combines MCP server port configuration (P3 policy bar), MCP tool namespaces (P4 matrix),
 * and browser "Allow localhost" access (folded from retired browser-settings, A32).
 *
 * All writes route through {@link SettingsSaveFeedbackService.saveGeneric}:
 * - Port save (A30): S-explicit with Undo restoring the previous port and persistent restart note.
 * - External caller access: immediate selection with Undo restoring the previous access level.
 * - Tool namespaces (A31): S-sel with Undo restoring the previous disabled array.
 * - Allow localhost (A32): Enabling requires inline confirmation (S-confirm, P8); disabling is immediate with Undo (S-sel).
 * - Host error text is never surfaced to visible text or toasts (D15).
 *
 * Every control stays disabled until `agent:getConfig` has answered. A failed read shows a fixed error with
 * Retry instead of the defaults, because a write built on defaults would overwrite the stored namespace list.
 */

import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  effect,
  untracked,
  computed,
  OnInit,
  ElementRef,
  Injector,
  afterNextRender,
  viewChild,
} from '@angular/core';
import { AdvancedOverviewStore } from '../advanced/advanced-overview.store';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plug, AlertCircle, Info } from 'lucide-angular';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { McpExternalCallerAccess } from '@ptah-extension/shared';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { SettingsBusyDisabledDirective } from '../feedback/busy-disabled.directive';
import {
  PtahBadgeDirective,
  PtahButtonDirective,
  PtahCheckboxDirective,
  PtahIconButtonDirective,
  NativePopoverComponent,
  PtahInputDirective,
  PtahRichSelectComponent,
  type PtahSelectOption,
  PtahFormSectionComponent,
  PtahFieldComponent,
  PtahInlineConfirmComponent,
  PtahAlertComponent,
  PtahStatusComponent,
} from '@ptah-extension/ui';

export const COULD_NOT_SAVE_PORT = 'Could not save the MCP port.';
export const COULD_NOT_UPDATE_NAMESPACES =
  'Could not update MCP tool namespaces.';
export const COULD_NOT_UPDATE_LOCALHOST =
  'Could not update browser localhost setting.';
export const COULD_NOT_UPDATE_EXTERNAL_CALLER_ACCESS =
  'Could not update external MCP caller access.';
export const COULD_NOT_LOAD_MCP_CONFIG =
  'Could not load the MCP and browser settings.';

@Component({
  selector: 'ptah-mcp-port-config',
  standalone: true,
  imports: [
    SettingsBusyDisabledDirective,
    LucideAngularModule,
    FormsModule,
    PtahBadgeDirective,
    PtahButtonDirective,
    PtahCheckboxDirective,
    PtahIconButtonDirective,
    NativePopoverComponent,
    PtahInputDirective,
    PtahRichSelectComponent,
    PtahFormSectionComponent,
    PtahFieldComponent,
    PtahInlineConfirmComponent,
    PtahAlertComponent,
    PtahStatusComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section data-glass-surface="content" aria-labelledby="mcp-browser-heading">
      <h2 id="mcp-browser-heading" class="sr-only">MCP &amp; Browser</h2>
      <ptah-form-section
        id="advanced-mcp-server"
        [wide]="true"
        heading="MCP & Browser"
        description="The local server that gives agents the Ptah tools."
        [level]="2"
        [divider]="true"
      >
        @if (loaded()) {
          <ptah-status aside status="online" [label]="'Port ' + savedPort()" />
        } @else if (loadState() === 'failed') {
          <ptah-status aside status="failed" label="Could not load" />
        }
        @if (loadState() === 'failed') {
          <ptah-alert
            tone="error"
            role="alert"
            live="assertive"
            data-testid="mcp-config-load-error"
            >{{ loadErrorMessage }}
            <button
              alertAction
              type="button"
              ptahButton
              variant="ghost"
              size="xs"
              (click)="loadConfig()"
              data-testid="mcp-config-load-retry"
            >
              Retry
            </button></ptah-alert
          >
        }
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-ptah-controls">
        <ptah-field
          label="MCP port"
          class="w-full min-w-0"
          [error]="validationError() ?? saveError()"
          errorRole="alert"
          errorTestId="mcp-port-validation-error"
        >
          <input
            id="mcp-port-input"
            type="number"
            ptahInput
            tone="mono"
            class="w-full min-w-0"
            [ngModel]="portValue()"
            (ngModelChange)="onPortInput($event)"
            [min]="1024"
            [max]="65535"
            [disabled]="saving() || !loaded()"
            aria-label="MCP server port"
            aria-describedby="mcp-port-hint"
            data-testid="mcp-port-input"
          />

          <!-- Before the footer, so the error never hides the range and restart note. -->
          <p
            ptahFieldBeforeHint
            id="mcp-port-hint"
            class="text-xs text-base-content-muted"
            data-testid="mcp-port-hint"
          >
            Default 51820. Range 1024 to 65535. Changes apply after the MCP
            server restarts.
          </p>
        </ptah-field>
          <button
            type="button"
            ptahButton
            variant="secondary"
            class="h-[var(--ptah-field-h-md)]"
            (click)="savePort()"
            [busy]="saving()"
            [disabled]="!loaded() || !isDirty() || validationError() !== null"
            aria-label="Save MCP port"
            data-testid="mcp-port-save-btn"
          >
            Save
          </button>
        </div>
        <ptah-field
          label="External MCP callers"
          class="w-full min-w-0"
        >
          <ptah-select
            triggerId="mcp-external-caller-access"
            [options]="callerOptions"
            [value]="externalCallerAccess()"
            (valueChange)="onExternalCallerAccessChange($event ?? 'read-only')"
            [disabled]="saving() || !loaded()"
            data-testid="mcp-external-caller-access"
          />
        </ptah-field>
        <div class="flex items-center gap-ptah-controls text-xs">
          <p data-testid="mcp-external-caller-access-hint"
            [class.text-warning]="externalCallerAccess() === 'full'"
            [class.text-base-content-muted]="externalCallerAccess() === 'read-only'">
            External tools stay read-only until you select Full access.
          </p>
          <ptah-native-popover [isOpen]="callerInfoOpen()" [keepInViewport]="true" (closed)="callerInfoOpen.set(false)">
            <button trigger type="button" ptahIconButton size="xs" label="About external MCP caller access" aria-label="About external MCP caller access" (click)="callerInfoOpen.set(!callerInfoOpen())"><lucide-angular [img]="InfoIcon" /></button>
            <p content class="max-w-xs text-sm">Full access lets other local tools call privileged Ptah tools, including execute_code, but cannot cross workspaces.</p>
          </ptah-native-popover>
        </div>
        @for (ns of namespaceOptions; track ns.id) {
          <div class="flex min-h-12 items-start gap-ptah-controls border-b border-surface-border py-ptah-controls">
            <input
              type="checkbox"
              ptahCheckbox size="xs"
              [checked]="isNamespaceEnabled(ns.id)"
              (change)="toggleNamespace(ns.id)"
              [ptahBusyDisabled]="saving() || !loaded()"
              [attr.aria-label]="'Toggle ' + ns.label + ' namespace'"
              [attr.data-testid]="'settings-toggle-mcp-namespace-' + ns.id"
            />
            <div class="min-w-0 flex-1 text-xs">
              <span class="font-semibold text-base-content">{{ ns.label }}</span>
              <span class="ml-[var(--ptah-gap-inline)] text-base-content-muted">{{ ns.description }}</span>
            </div>
            <span ptahBadge appearance="outline" size="xs" class="shrink-0">{{ ns.toolCount }} tools</span>
          </div>
        }
        <div class="flex min-h-12 items-start gap-ptah-controls border-b border-surface-border py-ptah-controls">
          <input
            #allowLocalhostToggle
            type="checkbox"
            ptahCheckbox size="xs"
            [checked]="browserAllowLocalhost()"
            (change)="onAllowLocalhostToggle($event)"
            [disabled]="saving() || !loaded() || confirmingAllowLocalhost()"
            aria-label="Allow localhost access for browser tools"
            data-testid="settings-toggle-browser-allow-localhost"
          />
          <div class="min-w-0 flex-1 text-xs">
            <div class="flex items-center gap-ptah-controls">
              <span class="font-semibold text-base-content">Allow localhost</span>
              <ptah-native-popover [isOpen]="localhostInfoOpen()" [keepInViewport]="true" (closed)="localhostInfoOpen.set(false)">
                <button trigger type="button" ptahIconButton size="xs" label="About localhost access" aria-label="About localhost access" (click)="localhostInfoOpen.set(!localhostInfoOpen())"><lucide-angular [img]="InfoIcon" /></button>
                <p content class="max-w-xs text-sm">Enables AI agents to access local network services, development servers, and local APIs.</p>
              </ptah-native-popover>
            </div>
            <p class="text-base-content-muted">Allow browser tools to navigate to localhost URLs.</p>
          </div>
        </div>
        @if (confirmingAllowLocalhost()) {
          <ptah-inline-confirm
            ariaLabel="Confirm allow localhost access"
            message="Enable localhost access?"
            detail="AI agents can reach local network services, development servers, and local APIs on this machine."
            confirmLabel="Allow localhost"
            tone="danger"
            [busy]="saving()"
            confirmTestId="allow-localhost-confirm-btn"
            cancelTestId="allow-localhost-cancel-btn"
            data-testid="allow-localhost-confirm"
            (confirm)="confirmEnableLocalhost()"
            (cancelled)="cancelEnableLocalhost()"
          />
        }
      </ptah-form-section>
    </section>
  `,
})
export class McpPortConfigComponent implements OnInit {
  private readonly callerSelect = viewChild(PtahRichSelectComponent);
  readonly callerInfoOpen = signal(false);
  readonly localhostInfoOpen = signal(false);
  readonly InfoIcon = Info;
  readonly callerOptions: readonly PtahSelectOption<McpExternalCallerAccess>[] = [
    { value: 'read-only', label: 'Read-only (recommended)' },
    { value: 'full', label: 'Full access' },
  ];
  private readonly overview = inject(AdvancedOverviewStore, { optional: true });

  constructor() {
    effect(() => {
      const entry = this.loaded() ? {
        value: 'Port ' + this.savedPort(),
        meta: this.savedExternalCallerAccess() === 'full' ? 'Full access' : 'Read-only',
        tone: 'ok' as const,
      } : null;
      untracked(() => entry ? this.overview?.report('mcp-server', entry) : this.overview?.clear('mcp-server'));
    });
  }

  private readonly rpcService = inject(ClaudeRpcService);
  private readonly feedback = inject(SettingsSaveFeedbackService);
  private readonly injector = inject(Injector);
  private readonly allowLocalhostToggle = viewChild<
    ElementRef<HTMLInputElement>
  >('allowLocalhostToggle');

  readonly PlugIcon = Plug;
  readonly AlertCircleIcon = AlertCircle;

  /** Save triggers disabled while any save is in flight (D3). */
  readonly saving = this.feedback.saving;

  /** `agent:getConfig` state; nothing is writable until it is `loaded` (Serious 3). */
  readonly loadState = signal<'loading' | 'loaded' | 'failed'>('loading');
  readonly loaded = computed(() => this.loadState() === 'loaded');
  readonly loadErrorMessage = COULD_NOT_LOAD_MCP_CONFIG;

  readonly portValue = signal<number>(51820);
  readonly savedPort = signal<number>(51820);
  readonly isDirty = computed(() => this.portValue() !== this.savedPort());
  readonly validationError = signal<string | null>(null);
  /** A failed port write. Separate from validation, so Save stays enabled for a retry (Moderate 5). */
  readonly saveError = signal<string | null>(null);

  /** External MCP caller access. Read-only is the default when the setting is absent. */
  readonly externalCallerAccess = signal<McpExternalCallerAccess>('read-only');
  readonly savedExternalCallerAccess =
    signal<McpExternalCallerAccess>('read-only');

  /** Namespace toggle state */
  readonly disabledNamespaces = signal<string[]>([]);
  readonly savedDisabledNamespaces = signal<string[]>([]);

  /** Browser allow localhost state (A32) */
  readonly browserAllowLocalhost = signal<boolean>(false);
  readonly savedBrowserAllowLocalhost = signal<boolean>(false);
  readonly confirmingAllowLocalhost = signal<boolean>(false);

  readonly namespaceOptions = [
    {
      id: 'browser',
      label: 'Browser Automation',
      description: 'Navigate, screenshot, click, type, evaluate',
      toolCount: 12,
    },
    {
      id: 'agent',
      label: 'CLI Agents',
      description: 'Spawn, monitor, and control CLI agents',
      toolCount: 6,
    },
    {
      id: 'git',
      label: 'Git Worktree',
      description: 'Create and manage git worktrees',
      toolCount: 3,
    },
    {
      id: 'ide',
      label: 'IDE / LSP',
      description: 'Symbol references, definitions, dirty files',
      toolCount: 3,
    },
    {
      id: 'json',
      label: 'JSON Validation',
      description: 'Validate and repair JSON files',
      toolCount: 1,
    },
  ] as const;

  async ngOnInit(): Promise<void> {
    await this.loadConfig();
  }

  /** Reads the stored config. A failure leaves every control disabled behind a fixed error with Retry. */
  async loadConfig(): Promise<void> {
    this.loadState.set('loading');
    try {
      const result = await this.rpcService.call('agent:getConfig', undefined);
      if (result.isSuccess() && result.data) {
        if (result.data.mcpPort) {
          this.portValue.set(result.data.mcpPort);
          this.savedPort.set(result.data.mcpPort);
        }
        const disabled = result.data.disabledMcpNamespaces ?? [];
        this.disabledNamespaces.set(disabled);
        this.savedDisabledNamespaces.set(disabled);
        const allowLocalhost = result.data.browserAllowLocalhost ?? false;
        this.browserAllowLocalhost.set(allowLocalhost);
        this.savedBrowserAllowLocalhost.set(allowLocalhost);
        const externalCallerAccess =
          result.data.mcpExternalCallerAccess ?? 'read-only';
        this.externalCallerAccess.set(externalCallerAccess);
        this.savedExternalCallerAccess.set(externalCallerAccess);
        this.loadState.set('loaded');
        return;
      }
    } catch {
      // Falls through to the failed state below.
    }
    this.loadState.set('failed');
  }

  onPortInput(value: number): void {
    this.portValue.set(value);
    this.saveError.set(null);

    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      this.validationError.set('Port must be a valid integer');
    } else if (value < 1024 || value > 65535) {
      this.validationError.set('Port must be between 1024 and 65535');
    } else {
      this.validationError.set(null);
    }
  }

  async savePort(): Promise<void> {
    if (!this.loaded()) return;
    const port = this.portValue();
    if (!Number.isFinite(port) || !Number.isInteger(port)) {
      this.validationError.set('Port must be a valid integer');
      return;
    }
    if (port < 1024 || port > 65535) {
      this.validationError.set('Port must be between 1024 and 65535');
      return;
    }

    this.validationError.set(null);
    this.saveError.set(null);
    const previousPort = this.savedPort();

    await this.feedback.saveGeneric({
      label: 'MCP port',
      write: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            mcpPort: port,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.savedPort.set(port);
            return { ok: true };
          }
          this.saveError.set(COULD_NOT_SAVE_PORT);
          return { ok: false, message: COULD_NOT_SAVE_PORT };
        } catch {
          this.saveError.set(COULD_NOT_SAVE_PORT);
          return { ok: false, message: COULD_NOT_SAVE_PORT };
        }
      },
      undo: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            mcpPort: previousPort,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.portValue.set(previousPort);
            this.savedPort.set(previousPort);
            return { ok: true };
          }
          return { ok: false, message: COULD_NOT_SAVE_PORT };
        } catch {
          return { ok: false, message: COULD_NOT_SAVE_PORT };
        }
      },
    });
  }

  async onExternalCallerAccessChange(
    value: McpExternalCallerAccess,
  ): Promise<void> {
    if (this.saving() || !this.loaded()) return;
    const previous = this.savedExternalCallerAccess();
    if (value === previous) return;

    this.externalCallerAccess.set(value);
    await this.feedback.saveGeneric({
      label: 'External MCP caller access',
      write: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            mcpExternalCallerAccess: value,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.savedExternalCallerAccess.set(value);
            return { ok: true };
          }
          this.externalCallerAccess.set(previous);
          return {
            ok: false,
            message: COULD_NOT_UPDATE_EXTERNAL_CALLER_ACCESS,
          };
        } catch {
          this.externalCallerAccess.set(previous);
          return {
            ok: false,
            message: COULD_NOT_UPDATE_EXTERNAL_CALLER_ACCESS,
          };
        }
      },
      undo: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            mcpExternalCallerAccess: previous,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.externalCallerAccess.set(previous);
            this.savedExternalCallerAccess.set(previous);
            return { ok: true };
          }
          return {
            ok: false,
            message: COULD_NOT_UPDATE_EXTERNAL_CALLER_ACCESS,
          };
        } catch {
          return {
            ok: false,
            message: COULD_NOT_UPDATE_EXTERNAL_CALLER_ACCESS,
          };
        }
      },
    });
    this.callerSelect()?.writeValue(this.externalCallerAccess());
  }

  isNamespaceEnabled(id: string): boolean {
    return !this.disabledNamespaces().includes(id);
  }

  async toggleNamespace(id: string): Promise<void> {
    if (this.saving() || !this.loaded()) return;
    const previous = [...this.disabledNamespaces()];
    const updated = previous.includes(id)
      ? previous.filter((n) => n !== id)
      : [...previous, id];

    const option = this.namespaceOptions.find((n) => n.id === id);
    const label = option ? `${option.label} namespace` : 'tool namespace';

    this.disabledNamespaces.set(updated);

    await this.feedback.saveGeneric({
      label,
      write: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            disabledMcpNamespaces: updated,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.savedDisabledNamespaces.set(updated);
            return { ok: true };
          }
          this.disabledNamespaces.set(previous);
          return { ok: false, message: COULD_NOT_UPDATE_NAMESPACES };
        } catch {
          this.disabledNamespaces.set(previous);
          return { ok: false, message: COULD_NOT_UPDATE_NAMESPACES };
        }
      },
      undo: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            disabledMcpNamespaces: previous,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.disabledNamespaces.set(previous);
            this.savedDisabledNamespaces.set(previous);
            return { ok: true };
          }
          return { ok: false, message: COULD_NOT_UPDATE_NAMESPACES };
        } catch {
          return { ok: false, message: COULD_NOT_UPDATE_NAMESPACES };
        }
      },
    });
  }

  onAllowLocalhostToggle(event?: Event): void {
    if (this.saving() || !this.loaded()) {
      if (event?.target) {
        (event.target as HTMLInputElement).checked =
          this.browserAllowLocalhost();
      }
      return;
    }
    if (!this.browserAllowLocalhost()) {
      // Revert native DOM checkbox so it stays unticked while confirm is open
      if (event?.target) {
        (event.target as HTMLInputElement).checked = false;
      }
      this.confirmingAllowLocalhost.set(true);
    } else {
      // Disabling is immediate with Undo (S-sel)
      void this.disableLocalhost();
    }
  }

  /**
   * Cancel and Esc close the confirm and return focus to the checkbox, once it is enabled again (P8). Esc
   * stops here, so an enclosing overlay does not also close.
   */
  cancelEnableLocalhost(event?: Event): void {
    if (!this.confirmingAllowLocalhost()) return;
    event?.stopPropagation();
    this.confirmingAllowLocalhost.set(false);
    afterNextRender(() => this.allowLocalhostToggle()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  async confirmEnableLocalhost(): Promise<void> {
    this.confirmingAllowLocalhost.set(false);

    await this.feedback.saveGeneric({
      label: 'Allow localhost',
      write: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            browserAllowLocalhost: true,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.browserAllowLocalhost.set(true);
            this.savedBrowserAllowLocalhost.set(true);
            return { ok: true };
          }
          this.browserAllowLocalhost.set(false);
          return { ok: false, message: COULD_NOT_UPDATE_LOCALHOST };
        } catch {
          this.browserAllowLocalhost.set(false);
          return { ok: false, message: COULD_NOT_UPDATE_LOCALHOST };
        }
      },
      undo: null, // S-confirm: no Undo when enabling
    });
  }

  private async disableLocalhost(): Promise<void> {
    const previous = this.browserAllowLocalhost();
    this.browserAllowLocalhost.set(false);

    await this.feedback.saveGeneric({
      label: 'Allow localhost',
      write: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            browserAllowLocalhost: false,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.savedBrowserAllowLocalhost.set(false);
            return { ok: true };
          }
          this.browserAllowLocalhost.set(previous);
          return { ok: false, message: COULD_NOT_UPDATE_LOCALHOST };
        } catch {
          this.browserAllowLocalhost.set(previous);
          return { ok: false, message: COULD_NOT_UPDATE_LOCALHOST };
        }
      },
      undo: async () => {
        try {
          const result = await this.rpcService.call('agent:setConfig', {
            browserAllowLocalhost: true,
          });
          if (result.isSuccess() && result.data?.success === true) {
            this.browserAllowLocalhost.set(true);
            this.savedBrowserAllowLocalhost.set(true);
            return { ok: true };
          }
          return { ok: false, message: COULD_NOT_UPDATE_LOCALHOST };
        } catch {
          return { ok: false, message: COULD_NOT_UPDATE_LOCALHOST };
        }
      },
    });
  }
}
