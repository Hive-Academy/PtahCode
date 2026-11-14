import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { TaskStatus } from '@ptah-extension/shared';
import {
  TaskCreateDialogComponent,
  type TaskCreateDraft,
} from './task-create-dialog.component';

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute('open');
    };
  }
});

describe('TaskCreateDialogComponent', () => {
  async function render(
    initialStatus: TaskStatus = 'backlog',
    creating = false,
  ): Promise<{
    fixture: ComponentFixture<TaskCreateDialogComponent>;
    drafts: TaskCreateDraft[];
    cancels: number[];
  }> {
    TestBed.configureTestingModule({ imports: [TaskCreateDialogComponent] });
    const fixture = TestBed.createComponent(TaskCreateDialogComponent);
    fixture.componentRef.setInput('initialStatus', initialStatus);
    fixture.componentRef.setInput('creating', creating);
    const drafts: TaskCreateDraft[] = [];
    const cancels: number[] = [];
    fixture.componentInstance.submitted.subscribe((draft) =>
      drafts.push(draft),
    );
    fixture.componentInstance.cancelled.subscribe(() => cancels.push(1));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, drafts, cancels };
  }

  const q = <T extends HTMLElement>(
    fixture: ComponentFixture<TaskCreateDialogComponent>,
    id: string,
  ) =>
    (fixture.nativeElement as HTMLElement).querySelector<T>(
      `[data-testid="${id}"]`,
    );

  function type(
    fixture: ComponentFixture<TaskCreateDialogComponent>,
    value: string,
  ): void {
    const input = q<HTMLInputElement>(fixture, 'tasks-create-title');
    if (input === null) throw new Error('no title input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(fixture: ComponentFixture<TaskCreateDialogComponent>): void {
    q(fixture, 'tasks-create-submit')
      ?.closest('form')
      ?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  it('opens with the status of the lane that launched it', async () => {
    const { fixture } = await render('in_review');
    expect(q<HTMLSelectElement>(fixture, 'tasks-create-status')?.value).toBe(
      'in_review',
    );
  });

  it('focuses the title on open', async () => {
    const { fixture } = await render();
    expect(document.activeElement).toBe(q(fixture, 'tasks-create-title'));
  });

  it('shows inline validation and emits nothing without a title', async () => {
    const { fixture, drafts } = await render();

    submit(fixture);

    const error = q(fixture, 'tasks-create-title-error');
    expect(error?.textContent).toContain('A task needs a title.');
    expect(q(fixture, 'tasks-create-title')?.getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(drafts).toEqual([]);
  });

  it('emits a trimmed draft with the chosen type and status', async () => {
    const { fixture, drafts } = await render();
    type(fixture, '  Ship the board  ');
    const status = q<HTMLSelectElement>(fixture, 'tasks-create-status');
    if (status === null) throw new Error('no status select');
    status.value = 'blocked';
    status.dispatchEvent(new Event('change'));
    const kind = q<HTMLSelectElement>(fixture, 'tasks-create-type');
    if (kind === null) throw new Error('no type select');
    kind.value = 'BUGFIX';
    kind.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    submit(fixture);

    expect(drafts).toEqual([
      {
        title: 'Ship the board',
        type: 'BUGFIX',
        status: 'blocked',
        description: '',
      },
    ]);
  });

  it('cancels on Escape and from the Cancel button', async () => {
    const { fixture, cancels } = await render();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector(
      'dialog',
    );

    dialog?.dispatchEvent(new Event('cancel'));
    q(fixture, 'tasks-create-cancel')?.click();

    expect(cancels).toHaveLength(2);
  });

  it('prevents the native cancel event while a create is in flight', async () => {
    const { fixture, cancels } = await render('backlog', true);
    const event = new Event('cancel', { cancelable: true });

    (fixture.nativeElement as HTMLElement)
      .querySelector('dialog')
      ?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(cancels).toEqual([]);
  });

  it('lets the native cancel event through and emits cancelled when idle', async () => {
    const { fixture, cancels } = await render();
    const event = new Event('cancel', { cancelable: true });

    (fixture.nativeElement as HTMLElement)
      .querySelector('dialog')
      ?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(cancels).toHaveLength(1);
  });

  it('cannot be cancelled or resubmitted while a create is in flight', async () => {
    const { fixture, drafts, cancels } = await render('backlog', true);
    type(fixture, 'Ship the board');

    (fixture.nativeElement as HTMLElement)
      .querySelector('dialog')
      ?.dispatchEvent(new Event('cancel', { cancelable: true }));
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.modal-backdrop button')
      ?.click();
    submit(fixture);

    expect(cancels).toEqual([]);
    expect(drafts).toEqual([]);
    expect(q<HTMLButtonElement>(fixture, 'tasks-create-submit')?.disabled).toBe(
      true,
    );
  });

  it('wraps Tab from the last control back to the first', async () => {
    jest
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{}] as unknown as DOMRectList);
    const { fixture } = await render();
    type(fixture, 'Ship the board');
    const submitButton = q<HTMLButtonElement>(fixture, 'tasks-create-submit');
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });

    submitButton?.focus();
    submitButton?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(q(fixture, 'tasks-create-title'));
    jest.restoreAllMocks();
  });

  it('uses the native modal with a named title and token spacing', async () => {
    const { fixture } = await render();
    const modal = q(fixture, 'tasks-create-dialog');
    const dialog = modal?.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    expect(dialog?.getAttribute('aria-labelledby')).toBe('task-create-title');
    expect(dialog?.querySelector('.modal-box')?.className).toContain(
      'max-w-sm',
    );
    expect(modal?.querySelector('form.flex')?.className).toContain(
      'gap-[var(--ptah-gap-field)]',
    );
  });
});
