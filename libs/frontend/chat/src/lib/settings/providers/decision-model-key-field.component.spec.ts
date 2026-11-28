import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { DecisionModelKeyFieldComponent } from './decision-model-key-field.component';

describe('DecisionModelKeyFieldComponent info', () => {
  it('opens the full original help and preserves its accessible selectors', () => {
    const fixture = TestBed.createComponent(DecisionModelKeyFieldComponent);
    fixture.componentRef.setInput('label', 'Endpoint API key (optional)');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const help = host.querySelector('#decision-model-api-key-help');
    const expected =
      "Stored in this machine's secret storage. A stored key is never shown here.";
    expect(help?.textContent?.trim()).toBe(expected);
    expect(
      host
        .querySelector('input')
        ?.getAttribute('aria-describedby')
        ?.split(/\s+/),
    ).toContain('decision-model-api-key-help');
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="More about Endpoint API key (optional)"]',
    );
    expect(trigger).not.toBeNull();
    trigger?.click();
    fixture.detectChanges();
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(TestBed.inject(OverlayContainer).getContainerElement().querySelector('[role="dialog"]')?.textContent?.trim()).toBe(
      expected,
    );
    expect(host.querySelector('.ptah-field__message')).toBeNull();
    fixture.destroy();
  });
});
