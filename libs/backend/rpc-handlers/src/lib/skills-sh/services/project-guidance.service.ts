/**
 * Project Guidance Service
 *
 * Turns a deep project analysis into labeled facts and one owner decision
 * prompt. Labels: follow (mandatory), tolerate (accepted), do_not_copy
 * (forbidden).
 *
 * @module @ptah-extension/agent-generation/services
 */

import { injectable, inject } from 'tsyringe';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import type { ProjectGuidance } from '@ptah-extension/shared';
import type { DeepProjectAnalysis as FullAnalysis } from '@ptah-extension/agent-generation';

export interface ProjectGuidanceResult {
  facts: ProjectGuidance[];
  ownerDecisionPrompt: string;
}

export type GuidanceAnalysis = Pick<FullAnalysis, 'frameworks'> &
  Partial<
    Pick<
      FullAnalysis,
      | 'architecturePatterns'
      | 'codeConventions'
      | 'existingIssues'
      | 'projectTypeDescription'
    >
  >;

@injectable()
export class ProjectGuidanceService {
  constructor(@inject(TOKENS.LOGGER) private readonly logger: Logger) {}

  getGuidance(analysis: GuidanceAnalysis): ProjectGuidanceResult {
    const facts: ProjectGuidance[] = [];

    for (const pattern of analysis.architecturePatterns ?? []) {
      facts.push({
        category: 'architecture',
        label: pattern.confidence >= 70 ? 'follow' : 'tolerate',
        fact: `Architecture pattern: ${pattern.name}`,
        evidence: `Detected with confidence ${pattern.confidence}`,
      });
    }

    for (const framework of analysis.frameworks) {
      facts.push({
        category: 'stack',
        label: 'follow',
        fact: `Use the existing framework: ${framework}`,
        evidence: 'Detected in project analysis',
      });
    }

    const conventions = analysis.codeConventions;
    if (conventions) {
      facts.push({
        category: 'conventions',
        label: 'follow',
        fact: `Match the detected code style (indent ${conventions.indentSize}, ${conventions.indentation}, quotes ${conventions.quoteStyle})`,
        evidence: 'Detected from sampled files',
      });
    }

    const errors = analysis.existingIssues?.errorCount ?? 0;
    if (errors > 0) {
      facts.push({
        category: 'quality',
        label: 'do_not_copy',
        fact: 'Do not copy patterns from files that have diagnostic errors',
        evidence: `${errors} existing errors`,
      });
    }

    this.logger.debug('[ProjectGuidance] built guidance', {
      count: facts.length,
    });

    return {
      facts,
      ownerDecisionPrompt:
        'Review each fact. Confirm which facts are mandatory (follow), accepted (tolerate), or forbidden (do_not_copy) before skills are installed.',
    };
  }
}
