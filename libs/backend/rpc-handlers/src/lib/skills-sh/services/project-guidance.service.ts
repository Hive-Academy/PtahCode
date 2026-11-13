import { injectable, inject } from 'tsyringe';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import type { ProjectGuidance } from '@ptah-extension/shared';
import type { DeepProjectAnalysis as FullAnalysis } from '@ptah-extension/agent-generation';

export interface ProjectGuidanceResult {
  facts: ProjectGuidance[];
  ownerDecisionPrompt: string;
  recordPath?: string;
}
export type GuidanceAnalysis = Pick<FullAnalysis, 'frameworks'> & Partial<Pick<FullAnalysis, 'architecturePatterns' | 'codeConventions' | 'existingIssues'>>;
const rules = [
  'New code follows the installed skills.',
  'A change to old code stays local unless the task is a refactor.',
  'Debt is recorded and not fixed silently.',
];
const sanitize = (value: string): string => value.replace(/[\p{Cc}\u2028\u2029]+/gu, ' ');
const evidenceName = (value: string): string => sanitize(value).slice(0, 80);

@injectable()
export class ProjectGuidanceService {
  constructor(@inject(TOKENS.LOGGER) private readonly logger: Logger) {}

  async getGuidance(analysis: GuidanceAnalysis, root?: string, ownerDecision?: 'match' | 'raise'): Promise<ProjectGuidanceResult> {
    const facts: ProjectGuidance[] = [];
    for (const pattern of analysis.architecturePatterns ?? []) facts.push({
      category: 'architecture', label: pattern.confidence >= 70 ? 'follow' : 'tolerate',
      fact: 'Use the detected architecture pattern', evidence: sanitize(`Detected with confidence ${pattern.confidence}: ${pattern.name}`),
    });
    for (const framework of analysis.frameworks) facts.push({
      category: 'stack', label: 'follow', fact: 'Use the existing framework', evidence: sanitize(`Detected in project analysis: ${framework}`),
    });
    const conventions = analysis.codeConventions;
    if (conventions && Object.keys(conventions).length > 0) facts.push({
      category: 'conventions', label: 'follow',
      fact: 'Match the detected code style',
      evidence: sanitize(`Detected from sampled files: indent ${conventions.indentSize}, ${conventions.indentation}, quotes ${conventions.quoteStyle}`),
    });
    const errors = analysis.existingIssues?.errorCount ?? 0;
    if (errors > 0) facts.push({
      category: 'quality', label: 'do_not_copy', fact: 'Do not copy patterns from files that have diagnostic errors', evidence: `${errors} existing errors`,
    });
    if (root) await this.probe(root, facts);
    const result: ProjectGuidanceResult = {
      facts,
      ownerDecisionPrompt: 'Review each fact. Confirm which facts are mandatory (follow), accepted (tolerate), or forbidden (do_not_copy) before skills are installed.',
    };
    if (root && ownerDecision) {
      try {
        const directory = path.join(root, '.ptah');
        await fs.mkdir(directory, { recursive: true });
        const target = path.join(directory, 'project-guidance.md');
        const temporary = path.join(directory, `.project-guidance-${randomUUID()}.tmp`);
        try {
          await fs.writeFile(temporary, this.record(facts, ownerDecision), 'utf8');
          await fs.rename(temporary, target);
          result.recordPath = '.ptah/project-guidance.md';
        } finally {
          await fs.rm(temporary, { force: true }).catch(() => undefined);
        }
      } catch (error) {
        this.logger.debug('[ProjectGuidance] record write failed', { error });
      }
    }
    this.logger.debug('[ProjectGuidance] built guidance', { count: facts.length });
    return result;
  }

