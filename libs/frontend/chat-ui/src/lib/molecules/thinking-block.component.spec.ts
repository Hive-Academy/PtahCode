import {
  ChangeDetectionStrategy,
  Component,
  Input,
  NgModule,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';

jest.mock('ngx-markdown', () => {
  @Component({
    // eslint-disable-next-line @angular-eslint/component-selector
    selector: 'markdown',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '<div></div>',
  })
  class MarkdownStubComponent {
    @Input() data: string | null | undefined;
  }

  @NgModule({
    imports: [MarkdownStubComponent],
    exports: [MarkdownStubComponent],
  })
  class MarkdownModule {}

  return { MarkdownModule, MarkdownComponent: MarkdownStubComponent };
});

import { TestBed } from '@angular/core/testing';
import { SURFACE_ACTIVE } from '@ptah-extension/core';
import type { ExecutionNode } from '@ptah-extension/shared';
import { ThinkingBlockComponent } from './thinking-block.component';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ThinkingBlockComponent direction', () => {
  it('isolates code controls and treats plain-text notes as prose', () => {
    const source = readFileSync(join(__dirname, 'thinking-block.component.ts'), 'utf8');
    expect(source).toMatch(/markdown \.code-block-container \{\s*direction: ltr;\s*unicode-bidi: isolate;/);
    expect(source).toMatch(/th, td, \.code-block-note\) \{\s*unicode-bidi: plaintext;/);
  });
  it('sets automatic direction on expanded markdown content', () => {
    TestBed.configureTestingModule({
      imports: [ThinkingBlockComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SURFACE_ACTIVE, useValue: signal(true) },
      ],
    });
    const fixture = TestBed.createComponent(ThinkingBlockComponent);
    fixture.componentRef.setInput('node', {
      id: 'thinking-1',
      type: 'text',
      status: 'completed',
      content: 'مرحبا',
    } as ExecutionNode);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    fixture.detectChanges();

    expect(
      (fixture.nativeElement as HTMLElement)
        .querySelector('markdown')
        ?.getAttribute('dir'),
    ).toBe('auto');
  });
});
