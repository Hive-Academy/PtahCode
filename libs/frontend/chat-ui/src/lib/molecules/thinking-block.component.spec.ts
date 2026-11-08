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

describe('ThinkingBlockComponent direction', () => {
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
