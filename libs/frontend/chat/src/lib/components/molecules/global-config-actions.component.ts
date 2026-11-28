import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import {
  AppStateManager,
  type ConfigurationSurfaceId,
} from '@ptah-extension/core';
import {
  LucideAngularModule,
  type LucideIconData,
  RadioTower,
  Settings,
  Store,
  Wrench,
} from 'lucide-angular';

import { PtahIconButtonDirective } from '@ptah-extension/ui';
/**
 * Global configuration actions for the Electron navbar: Thoth, Marketplace,
 * Setup and Settings as icon buttons, next to the theme toggle. They show
 * with and without a workspace folder; the navbar tabs hold the work views.
 *
 * The `config-menu-item-<id>` hooks are kept from the former dropdown menu:
 * the Electron e2e specs and the showcase harness address surfaces by them.
 */
@Component({
  selector: 'ptah-global-config-actions',
  standalone: true,
  imports: [LucideAngularModule, PtahIconButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of items; track item.id) {
      <button
        type="button"
        ptahIconButton [label]="item.label"
        [attr.data-test]="'config-menu-item-' + (item.testId ?? item.id)"
        [selected]="openConfigurationSurface() === item.id"
        selectedAs="current"
        (click)="selectItem(item.id)"
      >
        <lucide-angular [img]="item.icon" class="w-4 h-4" aria-hidden="true" />
      </button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class GlobalConfigActionsComponent {
  private readonly appState = inject(AppStateManager);

  protected readonly openConfigurationSurface =
    this.appState.openConfigurationSurface;
  protected readonly items: readonly {
    id: ConfigurationSurfaceId;
    testId?: string;
    label: string;
    title?: string;
    icon: LucideIconData;
  }[] = [
    {
      id: 'thoth',
      label: 'Thoth',
      title: 'Thoth — agentic platform',
      icon: RadioTower,
    },
    { id: 'marketplace', label: 'Marketplace', icon: Store },
    { id: 'onboarding', testId: 'setup-hub', label: 'Setup', icon: Wrench },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  protected selectItem(id: ConfigurationSurfaceId): void {
    if (id === 'thoth' && !this.appState.thothFirstRunDismissed()) {
      this.appState.dismissThothFirstRun();
    }
    this.appState.setCurrentView(id);
  }
}
