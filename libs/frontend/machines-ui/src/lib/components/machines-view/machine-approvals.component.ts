import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  MachinesStore,
  type MachinePendingApproval,
  type MachinesError,
} from '../../services/machines-store';
import { refusalSentence } from '../../utils/remote-session-copy';
import {
  RemoteApprovalBlockComponent,
  type RemoteApprovalDecision,
} from '../remote-approval-block/remote-approval-block.component';

const ANSWER_REJECTED_SENTENCE =
  'The answer did not reach the machine. Try again.';

/**
 * Approval cards at the top of the machine overview (machines-ux.md M11): one
 * card per tool approval that waits in an opened session of this machine. The
 * card is the same block as in the session view, so the tool, the arguments
 * with Copy, the countdown and Allow once / Deny stay in one place. A request
 * of a watch-only or cached session, or of a machine that is not connected,
 * shows without enabled answers, as in the session view.
 */
@Component({
  selector: 'ptah-machine-approvals',
  standalone: true,
  imports: [RemoteApprovalBlockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (approvals().length > 0) {
      <section
        class="flex flex-col gap-3"
        aria-label="Approvals waiting"
        data-testid="machine-approvals-waiting"
      >
        @for (entry of approvals(); track entry.request.id) {
          <ptah-remote-approval-block
            [request]="entry.request"
            [machineName]="machineName()"
            [mode]="entry.mode"
            [unavailableReason]="answerUnavailable()"
            [busy]="answering().has(entry.request.id)"
            [error]="errors().get(entry.request.id) ?? null"
            (answered)="answer(entry, $event)"
          />
        }
      </section>
    }
  `,
})
export class MachineApprovalsComponent {
  private readonly store = inject(MachinesStore);

  public readonly machineId = input.required<string>();
  /** Display-safe machine name. */
  public readonly machineName = input.required<string>();

  protected readonly approvals = computed(
    () =>
      this.store.pendingApprovalRequestsByMachine().get(this.machineId()) ?? [],
  );
  /** Same rule as the session view: no answer while the machine is offline. */
  protected readonly answerUnavailable = computed(() => {
    const id = this.machineId();
    const machine = this.store.machines().find((m) => m.machineId === id);
    return machine?.state === 'connected'
      ? null
      : `${this.machineName()} is not connected.`;
  });
  protected readonly answering = signal<ReadonlySet<string>>(new Set());
  protected readonly errors = signal<ReadonlyMap<string, MachinesError>>(
    new Map(),
  );

  protected async answer(
    entry: MachinePendingApproval,
    decision: RemoteApprovalDecision,
  ): Promise<void> {
    const id = entry.request.id;
    if (this.answering().has(id)) return;
    this.answering.update((set) => new Set(set).add(id));
    this.errors.update((map) => {
      const next = new Map(map);
      next.delete(id);
      return next;
    });
    let error: MachinesError | null;
    try {
      const outcome = await this.store.respondPermission(
        this.machineId(),
        entry.sessionId,
        id,
        decision,
      );
      error = outcome.ok
        ? null
        : 'error' in outcome
          ? outcome.error
          : { message: refusalSentence(outcome.refused, this.machineName()) };
    } catch {
      // The store reports failures as outcomes; a rejection is unexpected,
      // so it is shown on the request's card instead of being dropped. Its
      // raw message may carry transport or provider detail and stays out of
      // the UI.
      error = { message: ANSWER_REJECTED_SENTENCE };
    }
    this.answering.update((set) => {
      const next = new Set(set);
      next.delete(id);
      return next;
    });
    if (error !== null) {
      const failure = error;
      this.errors.update((map) => new Map(map).set(id, failure));
    }
  }
}
