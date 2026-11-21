import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  PTAH_CLI_PERMISSION_CAPABILITIES,
  type CliAdapterManifest,
  type CliLaneDefaults,
} from '@ptah-extension/shared';
import { LaneRowIdentityComponent } from './lane-row-identity.component';
import type { LaneTableRow } from './lanes-table.component';

const system = (
  patch: Partial<Extract<LaneTableRow, { kind: 'system' }>> = {},
): LaneTableRow =>
  ({
    kind: 'system',
    id: 'codex',
    name: 'Codex',
    status: { kind: 'ready', label: 'Installed', tone: 'success' },
    enabled: true,
    interactive: true,
    cli: 'codex',
    installed: true,
    version: '1.2.3',
    versionLabel: 'v1.2.3',
    codexStatusLine: null,
    provider: 'OpenAI Codex',
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
    id: 'glm-1',
    name: 'Glm',
    status: { kind: 'ready', label: 'Ready', tone: 'success' },
    enabled: true,
    interactive: true,
    runtimeStatus: null,
    providerId: 'ollama-cloud',
    provider: 'Ollama Cloud',
    keyStatus: { kind: 'key-set', label: 'Key set' },
    tiers: [],
    selectedModel: '',
    effort: '',
    lastTest: null,
    ...patch,
  }) as LaneTableRow;

