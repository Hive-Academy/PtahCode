import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, input } from '@angular/core';
import {
  PTAH_CLI_PERMISSION_CAPABILITIES,
  type CliAdapterManifest,
  type CliLaneDefaults,
} from '@ptah-extension/shared';
import type { CliMatrixStatus } from './cli-matrix-rows';
import type { LaneTableRow } from './lanes-table.component';
import {
  LaneDefaultWarningComponent,
  LaneStatusIconComponent,
  LanesTableStatusComponent,
  laneStatusGlyph,
} from './lanes-table-status.component';

const READY: CliMatrixStatus = {
  kind: 'ready',
  label: 'Installed',
  tone: 'success',
};
const NEEDS_KEY: CliMatrixStatus = {
  kind: 'needs-key',
  label: 'Needs API key',
  tone: 'warning',
};
const NOT_INSTALLED: CliMatrixStatus = {
  kind: 'not-installed',
  label: 'Not installed',
  tone: 'neutral',
};
const FAILED: CliMatrixStatus = {
  kind: 'error',
  label: 'Error',
  tone: 'error',
};
const STARTING: CliMatrixStatus = {
  kind: 'initializing',
  label: 'Initializing',
  tone: 'info',
};

const system = (
  patch: Partial<Extract<LaneTableRow, { kind: 'system' }>> = {},
): LaneTableRow =>
  ({
    kind: 'system',
    id: 'codex',
    name: 'Codex',
    status: READY,
    enabled: true,
    interactive: true,
    cli: 'codex',
    installed: true,
    version: '1.2.3',
    versionLabel: 'v1.2.3',
    codexStatusLine: null,
    provider: null,
    model: { key: 'codexModel', value: '' },
    effort: null,
    credentialAction: false,
    ...patch,
  }) as LaneTableRow;

const instance = (
  patch: Partial<Extract<LaneTableRow, { kind: 'instance' }>> = {},
): LaneTableRow =>
  ({
    kind: 'instance',
    id: 'a',
    name: 'Lane a',
    status: READY,
    enabled: true,
    interactive: true,
    runtimeStatus: null,
    providerId: 'local',
    provider: 'Local',
    keyStatus: { kind: 'keyless', label: 'No key needed' },
    tiers: [],
    selectedModel: null,
    effort: '',
    lastTest: null,
    ...patch,
  }) as LaneTableRow;

/** The shared Ptah CLI contract has no network sandbox, so a saved `deny` has no supported pair. */
const manifest = PTAH_CLI_PERMISSION_CAPABILITIES as CliAdapterManifest;
const UNSUPPORTED = { network: 'deny' } as CliLaneDefaults['codex'];

describe('laneStatusGlyph', () => {
  it('gives each state its own ink', () => {
    expect(laneStatusGlyph(READY).ink).toBe('done');
    expect(laneStatusGlyph(NEEDS_KEY).ink).toBe('need');
    expect(laneStatusGlyph(NOT_INSTALLED).ink).toBe('idle');
    expect(laneStatusGlyph(FAILED).ink).toBe('err');
    expect(laneStatusGlyph(STARTING).ink).toBe('run');
  });

  it('gives each state its own icon shape, and only a running state moves', () => {
    const glyphs = [READY, NEEDS_KEY, NOT_INSTALLED, FAILED, STARTING].map(
      laneStatusGlyph,
    );
    expect(new Set(glyphs.map((glyph) => glyph.icon)).size).toBe(5);
    expect(glyphs.map((glyph) => glyph.spin)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});

describe('LaneStatusIconComponent', () => {
  let fixture: ComponentFixture<LaneStatusIconComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LaneStatusIconComponent] });
    fixture = TestBed.createComponent(LaneStatusIconComponent);
  });

  it('is decoration beside a status text', () => {
    fixture.componentRef.setInput('status', NEEDS_KEY);
    fixture.detectChanges();
    expect(host().getAttribute('aria-hidden')).toBe('true');
    expect(host().getAttribute('role')).toBeNull();
    expect(host().getAttribute('data-ink')).toBe('need');
    expect(host().className).toContain('text-warning');
  });

  it('is the whole status when it has a label', () => {
    fixture.componentRef.setInput('status', READY);
    fixture.componentRef.setInput('label', 'Installed');
    fixture.detectChanges();
    expect(host().getAttribute('role')).toBe('img');
    expect(host().getAttribute('aria-label')).toBe('Installed');
    expect(host().getAttribute('title')).toBe('Installed');
    expect(host().getAttribute('aria-hidden')).toBeNull();
  });

  it('turns only while the lane starts', () => {
    fixture.componentRef.setInput('status', STARTING);
    fixture.detectChanges();
    expect(host().querySelector('lucide-angular')?.className).toContain(
      'animate-spin',
    );
    fixture.componentRef.setInput('status', READY);
    fixture.detectChanges();
    expect(host().querySelector('lucide-angular')?.className).not.toContain(
      'animate-spin',
    );
  });
});

