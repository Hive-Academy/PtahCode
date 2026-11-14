import type { DependencyContainer } from 'tsyringe';
import { ClaudeLedgerSource } from '../sources/claude-ledger.source';
import { UsagePricingService } from '../usage-pricing.service';
import { UsageAnalyticsService } from '../usage-summary.service';
import { UsageReconciliationService } from '../usage-reconciliation.service';
import { USAGE_ANALYTICS_TOKENS } from './tokens';

export function registerUsageAnalytics(container: DependencyContainer): void {
  container.registerSingleton(ClaudeLedgerSource);
  container.registerSingleton(UsagePricingService);
  container.registerSingleton(UsageAnalyticsService);
  container.registerSingleton(UsageReconciliationService);
  container.register(USAGE_ANALYTICS_TOKENS.USAGE_ANALYTICS_SERVICE, { useToken: UsageAnalyticsService });
}
