import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppStateManager } from '@ptah-extension/core';
import { PlanLimitsPanelComponent } from '../plan-limits/plan-limits-panel.component';
import { SkillSelectionCardComponent } from '../skill-selection-card/skill-selection-card.component';
import { UsageDashboardComponent } from '../usage-dashboard/usage-dashboard.component';
import { DashboardToolbarComponent } from './dashboard-toolbar.component';
import { PtahPageHeaderComponent } from '@ptah-extension/ui';

/**
 * DashboardGridComponent
 *
 * Top-level dashboard surface. Page chrome (header, the one toolbar, "Back"
 * navigation) lives here. Row order: KPI strip, plan limits, daily usage +
 * cost share, breakdown + top sessions, then skills. The usage
 * dashboard owns the KPI and chart rows and projects the plan-limits panel
 * between them, so limits show even while usage loads or fails.
 */
@Component({
  selector: 'ptah-dashboard-grid',
  standalone: true,
  imports: [
    DashboardToolbarComponent,
    PlanLimitsPanelComponent,
    UsageDashboardComponent,
    SkillSelectionCardComponent,
    PtahPageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-grid.component.html',
  // This surface owns its own scrolling. Its root is `min-h-full`, so its
  // content is designed to exceed the viewport and something must scroll it.
  // The host is that something: `min-h-full` grows rather than scrolling, so
  // the scroll container has to be a height-bounded ancestor, not the root div.
  //
  // It lives here and not on the shared router-outlet wrapper in
  // `app-shell.component.html` on purpose. Before TASK_2026_524 batch 1 each
  // surface carried its own box and only this one added `overflow-y-auto`;
  // batch 1 collapsed the nine boxes into one and handed that scroll container
  // to all nine. Keeping it here means a surface gets a scrollbar only if it
  // asks for one.
  host: { class: 'block h-full overflow-y-auto' },
})
export class DashboardGridComponent {
  private readonly appState = inject(AppStateManager);

  navigateBack(): void {
    this.appState.setCurrentView('chat');
  }
}
