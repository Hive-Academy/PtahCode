import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  PtahEditableSectionComponent,
  PtahEditTemplateDirective,
} from './editable-section.component';

/** jsdom has no HTMLDialogElement methods. The stub reflects the `open` attribute. */
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    } as HTMLDialogElement['showModal'];
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    } as HTMLDialogElement['close'];
  }
});

const RAW_SPACING = /\b(gap|p|px|py|m|mx|my|space-[xy])-\d/;

@Component({
  standalone: true,
  imports: [PtahEditableSectionComponent, PtahEditTemplateDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-editable-section
      [heading]="heading()"
      [description]="description()"
      [level]="level()"
      [surface]="surface()"
      [editing]="editing()"
      [dirty]="dirty()"
      [saving]="saving()"
      [error]="error()"
      [disabled]="disabled()"
      [disabledReason]="disabledReason()"
      (edit)="onEdit()"
      (save)="onSave()"
      (cancel)="onCancel()"
    >
      <span status data-testid="status">Beta</span>
      @if (hasView()) {
        <p view data-testid="view-content">Ada Lovelace</p>
      }
      <ng-template ptahEditTemplate>
        @if (withField()) {
          <input data-testid="name-input" aria-label="Name" />
        }
      </ng-template>
    </ptah-editable-section>
  `,
})
class HostComponent {
  readonly heading = signal('Profile');
  readonly description = signal<string | null>('Shown to other users');
  readonly level = signal<number | string>(3);
  readonly surface = signal(false);
  readonly editing = signal(false);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly disabled = signal(false);
  readonly disabledReason = signal<string | null>(null);
  readonly hasView = signal(true);
  readonly withField = signal(true);
  readonly edits: string[] = [];
  onEdit(): void {
    this.edits.push('edit');
  }
  onSave(): void {
    this.edits.push('save');
  }
  onCancel(): void {
    this.edits.push('cancel');
  }
}

describe('PtahEditableSectionComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;

  const q = <T extends HTMLElement = HTMLElement>(sel: string): T | null => el.querySelector<T>(sel);
  const editButton = (): HTMLButtonElement | null => q<HTMLButtonElement>('[data-ptah-editable-edit]');
  const cancelButton = (): HTMLButtonElement => q<HTMLButtonElement>('[data-ptah-editable-cancel]') as HTMLButtonElement;
  const saveButton = (): HTMLButtonElement => q<HTMLButtonElement>('[data-ptah-editable-save]') as HTMLButtonElement;
  const form = (): HTMLFormElement | null => q<HTMLFormElement>('[data-ptah-editable-form]');
  const dialog = (): HTMLDialogElement => q<HTMLDialogElement>('dialog') as HTMLDialogElement;
  const heading = (): HTMLElement => q('.ptah-section-title') as HTMLElement;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openEdit(): Promise<void> {
    host.editing.set(true);
    await settle();
  }

  function pressEscape(target: HTMLElement, prevented = false): void {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    if (prevented) event.preventDefault();
    target.dispatchEvent(event);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  afterEach(() => fixture.destroy());

  describe('view mode', () => {
    it('marks the host and renders a region named by the heading', () => {
      const patternHost = q('ptah-editable-section') as HTMLElement;
      expect(patternHost.getAttribute('data-ptah-pattern')).toBe('editable-section');
      const region = q('section') as HTMLElement;
      expect(region.getAttribute('role')).toBe('region');
      const id = region.getAttribute('aria-labelledby');
      expect(id).toMatch(/^ptah-editable-section-\d+-heading$/);
      expect(heading().id).toBe(id);
      expect(heading().textContent?.trim()).toBe('Profile');
    });

    it.each([
      [2, 'H2'],
      [3, 'H3'],
      [4, 'H4'],
      ['9', 'H3'],
    ])('renders level %p as %s and keeps the heading id', async (level, tag) => {
      host.level.set(level);
      await settle();
      expect(heading().tagName).toBe(tag);
      expect(heading().id).toBe(q('section')?.getAttribute('aria-labelledby'));
    });

    it('shows the view slot, status, description and the Edit button', () => {
      expect(q('[data-testid="view-content"]')?.textContent).toBe('Ada Lovelace');
      expect(q('[data-ptah-editable-view]')?.hidden).toBe(false);
      expect(q('[data-testid="status"]')).not.toBeNull();
      expect(q('[data-testid="section-header-description"]')?.textContent?.trim()).toBe('Shown to other users');
      expect(editButton()?.textContent?.trim()).toBe('Edit');
      expect(editButton()?.getAttribute('aria-label')).toBe('Edit Profile');
      expect(editButton()?.closest('[data-testid="section-header-actions"]')).not.toBeNull();
      expect(form()).toBeNull();
    });

    it('emits edit on Edit click and does not change mode by itself', async () => {
      editButton()?.click();
      await settle();
      expect(host.edits).toEqual(['edit']);
      expect(form()).toBeNull();
    });

    it('shows the empty text and the Add label when the view slot is empty', async () => {
      host.hasView.set(false);
      await settle();
      expect(q('[data-ptah-editable-empty]')?.textContent?.trim()).toBe('Nothing set yet');
      expect(editButton()?.textContent?.trim()).toBe('Add');
      expect(editButton()?.getAttribute('aria-label')).toBe('Add Profile');
      host.hasView.set(true);
      await settle();
      expect(q('[data-ptah-editable-empty]')).toBeNull();
      expect(editButton()?.textContent?.trim()).toBe('Edit');
    });

    it('disables Edit with aria-disabled and the reason, and emits nothing', async () => {
      host.disabled.set(true);
      host.disabledReason.set('Ask an admin');
      await settle();
      const button = editButton() as HTMLButtonElement;
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('title')).toBe('Ask an admin');
      const reasonId = button.getAttribute('aria-describedby') as string;
      expect(el.querySelector(`[id="${reasonId}"]`)?.textContent).toBe('Ask an admin');
      button.click();
      await settle();
      expect(host.edits).toEqual([]);
    });

    it('applies the surface tokens only when surface is set', async () => {
      const region = q('section') as HTMLElement;
      expect(region.classList.contains('p-[var(--ptah-surface-pad)]')).toBe(false);
      host.surface.set(true);
      await settle();
      expect(region.classList.contains('p-[var(--ptah-surface-pad)]')).toBe(true);
      expect(region.classList.contains('rounded-[var(--ptah-card-radius)]')).toBe(true);
    });
  });

  describe('edit mode', () => {
    it('renders the template fields in a labelled form and hides the view and Edit', async () => {
      await openEdit();
      const editForm = form() as HTMLFormElement;
      expect(editForm.hasAttribute('novalidate')).toBe(true);
      expect(editForm.getAttribute('aria-labelledby')).toBe(heading().id);
      expect(q('[data-testid="name-input"]')?.closest('fieldset')).not.toBeNull();
      expect(q('[data-ptah-editable-view]')?.hidden).toBe(true);
      expect(editButton()).toBeNull();
      expect(cancelButton().textContent?.trim()).toBe('Cancel');
      expect(saveButton().getAttribute('type')).toBe('submit');
    });

    it('disables Save when not dirty and emits save on submit when dirty', async () => {
      await openEdit();
      expect(saveButton().disabled).toBe(true);
      form()?.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(host.edits).toEqual([]);
      host.dirty.set(true);
      await settle();
      expect(saveButton().disabled).toBe(false);
      expect(q('[data-ptah-form-actions-status]')?.textContent).toContain('Unsaved changes');
      form()?.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(host.edits).toEqual(['save']);
    });

    it('emits cancel once on a clean Cancel', async () => {
      await openEdit();
      cancelButton().click();
      await settle();
      expect(host.edits).toEqual(['cancel']);
      expect(dialog().hasAttribute('open')).toBe(false);
    });

    it('emits cancel on Escape when clean and ignores an Escape that a child handled', async () => {
      await openEdit();
      const input = q('[data-testid="name-input"]') as HTMLElement;
      pressEscape(input, true);
      expect(host.edits).toEqual([]);
      pressEscape(input);
      expect(host.edits).toEqual(['cancel']);
    });

    it('asks for confirmation on a dirty Cancel: Discard emits cancel', async () => {
      host.dirty.set(true);
      await openEdit();
      cancelButton().click();
      await settle();
      expect(host.edits).toEqual([]);
      expect(dialog().hasAttribute('open')).toBe(true);
      const titleId = dialog().getAttribute('aria-labelledby') as string;
      expect(el.querySelector(`[id="${titleId}"]`)?.textContent).toBe('Discard changes?');
      expect(q('[data-ptah-editable-confirm-body]')?.textContent?.trim()).toBe('Your edits to Profile will be lost.');
      expect(dialog().querySelector('.modal-box button')).toBe(q('[data-ptah-editable-keep]'));
      q('[data-ptah-editable-discard]')?.click();
      await settle();
      expect(host.edits).toEqual(['cancel']);
      expect(dialog().hasAttribute('open')).toBe(false);
    });

    it('asks for confirmation on a dirty Escape: Keep editing closes and focuses Cancel', async () => {
      host.dirty.set(true);
      await openEdit();
      pressEscape(q('[data-testid="name-input"]') as HTMLElement);
      await settle();
      expect(dialog().hasAttribute('open')).toBe(true);
      q('[data-ptah-editable-keep]')?.click();
      await settle();
      expect(dialog().hasAttribute('open')).toBe(false);
      expect(host.edits).toEqual([]);
      expect(form()).not.toBeNull();
      expect(document.activeElement).toBe(cancelButton());
    });

    it('marks saving: busy Save, disabled Cancel and fields, aria-busy, no Escape or cancel', async () => {
      host.dirty.set(true);
      await openEdit();
      host.saving.set(true);
      await settle();
      expect(form()?.getAttribute('aria-busy')).toBe('true');
      expect(saveButton().getAttribute('aria-busy')).toBe('true');
      expect(cancelButton().disabled).toBe(true);
      expect((q('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
      pressEscape(q('[data-testid="name-input"]') as HTMLElement);
      cancelButton().click();
      form()?.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      expect(host.edits).toEqual([]);
      expect(dialog().hasAttribute('open')).toBe(false);
    });

    it('shows the error alert, links it to the form and focuses it after a failed save', async () => {
      host.dirty.set(true);
      await openEdit();
      host.saving.set(true);
      await settle();
      host.saving.set(false);
      host.error.set('Could not save');
      await settle();
      const alert = q('[data-ptah-editable-error]') as HTMLElement;
      expect(alert.textContent?.trim()).toBe('Could not save');
      expect(alert.querySelector('[role="alert"]')).not.toBeNull();
      expect(form()?.getAttribute('aria-describedby')).toBe(alert.id);
      expect(document.activeElement).toBe(alert);
      expect(form()).not.toBeNull();
    });

    it('uses no raw spacing utility', async () => {
      host.surface.set(true);
      await openEdit();
      const nodes = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))];
      const raw = nodes.flatMap((node) => Array.from(node.classList)).filter((name) => RAW_SPACING.test(name));
      expect(raw).toEqual([]);
    });
  });

  describe('focus moves', () => {
    it('moves focus to the first field on edit and back to Edit on close', async () => {
      await openEdit();
      expect(document.activeElement).toBe(q('[data-testid="name-input"]'));
      host.editing.set(false);
      await settle();
      expect(document.activeElement).toBe(editButton());
    });

    it('focuses the heading when the edit slot has no focusable field', async () => {
      host.withField.set(false);
      await openEdit();
      expect(heading().getAttribute('tabindex')).toBe('-1');
      expect(document.activeElement).toBe(heading());
    });

    it('does not move focus on the first render', () => {
      expect(document.activeElement).not.toBe(editButton());
    });
  });
});
