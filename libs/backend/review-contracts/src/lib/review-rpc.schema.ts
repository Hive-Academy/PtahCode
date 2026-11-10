import { z } from 'zod';
import { ReviewFindingSchema, ReviewPathSchema } from './review-finding.schema';
import {
  OperatorSettingsSchema,
  RepositorySettingsSchema,
} from './review-config.schema';
import {
  RepoIdentitySchema,
  ReviewRunSchema,
  ReviewStateSchema,
} from './review-run.schema';

const noParams = z.object({}).strict();
export const REVIEW_TRIAGE_ACCEPTED_MARKER = '<!-- ptah-review-triage:accepted -->';
export const REVIEW_TRIAGE_DISMISSED_MARKER = '<!-- ptah-review-triage:dismissed -->';
const attempt = z
  .object({ attemptId: z.string().trim().min(1).max(64) })
  .strict();
const repo = z.object({ repo: RepoIdentitySchema }).strict();
const result = z
  .object({ ok: z.boolean(), error: z.string().max(500).optional() })
  .strict();
export const ReviewSettingsReadSchema = z
  .object({
    settings: OperatorSettingsSchema.nullable(),
    hasToken: z.boolean(),
    tokenStorage: z.enum(['encrypted', 'plaintext']),
  })
  .strict();
export const ReviewSettingsUpdateSchema = z
  .object({
    settings: OperatorSettingsSchema,
    attestation: z
      .object({
        who: z.string().min(1).max(39),
        permissions: z.tuple([
          z.literal('Pull requests: Read and write'),
          z.literal('Contents: Read'),
          z.literal('Metadata: Read'),
        ]),
      })
      .strict()
      .optional(),
  })
  .strict();
export const ReviewRpcSchemas = {
  'review:listRuns': {
    params: z
      .object({
        repo: RepoIdentitySchema.optional(),
        state: ReviewStateSchema.optional(),
        cursor: z.string().max(256).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      })
      .strict(),
    result: z
      .object({
        runs: z.array(ReviewRunSchema).max(100),
        nextCursor: z.string().max(256).nullable(),
        poll: z
          .object({
            status: z.enum(['succeeded', 'failed']).nullable(),
            error: z.string().max(500).nullable(),
            lastSuccessAt: z.string().datetime().nullable(),
            lastErrorAt: z.string().datetime().nullable(),
          })
          .strict(),
      })
      .strict(),
  },
  'review:getRun': { params: attempt, result: ReviewRunSchema.nullable() },
  'review:listFindings': {
    params: attempt,
    result: z
      .object({
        findings: z.array(ReviewFindingSchema).max(100),
        /** The registered workspace folder that is the checkout of the run's repository; null when it is not open. */
        repositoryRoot: z.string().min(1).max(4096).nullable().optional(),
      })
      .strict(),
  },
  'review:listRepositories': {
    params: noParams,
    result: z.array(RepositorySettingsSchema).max(100),
  },
  'review:getSettings': { params: noParams, result: ReviewSettingsReadSchema },
  'review:updateSettings': {
    params: ReviewSettingsUpdateSchema,
    result: OperatorSettingsSchema,
  },
  'review:setPublicationPause': {
    params: z
      .object({ paused: z.boolean(), repo: RepoIdentitySchema.optional() })
      .strict(),
    result,
  },
  'review:retryHead': {
    params: z
      .object({
        repo: RepoIdentitySchema,
        prNumber: z.number().int().min(1).max(1_000_000_000),
      })
      .strict(),
    result: result.extend({ attemptId: z.string().min(1).max(64).optional() }),
  },
  'review:refresh': { params: repo, result },
  'review:verifyBot': {
    params: noParams,
    result: z
      .object({
        valid: z.boolean(),
        login: z.string().trim().min(1).max(39).nullable(),
        error: z.string().max(500).optional(),
      })
      .strict(),
  },
  'review:replaceBotToken': {
    params: z.object({ token: z.string().min(1).max(4096) }).strict(),
    result,
  },
  'review:removeBotToken': { params: noParams, result },
  'review:exportRun': {
    params: attempt,
    result: z
      .object({
        content: z.string().max(1_000_000),
        fileName: z.string().trim().min(1).max(128),
      })
      .strict(),
  },
  'review:respondToFinding': {
    params: z.object({
      attemptId: z.string().trim().min(1).max(64),
      path: ReviewPathSchema,
      title: z.string().trim().min(1).max(256),
      line: z.number().int().min(1).max(10000000).nullable(),
      action: z.enum(['accept', 'dismiss', 'reply']),
      body: z.string().trim().min(1).max(4000).optional(),
    }).strict().refine(v => v.action !== 'reply' || v.body !== undefined, 'Reply needs a body'),
    result: z.object({
      ok: z.boolean(),
      code: z.enum(['run-not-found', 'no-thread', 'ambiguous-thread', 'publication-unavailable', 'github-error']).optional(),
      error: z.string().max(500).optional(),
      threadId: z.string().max(128).optional(),
    }).strict().refine(v => v.ok || v.code !== undefined, 'Failure needs a code'),
  },
} as const;
export type ReviewRpcMethod = keyof typeof ReviewRpcSchemas;
