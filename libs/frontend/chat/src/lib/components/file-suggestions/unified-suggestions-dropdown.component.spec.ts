import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { File } from 'lucide-angular';
import * as FloatingDom from '@floating-ui/dom';
import {
  UnifiedSuggestionsDropdownComponent,
  type SuggestionGroup,
} from './unified-suggestions-dropdown.component';
import type { SuggestionItem } from './suggestion-option.component';

jest.mock('@floating-ui/dom', () => {
  const actual = jest.requireActual('@floating-ui/dom');
  return {
    ...actual,
    computePosition: jest.fn().mockResolvedValue({ x: 0, y: 0 }),
    autoUpdate: jest.fn().mockReturnValue(() => undefined),
  };
});

function fileSuggestion(path: string, name: string): SuggestionItem {
  return {
    type: 'file',
    path,
    name,
    directory: '/workspace',
    isImage: false,
    isText: true,
    icon: File,
    description: path,
  };
}

function commandSuggestion(name: string): SuggestionItem {
  return {
    type: 'command',
    name,
    description: 'Orchestrate tasks',
    scope: 'builtin',
    icon: File,
  };
}

function promptSuggestion(
  label: string,
  category: string,
  text = `/orchestrate ${label}`,
): SuggestionItem {
  return {
    type: 'prompt',
    label,
    text,
    description: 'Plan, implement, review',
    category,
  };
}

