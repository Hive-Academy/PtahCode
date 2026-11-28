import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { DecisionModelBaseUrlFieldComponent } from './decision-model-row.base-url-field.component';

describe('DecisionModelBaseUrlFieldComponent info', () => {
  it('opens the full original help and preserves its accessible selectors', () => {
    const fixture = TestBed.createComponent(DecisionModelBaseUrlFieldComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const help = host.querySelector('#decision-model-base-url-help');
    const expected =
      'Requests go to this URL plus /v1/systemone. With an API key it must use https, unless the endpoint is on this machine (localhost, [::1] or 127.x.x.x).';
    expect(help?.textContent?.trim()).toBe(expected);
    expect(host.querySelector('[data-testid="decision-base-url-help"]')).toBe(
      help,
    );
    expect(
      host
        .querySelector('input')
        ?.getAttribute('aria-describedby')
        ?.split(/\s+/),
    ).toContain('decision-model-base-url-help');
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="More about Base URL"]',
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