describe('LanesTableStatusComponent', () => {
  let fixture: ComponentFixture<LanesTableStatusComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const q = (selector: string) => host().querySelector<HTMLElement>(selector);
  function mount(row: LaneTableRow, inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [LanesTableStatusComponent] });
    fixture = TestBed.createComponent(LanesTableStatusComponent);
    fixture.componentRef.setInput('row', row);
    for (const [name, value] of Object.entries(inputs))
      fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }

  it('shows an icon and the status text; the text is base-content and the icon has the state colour', () => {
    mount(instance({ status: NEEDS_KEY }));
    const status = q('[data-testid="cli-matrix-status"]');
    expect(status?.getAttribute('data-ink')).toBe('need');
    expect(status?.getAttribute('title')).toBe('Needs API key');
    expect(status?.className).toContain('text-base-content');
    expect(status?.querySelector('.ptah-status-text')?.textContent).toBe(
      'Needs API key',
    );
    const icon = status?.querySelector('ptah-lane-status-icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.className).toContain('text-warning');
  });

  it('has the status test id only on an instance row', () => {
    mount(system());
    expect(q('[data-testid="cli-matrix-status"]')).toBeNull();
    expect(q('.ptah-status-text')?.textContent).toBe('Installed');
  });

  it('shortens "Not installed" in the collapsed table and keeps the full title', () => {
    mount(system({ status: NOT_INSTALLED, installed: false }), {
      collapsed: true,
    });
    expect(q('.ptah-status-text')?.textContent).toBe('Missing');
    expect(q('[title]')?.getAttribute('title')).toBe('Not installed');
  });

  it('keeps the screen reader text of a test, the runtime status and a missing key', () => {
    mount(
      instance({
        runtimeStatus: 'Error',
        keyStatus: { kind: 'missing', label: 'Key missing' },
      }),
      { testResult: 'Test passed' },
    );
    expect(host().querySelector('.sr-only')?.textContent).toBe('Test passed');
    expect(
      q('[data-testid="cli-matrix-runtime-status"]')?.textContent?.trim(),
    ).toBe('Error');
    expect(
      q('[data-testid="cli-matrix-key-status"]')?.textContent?.trim(),
    ).toBe('Key missing');
    fixture.componentRef.setInput('testing', true);
    fixture.detectChanges();
    expect(host().querySelector('.sr-only')?.textContent).toBe('Running…');
  });

  it('has no recovery outputs: the table owns Sign in and Install guide', () => {
    mount(instance());
    expect('installGuide' in fixture.componentInstance).toBe(false);
    expect('signIn' in fixture.componentInstance).toBe(false);
    expect(host().querySelector('button')).toBeNull();
  });
});

@Component({
  standalone: true,
  imports: [LaneDefaultWarningComponent],
  template: `<ptah-lane-default-warning [row]="row()" [saved]="saved()" />`,
})
class WarningHostComponent {
  readonly row = input.required<LaneTableRow>();
  readonly saved = input<CliLaneDefaults['codex']>();
}

describe('LaneDefaultWarningComponent (row mark, P-25)', () => {
  let fixture: ComponentFixture<WarningHostComponent>;
  const button = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="lane-default-warning"]',
    );
  function mount(row: LaneTableRow, saved?: CliLaneDefaults['codex']) {
    TestBed.configureTestingModule({ imports: [WarningHostComponent] });
    fixture = TestBed.createComponent(WarningHostComponent);
    fixture.componentRef.setInput('row', row);
    fixture.componentRef.setInput('saved', saved);
    fixture.detectChanges();
  }

  it('is a focusable Info button with the reason as tooltip, accessible name and screen reader text', () => {
    mount(system({ manifest }), UNSUPPORTED);
    const mark = button();
    expect(mark?.tagName).toBe('BUTTON');
    expect(mark?.type).toBe('button');
    expect(mark?.disabled).toBe(false);
    expect(mark?.getAttribute('tabindex')).not.toBe('-1');
    const reason =
      'Unsupported combination: Saved CLI lane default has no supported permission/network pair.';
    expect(mark?.getAttribute('aria-label')).toBe(reason);
    expect(mark?.querySelector('.sr-only')?.textContent).toBe(reason);
    expect(
      mark?.querySelector('lucide-angular')?.getAttribute('aria-hidden'),
    ).toBe('true');
    mark?.focus();
    expect(document.activeElement).toBe(mark);
  });

  it('shows nothing for a supported pair, a row with no manifest or an instance row', () => {
    mount(system({ manifest }));
    expect(button()).toBeNull();
    TestBed.resetTestingModule();
    mount(system(), UNSUPPORTED);
    expect(button()).toBeNull();
    TestBed.resetTestingModule();
    mount(instance(), UNSUPPORTED);
    expect(button()).toBeNull();
  });
});