  private record(facts: ProjectGuidance[], decision: 'match' | 'raise'): string {
    const groups: [ProjectGuidance['label'], string][] = [['follow', 'Follow'], ['tolerate', 'Tolerate'], ['do_not_copy', 'Do not copy']];
    const sections = groups.map(([label, heading]) => `## ${heading}\n${facts.filter((fact) => fact.label === label).map((fact) =>
      `- ${sanitize(fact.fact)} (Evidence: \`${sanitize(fact.evidence ?? 'not found').replace(/`/g, '')}\`)`).join('\n') || '- None'}\n`);
    return `# Project guidance\n\nDate: ${new Date().toISOString().slice(0, 10)}\n\n${sections.join('\n')}\n## Owner decision\n${decision === 'raise' ? 'Raise the standard' : 'Match the repository'}\n\n## Rules\n${rules.map((rule) => `- ${rule}`).join('\n')}\n`;
  }

  private async probe(root: string, facts: ProjectGuidance[]): Promise<void> {
    let entries: string[];
    try { entries = await fs.readdir(root); }
    catch (error) { this.logger.debug('[ProjectGuidance] root probe failed', { error }); return; }
    const find = (patterns: RegExp[]) => entries.find((entry) => patterns.some((pattern) => pattern.test(entry)));
    const add = (category: string, found: string | undefined, absent: ProjectGuidance['label'], yes: string, no: string) => {
      facts.push({ category, label: found ? 'follow' : absent, fact: found ? yes : no, evidence: found ? evidenceName(found) : 'not found' });
    };
    const lint = find([/^eslint\.config\./, /^\.eslintrc/, /^biome\.jsonc?$/]);
    const formatter = find([/^\.prettierrc/, /^prettier\.config\./, /^biome\.jsonc?$/, /^\.editorconfig$/]);
    const testConfig = find([/^jest\.config\./, /^vitest\.config\./, /^playwright\.config\./, /^pytest\.ini$/]);
    let packageData: { scripts?: { test?: string }; eslintConfig?: unknown; prettier?: unknown } = {};
    let packageReadable = true;
    if (entries.includes('package.json')) {
      try {
        const source = await this.readProbe(path.join(root, 'package.json'));
        if (source === undefined) packageReadable = false;
        else {
          const parsed: unknown = JSON.parse(source);
          packageData = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as typeof packageData : {};
        }
      }
      catch (error) { packageReadable = false; this.logger.debug('[ProjectGuidance] package probe failed', { error }); }
    }
    if (packageReadable || lint) {
      add('lint', lint ?? (packageData.eslintConfig ? 'package.json' : undefined), 'tolerate', 'Use the repository lint configuration', 'No lint configuration was found.');
    }
    if (packageReadable || formatter) {
      add('formatter', formatter ?? (packageData.prettier ? 'package.json' : undefined), 'tolerate', 'Use the repository formatter configuration', 'No formatter configuration was found.');
    }
    if (packageReadable || testConfig) {
      const script = packageData.scripts?.test;
      const test = testConfig ?? (script && !/no test specified|exit 1/i.test(script) ? 'package.json' : undefined);
      add('tests', test, 'do_not_copy', 'Use the repository test setup', 'New code has tests. Do not copy the absence of tests.');
    }
    const tsconfig = entries.includes('tsconfig.json') ? 'tsconfig.json' : entries.includes('tsconfig.base.json') ? 'tsconfig.base.json' : find([/^tsconfig.*\.json$/]);
    if (tsconfig) {
      try {
        const source = await this.readProbe(path.join(root, tsconfig));
        if (source !== undefined) {
          const config = JSON.parse(source.replace(/\/\*[\s\S]*?\*\/|(^|\s)\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1')) as { compilerOptions?: { strict?: boolean } };
          facts.push({ category: 'typescript', label: config.compilerOptions?.strict === true ? 'follow' : 'tolerate',
            fact: config.compilerOptions?.strict === true ? 'TypeScript strict mode is enabled.' : 'TypeScript strict mode is not enabled.',
            evidence: evidenceName(tsconfig) });
        }
      } catch (error) { this.logger.debug('[ProjectGuidance] TypeScript probe failed', { error }); }
    }
    try {
      const workflows = await fs.readdir(path.join(root, '.github', 'workflows')).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      const workflow = workflows.find((file) => /\.ya?ml$/.test(file));
      add('ci', workflow ? `.github/workflows/${workflow}` : find([/^\.gitlab-ci\.yml$/, /^azure-pipelines\.yml$/]), 'tolerate', 'Use the repository CI workflow', 'No CI workflow was found.');
    } catch (error) { this.logger.debug('[ProjectGuidance] CI probe failed', { error }); }
  }

  private async readProbe(file: string): Promise<string | undefined> {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > 1024 * 1024) {
      this.logger.debug('[ProjectGuidance] probe skipped', { file: path.basename(file) });
      return undefined;
    }
    return fs.readFile(file, 'utf8');
  }
}
