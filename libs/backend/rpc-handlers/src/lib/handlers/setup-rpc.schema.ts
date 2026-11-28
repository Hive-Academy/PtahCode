/**
 * Zod schemas for {@link SetupRpcHandlers}.
 *
 * The `wizard:` query and analysis-resume DTOs are parsed here at the RPC
 * boundary.
 *
 * `workspacePath` stays optional everywhere it appears: the backend's own
 * active root is trusted, and caller-supplied paths are checked in the handler.
 */

import { z } from 'zod';
import { ProjectAnalysisZodSchema } from '@ptah-extension/agent-generation';

const workspacePath = z.string().trim().min(1).max(4096).optional();

export const WizardDeepAnalyzeParamsSchema = z.object({
  model: z.string().min(1).max(200).optional(),
  /** Continue the unfinished version-4 analysis run instead of starting anew. */
  resume: z.boolean().optional(),
  workspacePath,
});

export const WizardGetResumableRunParamsSchema = z.object({ workspacePath });
export const WizardAnalysisStatusParamsSchema = z.object({ workspacePath });

export const WizardRecommendSkillsParamsSchema = z.object({
  analysis: ProjectAnalysisZodSchema,
});
export const WizardRecommendAnalysisSkillsParamsSchema = z.strictObject({
  runId: z.string().trim().min(1).max(200),
});
export const WizardGetSkillReviewParamsSchema = z.strictObject({
  runId: z.string().trim().min(1).max(200),
});
export const WizardSearchSkillsParamsSchema = z.object({
  query: z.string().trim().min(1).max(200),
});
export const WizardGetProjectGuidanceParamsSchema = z.object({
  analysis: ProjectAnalysisZodSchema,
});
export const WizardPreviewSkillsForConsentParamsSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(255)).min(1).max(200),
});
const installRunId = z.string().trim().min(1).max(200);

export const WizardInstallSkillsWithConsentParamsSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(255)).max(200),
  workspacePath,
  installRunId: installRunId.optional(),
  consentRecords: z
    .array(
      z.object({
        skillName: z.string().trim().min(1).max(255),
        contentHash: z.string().regex(/^[a-fA-F0-9]{64}$/),
        consentDate: z.string().datetime(),
      }),
    )
    .max(200),
});

export const WizardCancelSkillInstallParamsSchema = z.strictObject({
  installRunId,
});

export const WizardListAnalysesParamsSchema = z.object({ workspacePath });

export const WizardLoadAnalysisParamsSchema = z.object({
  filename: z.string().min(1).max(255),
  workspacePath,
});
