import { join, resolve } from 'node:path';
import type { CandidateFinding } from '@ptah-extension/review-contracts';
import { ReviewArtifactWriter, type ReviewArtifactFileSystem, type ReviewPreviewInput } from './review-artifact.writer';
import type { EffectiveReviewSettings } from '../review-policy.service';

const finding: CandidateFinding = {
  schemaVersion: 1, lens: 'correctness-lifecycle', title: 'Lost retry',
  failureMode: 'Request never resumes', affectedBehavior: 'User cannot retry',
  scenario: 'A timeout precedes retry', path: 'src/retry.ts', line: 12,
  evidence: [{ path: 'src/retry.ts', line: 12, excerpt: 'await pending' }],
  affectedCaller: null, severity: 'Minor', category: 'stability', confidence: 0.9,
  suggestedDiff: null, fixPrompt: 'Release the pending request and test retry.',
};
const settings: EffectiveReviewSettings = { laneCapPerPr: 6, confidenceFloor: 0.8, maxNewInline: 10, minimumSeverity: 'Minor' };
const preview: ReviewPreviewInput = {
  headSha: 'a'.repeat(40), walkthrough: 'Observed behavior and risks',
  accepted: [finding], suppressed: [{ finding: { ...finding, title: 'Rejected' }, reason: 'Disproved by caller' }],
  selectedLenses: [{ lens: 'correctness-lifecycle', family: 'codex', scope: 'src/retry.ts', outcome: 'completed' }],
  secrets: [],
};

describe('ReviewArtifactWriter', () => {
  const fs: ReviewArtifactFileSystem = { realpath: jest.fn(async (path: string) => path), writeFile: jest.fn(async () => undefined) };
  const writer = new ReviewArtifactWriter(fs);

  describe('readTriage', () => {
    const triage = { schemaVersion: 1, summary: 'A change.', changeType: 'fix', risk: { level: 'low', reason: 'Small.' },
      areas: [{ name: 'Core', paths: ['a.ts'], summary: 'Fixes a bug.', details: [] }], risks: [], apiChanges: [],
      tests: { summary: 'Covered.', gaps: [] } };
    const warn = jest.fn();
    const files = (contents: Record<string, string>): ReviewArtifactWriter => new ReviewArtifactWriter({
      realpath: async (path: string) => path, writeFile: async () => undefined,
      readFile: async (path: string) => {
        const name = path.split(/[\\/]/).at(-1) ?? '';
        if (name in contents) return contents[name];
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      } }, { warn });
    const out = resolve('/attempt', 'out');
    const legacy = '# Observed behavior\nA\n# Inferred risks\nB\n# Risk map\nC\n';

    beforeEach(() => warn.mockClear());

    it('prefers a valid triage.json', async () => {
      const result = await files({ 'triage.json': JSON.stringify(triage), 'walkthrough.md': legacy }).readTriage(out);
      expect(result.kind).toBe('structured');
      expect(warn).not.toHaveBeenCalled();
    });

    it('falls back to a valid walkthrough.md when triage.json is invalid or missing, and logs it', async () => {
      expect(await files({ 'triage.json': '{', 'walkthrough.md': legacy }).readTriage(out)).toEqual({ kind: 'legacy', text: legacy });
      expect(await files({ 'walkthrough.md': legacy }).readTriage(out)).toEqual({ kind: 'legacy', text: legacy });
      expect(warn).toHaveBeenCalledTimes(2);
    });

    it('reports an unavailable walkthrough, with a logged reason, when no usable file exists', async () => {
      const result = await files({}).readTriage(out);
      expect(result).toEqual({ kind: 'unavailable', reason: 'triage.json missing; walkthrough.md missing' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unusable'));
    });

    it('does not use a walkthrough.md without the required headings, and names only schema paths', async () => {
      const result = await files({ 'triage.json': JSON.stringify({ ...triage, summary: 'secret text' , areas: [] }), 'walkthrough.md': 'old' }).readTriage(out);
      expect(result).toMatchObject({ kind: 'unavailable' });
      expect(JSON.stringify(result)).toContain('invalid at areas');
      expect(JSON.stringify(result)).not.toContain('secret text');
    });
  });

  it('renders walkthrough, accepted and suppressed findings with reasons', () => {
    const result = writer.renderPreview(preview, settings);
    expect(result).toContain('## Walkthrough');
    expect(result).toContain('## Accepted findings');
    expect(result).toContain('## Suppressed findings');
    expect(result).toContain('Disproved by caller');
    expect(result).toContain('Prompt for AI agents');
    expect(result).toContain('codex');
  });

  it('caps inline candidates and excludes Nitpick by default', () => {
    const accepted = Array.from({ length: 15 }, (_, n) => ({ ...finding, title: `Finding ${n}` }));
    accepted.push({ ...finding, title: 'Polish', severity: 'Nitpick' });
    const result = writer.renderPreview({ ...preview, accepted }, settings);
    const section = result.split('## Inline-comment candidates (10/10)')[1];
    expect(section?.match(/Prompt for AI agents/g)).toHaveLength(10);
    expect(section).not.toContain('Polish');
    expect(result).toContain('Below minimum severity Minor');
    expect(result).toContain('Additional eligible findings outside inline cap or without a line: 5');
  });

  it('lists previously published findings without consuming new inline slots', () => {
    const result = writer.renderPreview({ ...preview, previouslyPublished: [finding] }, { ...settings, maxNewInline: 1 });
    expect(result).toContain('Previously published findings');
    expect(result).toContain('Inline-comment candidates (1/1)');
  });

  it('redacts token-like strings, authorization headers and supplied secrets', () => {
    const token = `ghp_${'x'.repeat(36)}`;
    const result = writer.renderPreview({ ...preview, walkthrough: `Authorization: Bearer abc.def\n${token}\ncustom-value`, secrets: ['custom-value'] }, settings);
    expect(result).not.toContain(token);
    expect(result).not.toContain('abc.def');
    expect(result).not.toContain('custom-value');
    expect(result).toContain('REDACTED');
  });

  it('writes only within an absolute out root', async () => {
    const attemptRoot = resolve('review-artifact-writer-attempt');
    const outRoot = join(attemptRoot, 'out');
    await expect(writer.writePreview('relative/out', preview, settings)).rejects.toThrow('absolute');
    await expect(writer.writePreview(join(attemptRoot, 'src'), preview, settings)).rejects.toThrow('out/');
    await writer.writePreview(outRoot, preview, settings);
    expect(fs.writeFile).toHaveBeenCalledWith(join(outRoot, 'review-preview.md'), expect.any(String), 'utf8');
  });
});
