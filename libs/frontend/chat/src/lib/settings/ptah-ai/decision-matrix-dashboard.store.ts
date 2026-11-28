import { Injectable, signal } from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import type {
  AgentGetCapabilityMatrixResult,
  AgentGetRoutingEvidenceResult,
} from '@ptah-extension/shared';

@Injectable()
export class DecisionMatrixDashboardStore {
  private readonly evidenceState = signal<AgentGetRoutingEvidenceResult | 'loading' | 'error'>('loading');
  private readonly ratingsState = signal<AgentGetCapabilityMatrixResult | 'loading' | 'error'>('loading');
  private readonly updatedAtState = signal<number | null>(null);
  private evidenceRequest = 0;
  private ratingsRequest = 0;
  readonly evidence = this.evidenceState.asReadonly();
  readonly ratings = this.ratingsState.asReadonly();
  readonly updatedAt = this.updatedAtState.asReadonly();

  /* eslint-disable @angular-eslint/prefer-inject -- This feature uses constructor injection. */
  constructor(
    private readonly rpc: ClaudeRpcService,
    private readonly logger: LoggingService,
  ) {}
  /* eslint-enable @angular-eslint/prefer-inject */

  refresh(): void {
    void this.loadEvidence();
    void this.loadRatings();
  }

  async loadEvidence(): Promise<void> {
    const request = ++this.evidenceRequest;
    this.evidenceState.set('loading');
    this.updatedAtState.set(null);
    try {
      const response = await this.rpc.call('agent:getRoutingEvidence', {}, { timeout: 5_000 });
      if (request !== this.evidenceRequest) return;
      if (response.isSuccess()) {
        this.evidenceState.set(response.data);
        this.updatedAtState.set(Date.now());
        return;
      }
    } catch (error) {
      // degradation-audit: reported - the page shows a retryable evidence error.
      this.logger.warn('DecisionMatrixDashboard', 'agent:getRoutingEvidence failed', error);
    }
    if (request === this.evidenceRequest) this.evidenceState.set('error');
  }

  async loadRatings(): Promise<void> {
    const request = ++this.ratingsRequest;
    this.ratingsState.set('loading');
    try {
      const response = await this.rpc.call('agent:getCapabilityMatrix', {}, { timeout: 5_000 });
      if (request !== this.ratingsRequest) return;
      if (response.isSuccess()) {
        this.ratingsState.set(response.data);
        return;
      }
    } catch (error) {
      // degradation-audit: reported - the ratings mode shows a retryable error.
      this.logger.warn('DecisionMatrixDashboard', 'agent:getCapabilityMatrix failed', error);
    }
    if (request === this.ratingsRequest) this.ratingsState.set('error');
  }
}