describe('LaneRowIdentityComponent', () => {
  let fixture: ComponentFixture<LaneRowIdentityComponent>;
  const host = () => fixture.nativeElement as HTMLElement;
  const q = (selector: string) => host().querySelector<HTMLElement>(selector);
  const secondLine = () => q('.ptah-table-row-title-secondary');
  const badge = () => q('.ptah-table-row-title-kind');
  function mount(row: LaneTableRow, inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [LaneRowIdentityComponent] });
    fixture = TestBed.createComponent(LaneRowIdentityComponent);
    fixture.componentRef.setInput('row', row);
    for (const [name, value] of Object.entries(inputs))
      fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
  }
  /** Jest removes component styles, so the style rules are read from the source file. */
  const styles = () =>
    readFileSync(join(__dirname, 'lane-row-identity.component.ts'), 'utf8');

  describe('two lines (P-22, decision 7)', () => {
    it('line 1 is the name; line 2 of a CLI agent is its version, in the mono face', () => {
      mount(system());
      expect(q('.ptah-table-row-title-name')?.textContent).toBe('Codex');
      expect(secondLine()?.textContent).toBe('v1.2.3');
      expect(secondLine()?.classList).toContain('ptah-table-row-title-mono');
      const title = q('ptah-table-row-title');
      expect(title?.getAttribute('data-testid')).toBe('cli-matrix-version');
      expect(title?.getAttribute('title')).toBe('Codex - 1.2.3');
    });

    it('keeps the full single-line version in the tooltip and the short label on line 2 (P-42)', () => {
      mount(
        system({
          id: 'copilot',
          name: 'Copilot',
          cli: 'copilot',
          version: 'GitHub Copilot CLI 1.0.83.',
          versionLabel: 'v1.0.83',
        }),
      );
      expect(secondLine()?.textContent).toBe('v1.0.83');
      expect(q('ptah-table-row-title')?.getAttribute('title')).toBe(
        'Copilot - GitHub Copilot CLI 1.0.83.',
      );
    });

    it('never puts a multi-line probe output in the tooltip', () => {
      mount(system({ version: 'codex-cli 0.155.1\nUsage: codex', versionLabel: 'v0.155.1' }));
      expect(q('ptah-table-row-title')?.getAttribute('title')).toBe(
        'Codex - v0.155.1',
      );
    });

    it('line 2 of a Ptah CLI instance is its provider', () => {
      mount(instance());
      expect(secondLine()?.textContent).toBe('Ollama Cloud');
      expect(secondLine()?.classList).not.toContain(
        'ptah-table-row-title-mono',
      );
      expect(q('ptah-table-row-title')?.getAttribute('data-testid')).toBeNull();
    });

    it.each([
      ['a CLI agent with no version', system({ versionLabel: null })],
      ['a Ptah CLI instance with no provider', instance({ provider: '' })],
    ])('line 2 of %s is "--", never blank', (_label, row) => {
      mount(row);
      expect(secondLine()?.textContent).toBe('--');
      expect(q('ptah-table-row-title')?.getAttribute('title')).toBe(row.name);
    });

    it('keeps line 2 in the collapsed table', () => {
      mount(system(), { collapsed: true });
      expect(host().getAttribute('data-collapsed')).toBe('true');
      expect(secondLine()?.textContent).toBe('v1.2.3');
      expect(styles()).not.toMatch(
        /data-collapsed='true'\][^{]*title-secondary[^{]*\{[^}]*display:\s*none/,
      );
    });
  });

  describe('kind badge (decisions 16, 26)', () => {
    it('a CLI agent has the kind-cli badge', () => {
      mount(system());
      expect(badge()?.textContent).toBe('CLI agent');
      expect(badge()?.classList).toContain('kind-cli');
      expect(badge()?.classList).not.toContain('kind-ptah');
    });

    it('a Ptah CLI instance has the kind-ptah badge', () => {
      mount(instance());
      expect(badge()?.textContent).toBe('Ptah CLI');
      expect(badge()?.classList).toContain('kind-ptah');
      expect(badge()?.classList).not.toContain('kind-cli');
    });

    it('is in the first line, after the name', () => {
      mount(system());
      const primary = q('.ptah-table-row-title-primary');
      expect(badge()?.parentElement).toBe(primary);
      expect(
        q('.ptah-table-row-title-name')?.compareDocumentPosition(
          badge() as Node,
        ),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('gives the two kinds different coloured text, each with a tinted border, never base-content', () => {
      mount(system());
      const css = styles();
      const rule = (kind: string) =>
        css.match(new RegExp(`\\.${kind}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(rule('kind-cli')).toMatch(/color:\s*var\(--ptah-kind-cli-ink\)/);
      expect(rule('kind-ptah')).toMatch(/color:\s*var\(--ptah-kind-ptah-ink\)/);
      expect(rule('kind-cli')).toMatch(
        /border-color:\s*color-mix\(\s*in oklab,\s*var\(--ptah-kind-cli-ink\) 50%/,
      );
      expect(rule('kind-ptah')).toMatch(
        /border-color:\s*color-mix\(\s*in oklab,\s*var\(--ptah-kind-ptah-ink\) 55%/,
      );
      // Default inks are the theme tokens: info (blue) and secondary (gold).
      expect(css).toMatch(/--ptah-kind-cli-ink:\s*oklch\(var\(--in\)\)/);
      expect(css).toMatch(/--ptah-kind-ptah-ink:\s*oklch\(var\(--s\)\)/);
      expect(css).not.toMatch(/--ptah-kind-(cli|ptah)-ink:[^;]*--bc/);
    });

    it('uses a darker shade of each ink on the light themes, still two colours', () => {
      mount(system());
      const light =
        styles().match(
          /\[data-theme-mode=['"]?light['"]?\]\s+ptah-lane-row-identity\s*\{([^}]*)\}/,
        )?.[1] ?? '';
      const ink = (kind: string) =>
        light.match(new RegExp(`--ptah-kind-${kind}-ink:\\s*([^;]+);`))?.[1];
      expect(ink('cli')).toBe('#1d4ed8');
      expect(ink('ptah')).toBe('#7a5900');
    });
  });

  describe('status icon of the narrowest table', () => {
    it('is not shown by default', () => {
      mount(system());
      expect(q('ptah-lane-status-icon')).toBeNull();
    });

    it('stands beside the name in place of the kind badge, with the status as its name', () => {
      mount(
        system({
          status: {
            kind: 'needs-key',
            label: 'Needs API key',
            tone: 'warning',
          },
        }),
        { statusIcon: true },
      );
      const icon = q('ptah-lane-status-icon');
      expect(icon?.parentElement).toBe(q('.ptah-table-row-title-primary'));
      expect(icon?.getAttribute('role')).toBe('img');
      expect(icon?.getAttribute('aria-label')).toBe('Needs API key');
      expect(icon?.getAttribute('data-ink')).toBe('need');
      expect(badge()).toBeNull();
    });
  });

  describe('row mark and removed install link', () => {
    it('keeps the provider mark', () => {
      mount(system());
      expect(q('ptah-provider-mark')).not.toBeNull();
    });

    it('shows the unsupported-combination Info button beside the name', () => {
      mount(
        system({
          manifest: PTAH_CLI_PERMISSION_CAPABILITIES as CliAdapterManifest,
        }),
        { defaults: { codex: { network: 'deny' } } as CliLaneDefaults },
      );
      const mark = q('ptah-lane-default-warning button');
      expect(mark?.getAttribute('aria-label')).toContain(
        'Unsupported combination',
      );
      expect(mark?.closest('.ptah-table-row-title-primary')).not.toBeNull();
    });

    it('has no install link and no install output, also for a CLI that is not installed', () => {
      mount(
        system({
          installed: false,
          versionLabel: null,
          status: {
            kind: 'not-installed',
            label: 'Not installed',
            tone: 'neutral',
          },
        }),
        { collapsed: true },
      );
      expect(q('.lane-install-guide')).toBeNull();
      expect(host().querySelector('button')).toBeNull();
      expect('installGuideRequested' in fixture.componentInstance).toBe(false);
      expect(secondLine()?.textContent).toBe('--');
    });
  });
});
