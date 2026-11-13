import { SURFACE_ACTIVE } from '@ptah-extension/core';
import {
  inject,
  Component,
  input,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { MarkdownModule } from 'ngx-markdown';
import { SurfaceMarkdownPipe } from '@ptah-extension/markdown';
import { LucideAngularModule, ChevronDown, Brain } from 'lucide-angular';
import type { ExecutionNode } from '@ptah-extension/shared';
import { PtahSurfaceDirective } from '@ptah-extension/ui';

/**
 * ThinkingBlockComponent - Collapsible extended thinking content
 *
 * Complexity Level: 2 (Molecule with internal state)
 * Patterns: Composition, Signal-based collapse state
 *
 * Custom button-based toggle with chevron icon.
 * Collapsed by default to reduce visual clutter.
 */
@Component({
  selector: 'ptah-thinking-block',
  standalone: true,
  imports: [SurfaceMarkdownPipe, MarkdownModule, LucideAngularModule, PtahSurfaceDirective],
  template: `
    <div ptahSurface [translucent]="50" shadow="sm" padding="none" class="my-3">
      <!-- Card header (clickable to toggle) -->
      <button
        type="button"
        class="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-base-200 transition-colors cursor-pointer rounded-t-2xl"
        (click)="toggleCollapse()"
        [attr.aria-expanded]="!isCollapsed()"
        [attr.aria-controls]="'thinking-' + node().id"
      >
        <!-- Expand/Collapse chevron -->
        <lucide-angular
          [img]="ChevronIcon"
          class="w-3.5 h-3.5 flex-shrink-0 text-base-content-muted transition-transform duration-200"
          [class.rotate-0]="!isCollapsed()"
          [class.-rotate-90]="isCollapsed()"
        />

        <!-- Brain icon — the one brand accent this ambient block keeps -->
        <div
          class="w-6 h-6 rounded-full bg-base-300 flex items-center justify-center flex-shrink-0"
        >
          <lucide-angular
            [img]="BrainIcon"
            class="w-3.5 h-3.5 text-secondary"
          />
        </div>

        <span
          class="text-xs font-semibold tracking-wide text-base-content-muted"
          >Extended Thinking</span
        >

        <!-- Collapsed preview hint -->
        @if (isCollapsed()) {
          <span class="text-[10px] text-base-content-muted ml-auto">
            click to expand
          </span>
        }
      </button>

      <!-- Collapsible body -->
      @if (!isCollapsed()) {
        <div
          class="card-body px-4 pt-0 pb-4"
          [attr.id]="'thinking-' + node().id"
        >
          <div class="divider my-0 before:bg-base-300 after:bg-base-300"></div>
          <div
            class="prose prose-sm prose-invert max-w-none text-base-content-muted leading-relaxed"
          >
            <markdown
              dir="auto"
              [data]="node().content || '' | surfaceMarkdown: surfaceActive()"
            />
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host ::ng-deep markdown :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, th, td, .code-block-note) {
      unicode-bidi: plaintext;
      text-align: start;
    }
    :host ::ng-deep markdown :is(pre, code) {
      direction: ltr;
      unicode-bidi: isolate;
    }
    :host ::ng-deep markdown .code-block-container {
      direction: ltr;
      unicode-bidi: isolate;
    }
    :host ::ng-deep markdown pre {
      text-align: left;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThinkingBlockComponent {
  protected readonly surfaceActive = inject(SURFACE_ACTIVE);

  readonly node = input.required<ExecutionNode>();
  readonly isCollapsed = signal(true); // Collapsed by default
  readonly ChevronIcon = ChevronDown;
  readonly BrainIcon = Brain;

  protected toggleCollapse(): void {
    this.isCollapsed.update((val) => !val);
  }
}
