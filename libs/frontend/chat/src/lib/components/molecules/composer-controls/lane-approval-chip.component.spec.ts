import { TestBed } from '@angular/core/testing';
import { LaneApprovalChipComponent } from './lane-approval-chip.component';

function setup(inputs: {
  label: string;
  reason?: string | null;
  pending?: boolean;
}) {
  const fixture = TestBed.createComponent(LaneApprovalChipComponent);
  fixture.componentRef.setInput('label', inputs.label);
  if (inputs.reason !== undefined) {
    fixture.componentRef.setInput('reason', inputs.reason);
  }
  if (inputs.pending !== undefined) {
    fixture.componentRef.setInput('pending', inputs.pending);
  }
  fixture.detectChanges();
  const chip = fixture.nativeElement.querySelector(
    '[data-testid="lane-approval-chip"]',
  ) as HTMLButtonElement;
  return { fixture, chip };
}

describe('LaneApprovalChipComponent', () => {
  it('shows the effective mode, read-only and focusable, with the reason as description', () => {
    const { fixture, chip } = setup({
      label: 'Auto',
      reason: 'The Copilot lane runs with all tools allowed.',
    });
    expect(chip.textContent).toContain('Auto');
    expect(chip.getAttribute('aria-label')).toBe('Approval mode: Auto');
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(chip.disabled).toBe(false);
    expect(chip.getAttribute('title')).toBe(
      'The Copilot lane runs with all tools allowed.',
    );
    const node = fixture.nativeElement.querySelector(
      `#${chip.getAttribute('aria-describedby')}`,
    ) as HTMLElement;
    expect(node.textContent).toBe(
      'The Copilot lane runs with all tools allowed.',
    );
    expect(chip.classList.contains('h-7')).toBe(true);
    expect(chip.classList.contains('rounded-md')).toBe(true);
    expect(chip.classList.contains('border-dashed')).toBe(true);
  });

  it('emits the reason on click and never opens anything', () => {
    const { fixture, chip } = setup({ label: 'Auto', reason: 'Set at spawn.' });
    const revealed: string[] = [];
    let cleared = 0;
    fixture.componentInstance.reasonRevealed.subscribe((r) =>
      revealed.push(r),
    );
    fixture.componentInstance.reasonCleared.subscribe(() => cleared++);
    chip.click();
    chip.dispatchEvent(new FocusEvent('blur'));
    expect(revealed).toEqual(['Set at spawn.']);
    expect(cleared).toBe(1);
    expect(
      document.querySelector('[role="dialog"], [role="menu"]'),
    ).toBeNull();
  });

  it('stays gated without a backend reason, explaining from the label', () => {
    const { chip } = setup({ label: 'Ask', reason: null });
    expect(chip.getAttribute('aria-disabled')).toBe('true');
    expect(chip.getAttribute('title')).toBe(
      'Approval mode: Ask. Set when the lane starts.',
    );
  });

  it('shows a spinner while the lane options load', () => {
    const { chip } = setup({ label: 'Checking', pending: true });
    expect(chip.querySelector('.loading-spinner')).not.toBeNull();
    expect(chip.textContent).toContain('Checking');
  });
});