@Component({
  standalone: true,
  imports: [UnifiedSuggestionsDropdownComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <ptah-unified-suggestions-dropdown
      [overlayOrigin]="overlayOrigin"
      [suggestions]="suggestions()"
      [groups]="groups()"
      [notice]="notice()"
      (suggestionSelected)="onSelected($event)"
    />
  `,
})
class HostComponent {
  @ViewChild(UnifiedSuggestionsDropdownComponent)
  dropdown!: UnifiedSuggestionsDropdownComponent;

  readonly overlayOrigin = {
    elementRef: new ElementRef(document.createElement('div')),
  };
  readonly suggestions = signal<SuggestionItem[]>([
    fileSuggestion('/workspace/a.ts', 'a.ts'),
    fileSuggestion('/workspace/b.ts', 'b.ts'),
    fileSuggestion('/workspace/c.ts', 'c.ts'),
    fileSuggestion('/workspace/d.ts', 'd.ts'),
  ]);
  readonly groups = signal<readonly SuggestionGroup[] | null>(null);
  readonly notice = signal<string | null>(null);
  readonly selectedItems: SuggestionItem[] = [];

  onSelected(item: SuggestionItem): void {
    this.selectedItems.push(item);
  }
}

describe('UnifiedSuggestionsDropdownComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    (FloatingDom.computePosition as unknown as jest.Mock).mockClear();

    await TestBed.configureTestingModule({
      imports: [HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      writable: true,
      configurable: true,
      value: jest.fn(),
    });

    fixture.detectChanges();
  });

  it('gives file, command and prompt suggestions a dense overlay surface', () => {
    for (const suggestion of [fileSuggestion('/a.ts', 'a.ts'), commandSuggestion('help'), promptSuggestion('Plan', 'Planning')]) {
      host.suggestions.set([suggestion]);
      fixture.detectChanges();
      const panel = (fixture.nativeElement as HTMLElement).querySelector('[role="listbox"]');
      expect(panel?.getAttribute('data-glass-surface')).toBe('overlay');
      expect(panel?.hasAttribute('data-composer-overlay')).toBe(true);
    }
  });

  it('resets the active row to the first match when typing narrows the suggestions', () => {
    host.dropdown.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    host.dropdown.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(host.dropdown.activeIndex()).toBe(2);

    host.suggestions.set([
      fileSuggestion('/workspace/a.ts', 'a.ts'),
      fileSuggestion('/workspace/b.ts', 'b.ts'),
    ]);
    fixture.detectChanges();

    expect(host.dropdown.activeIndex()).toBe(0);
  });

  describe('prompt suggestions (TASK_2026_721 B8c2)', () => {
    it('renders prompts after commands with a divider and category badge', () => {
      host.suggestions.set([
        commandSuggestion('orchestrate'),
        promptSuggestion('Orchestrate a feature', 'Build'),
        promptSuggestion('Security vulnerability scan', 'Review'),
      ]);
      fixture.detectChanges();

      const panel = fixture.nativeElement as HTMLElement;
      const options = Array.from(
        panel.querySelectorAll<HTMLElement>('ptah-suggestion-option'),
      );
      expect(options.length).toBe(3);
      expect(options[0]?.textContent).toContain('orchestrate');
      expect(options[1]?.textContent).toContain('Orchestrate a feature');
      expect(options[1]?.textContent).toContain('Prompt · Build');
      expect(options[2]?.textContent).toContain('Prompt · Review');

      const dividers = Array.from(
        panel.querySelectorAll('[role="presentation"]'),
      );
      expect(dividers.length).toBe(1);
      expect(dividers[0]?.textContent).toContain('Prompts');
      expect(panel.textContent).toContain('Commands & Prompts');
    });

    it('emits the prompt item when Enter selects the active prompt row', () => {
      host.suggestions.set([
        commandSuggestion('orchestrate'),
        promptSuggestion('Security vulnerability scan', 'Review'),
      ]);
      fixture.detectChanges();

      host.dropdown.onKeyDown(
        new KeyboardEvent('keydown', { key: 'ArrowDown' }),
      );
      expect(host.dropdown.activeIndex()).toBe(1);

      host.dropdown.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(host.selectedItems).toEqual([
        promptSuggestion('Security vulnerability scan', 'Review'),
      ]);
    });
  });

  describe('groups and notice rows (lane slash list)', () => {
    const enter = () => new KeyboardEvent('keydown', { key: 'Enter' });

    it('renders a header per group and a non-selectable notice for an empty one', () => {
      host.groups.set([
        { label: 'Commands', items: [commandSuggestion('review')] },
        { label: 'Skills', items: [], notice: 'No skills in Codex lanes.' },
      ]);
      fixture.detectChanges();

      const panel = fixture.nativeElement as HTMLElement;
      const headers = Array.from(
        panel.querySelectorAll('[role="presentation"]'),
      ).map((el) => el.textContent?.trim());
      expect(headers).toEqual(['Commands', 'Skills']);
      const notice = panel.querySelector('[data-testid="suggestion-notice"]');
      expect(notice?.getAttribute('role')).toBe('option');
      expect(notice?.getAttribute('aria-disabled')).toBe('true');
      expect(notice?.textContent).toContain('No skills in Codex lanes.');
      expect(panel.querySelectorAll('ptah-suggestion-option').length).toBe(1);
      expect(panel.textContent).toContain('Commands & Skills');

      host.dropdown.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      host.dropdown.onKeyDown(enter());
      expect(host.selectedItems).toEqual([commandSuggestion('review')]);
    });

    it('leaves out a group with no items and no notice', () => {
      host.groups.set([
        { label: 'Commands', items: [] },
        { label: 'Skills', items: [commandSuggestion('plan')] },
      ]);
      fixture.detectChanges();
      const headers = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          '[role="presentation"]',
        ),
      ).map((el) => el.textContent?.trim());
      expect(headers).toEqual(['Skills']);
    });

    it('shows only the notice row and selects nothing on Enter', () => {
      host.notice.set('Codex lanes take no slash commands or skills.');
      fixture.detectChanges();

      const panel = fixture.nativeElement as HTMLElement;
      expect(panel.querySelectorAll('ptah-suggestion-option').length).toBe(0);
      const rows = panel.querySelectorAll('[data-testid="suggestion-notice"]');
      expect(rows.length).toBe(1);
      expect(rows[0]?.textContent).toContain(
        'Codex lanes take no slash commands or skills.',
      );
      expect(host.dropdown.onKeyDown(enter())).toBe(true);
      expect(host.selectedItems).toEqual([]);
    });
  });
});
