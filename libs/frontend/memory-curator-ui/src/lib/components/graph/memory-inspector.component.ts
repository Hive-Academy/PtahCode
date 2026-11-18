import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { MemoryGraphEdgeKind, MemoryGraphNodeWire, MemoryWire } from '@ptah-extension/shared';
import { PtahButtonDirective, PtahInlineConfirmComponent } from '@ptah-extension/ui';

export interface ConnectedMemory { readonly node: MemoryGraphNodeWire; readonly kind: MemoryGraphEdgeKind; readonly weight: number; }

@Component({
  selector: 'ptah-memory-inspector', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PtahButtonDirective, PtahInlineConfirmComponent],
  template: `
    <aside aria-label="Memory inspector" data-testid="memory-inspector" class="w-72 space-y-3 border-l border-surface-border bg-surface-2 p-3 text-sm">
      <div class="flex justify-between"><h3 class="font-semibold">Inspector</h3><button ptahButton type="button" size="xs" variant="ghost" aria-label="Close inspector" (click)="closed.emit()">Close</button></div>
      @if (nodes().length === 0) { <p class="text-base-content-muted">Select a node to see its content, its links and its actions. Shift-click adds more nodes.</p> }
      @else if (nodes().length > 1) {
        <p>{{ nodes().length }} memories selected</p>
        <ul class="space-y-1">@for (node of nodes(); track node.id) { <li><button ptahButton type="button" size="xs" variant="ghost" [attr.aria-label]="'Select memory ' + (node.subject || node.id)" (click)="selectNode.emit(node.id)">{{ node.subject || 'Untitled memory' }}</button></li> }</ul>
      } @else {
        @let node = nodes()[0];
        <h4 class="font-semibold">{{ node.subject || 'Untitled memory' }}</h4>
        <p class="text-base-content-muted">{{ node.kind }} · {{ node.tier }} · Salience {{ node.salience.toFixed(2) }} · {{ node.hits }} hits</p>
        <dl class="space-y-1 text-base-content-muted"><div><dt class="inline">Created: </dt><dd class="inline">{{ date(node.createdAt) }}</dd></div><div><dt class="inline">Last used: </dt><dd class="inline">{{ date(node.lastUsedAt) }}</dd></div><div><dt class="inline">Session: </dt><dd class="inline">{{ node.sessionId || 'None' }}</dd></div></dl>
        <p class="whitespace-pre-wrap break-words">{{ node.preview }}</p>
        @if (detailLoading()) { <p role="status">Loading full memory…</p> }
        @if (detail() && detail()?.id === node.id) { <section aria-label="Full content" class="whitespace-pre-wrap break-words">{{ detail()?.content }}</section> }
        <div class="flex flex-wrap gap-1">
          @if (node.pinned) { <button ptahButton type="button" size="xs" variant="ghost" data-testid="memory-entry-unpin" [disabled]="busy()" [attr.aria-label]="'Unpin entry ' + node.id" (click)="unpin.emit(node.id)">Unpin</button> }
          @else { <button ptahButton type="button" size="xs" variant="ghost" data-testid="memory-entry-pin" [disabled]="busy()" [attr.aria-label]="'Pin entry ' + node.id" (click)="pin.emit(node.id)">Pin</button> }
          @if (confirming()) { <ptah-inline-confirm message="Forget this memory?" tone="danger" [busy]="busy()" confirmLabel="Forget" (confirm)="forget.emit(node.id); confirming.set(false)" (cancelled)="confirming.set(false)" /> }
          @else { <button ptahButton type="button" size="xs" variant="ghost" data-testid="memory-entry-forget" [disabled]="busy()" [attr.aria-label]="'Forget entry ' + node.id" (click)="confirming.set(true)">Forget</button> }
        </div>
        <section aria-label="Connected memories"><h4 class="font-semibold">Connected ({{ connected().length }})</h4><ul>@for (link of connected(); track link.node.id + link.kind) { <li><button ptahButton type="button" size="xs" variant="ghost" [attr.aria-label]="'Select memory ' + (link.node.subject || link.node.id)" (click)="selectNode.emit(link.node.id)">{{ link.node.subject || 'Untitled memory' }} · {{ link.kind }} · {{ link.weight.toFixed(2) }}</button></li> }</ul></section>
      }
    </aside>
  `,
})
export class MemoryInspectorComponent {
  public readonly nodes = input.required<readonly MemoryGraphNodeWire[]>();
  public readonly connected = input<readonly ConnectedMemory[]>([]);
  public readonly detail = input<MemoryWire | null>(null);
  public readonly detailLoading = input(false);
  public readonly busy = input(false);
  public readonly pin = output<string>();
  public readonly unpin = output<string>();
  public readonly forget = output<string>();
  public readonly selectNode = output<string>();
  public readonly closed = output<void>();
  protected readonly confirming = signal(false);
  protected date(value: number): string { return new Date(value).toLocaleDateString(); }
}
