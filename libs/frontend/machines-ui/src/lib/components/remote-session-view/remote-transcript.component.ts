import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import {
  ThinkingBlockComponent,
  ToolCallHeaderComponent,
  ToolInputDisplayComponent,
  ToolOutputDisplayComponent,
} from '@ptah-extension/chat-ui';
import { MarkdownBlockComponent } from '@ptah-extension/markdown';
import type { RemoteTranscriptItem } from '../../utils/remote-transcript';

/**
 * A remote session's messages, drawn with the local transcript's
 * presentational pieces (design 4.6, 3.3): markdown text, the thinking block
 * and the tool call header, input and output from `@ptah-extension/chat-ui`.
 * The assistant author label names the machine ("Claude on Horus").
 *
 * Text goes through `ptah-markdown-block` (the one sanitising renderer);
 * nothing here binds HTML.
 */
@Component({
  selector: 'ptah-remote-transcript',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    MarkdownBlockComponent,
    ThinkingBlockComponent,
    ToolCallHeaderComponent,
    ToolInputDisplayComponent,
    ToolOutputDisplayComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="flex flex-col gap-4" data-testid="remote-transcript">
      @for (item of items(); track item.id; let last = $last) {
        @if (item.role === 'user') {
          <li class="flex justify-end" data-testid="remote-message-user">
            <div
              class="max-w-[80%] rounded-box bg-base-300 px-4 py-2 text-sm text-base-content"
            >
              <span class="sr-only">You:</span>
              <ng-container
                [ngTemplateOutlet]="children"
                [ngTemplateOutletContext]="{ $implicit: item.node }"
              />
            </div>
          </li>
        } @else {
          <li class="flex flex-col gap-1" data-testid="remote-message-assistant">
            <span
              class="text-xs font-semibold text-base-content-muted"
              data-testid="remote-message-author"
              >Claude on {{ machineName() }}</span
            >
            <div class="flex min-w-0 flex-col gap-2 text-sm text-base-content">
              <ng-container
                [ngTemplateOutlet]="children"
                [ngTemplateOutletContext]="{ $implicit: item.node }"
              />
              @if (streaming() && last && item.node.status === 'streaming') {
                <span
                  class="inline-block animate-pulse motion-reduce:animate-none"
                  aria-hidden="true"
                  data-testid="remote-caret"
                  >▌</span
                >
              }
            </div>
          </li>
        }
      }
    </ol>

    <ng-template #children let-node>
      @for (child of node.children; track child.id) {
        <ng-container
          [ngTemplateOutlet]="nodeTemplate"
          [ngTemplateOutletContext]="{ $implicit: child }"
        />
      }
    </ng-template>

    <ng-template #nodeTemplate let-node>
      @switch (node.type) {
        @case ('text') {
          <ptah-markdown-block [content]="node.content ?? ''" variant="auto" />
        }
        @case ('thinking') {
          <ptah-thinking-block [node]="node" />
        }
        @case ('tool') {
          <div
            class="rounded-md border border-surface-border bg-base-100 px-2 py-1"
            data-testid="remote-tool"
          >
            <ptah-tool-call-header
              [node]="node"
              [isCollapsed]="!expanded().has(node.id)"
              (toggleClicked)="toggle(node.id)"
            />
            @if (expanded().has(node.id)) {
              <div class="flex flex-col gap-1 pl-2">
                <ptah-tool-input-display [node]="node" />
                <ptah-tool-output-display [node]="node" />
                <ng-container
                  [ngTemplateOutlet]="children"
                  [ngTemplateOutletContext]="{ $implicit: node }"
                />
              </div>
            }
          </div>
        }
        @case ('agent') {
          <div
            class="flex flex-col gap-1 rounded-md border border-surface-border px-2 py-1"
            data-testid="remote-agent"
          >
            <span class="text-xs font-semibold text-base-content-muted"
              >Agent{{ node.agentType ? ': ' + node.agentType : '' }}</span
            >
            <ng-container
              [ngTemplateOutlet]="children"
              [ngTemplateOutletContext]="{ $implicit: node }"
            />
          </div>
        }
        @default {
          <ng-container
            [ngTemplateOutlet]="children"
            [ngTemplateOutletContext]="{ $implicit: node }"
          />
        }
      }
    </ng-template>
  `,
})
export class RemoteTranscriptComponent {
  public readonly items = input.required<readonly RemoteTranscriptItem[]>();
  /** Display-safe machine name for the author label. */
  public readonly machineName = input.required<string>();
  /** A turn is in flight: the last streaming message shows a caret. */
  public readonly streaming = input(false);

  /** Expanded tool calls; collapsed by default like the local transcript. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected toggle(id: string): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
}
