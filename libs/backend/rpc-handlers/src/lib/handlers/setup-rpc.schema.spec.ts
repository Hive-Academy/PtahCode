/**
 * SetupRpcSchema — unit specs.
 *
 * Surface under test: `./setup-rpc.schema.ts`, the Zod boundary for the
 * `wizard:` query/resume DTOs handled by `SetupRpcHandlers`
 * (TASK_2026_361 Batch 3).
 */

import 'reflect-metadata';

// The schemas import the agent-generation
// barrel; that reaches workspace-intelligence, whose tree-sitter loader
// evaluates `import.meta.url` at load time (unparseable under ts-jest's CJS
// transform). Same guard as `wizard-generation-rpc.schema.spec.ts`.
jest.mock('@ptah-extension/workspace-intelligence', () => ({
  ProjectType: { Node: 'node', General: 'general', Unknown: 'unknown' },
  Framework: {},
  MonorepoType: {},
  FileType: {},
  TreeSitterParserService: class TreeSitterParserServiceStub {},
  WorkspaceAnalyzerService: class WorkspaceAnalyzerServiceStub {},
  ProjectDetectorService: class ProjectDetectorServiceStub {},
  FrameworkDetectorService: class FrameworkDetectorServiceStub {},
  MonorepoDetectorService: class MonorepoDetectorServiceStub {},
}));

import {
  WizardDeepAnalyzeParamsSchema,
  WizardGetResumableRunParamsSchema,
  WizardListAnalysesParamsSchema,
  WizardLoadAnalysisParamsSchema,
} from './setup-rpc.schema';

describe('setup-rpc.schema', () => {
  describe('WizardDeepAnalyzeParamsSchema', () => {
    it('accepts an empty object (backend root, fresh run)', () => {
      const result = WizardDeepAnalyzeParamsSchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('accepts the typed resume flag alongside model and workspacePath', () => {
      const result = WizardDeepAnalyzeParamsSchema.safeParse({
        model: 'claude-sonnet-4-20250514',
        resume: true,
        workspacePath: '/ws',
      });
      expect(result.success).toBe(true);
      expect(result.data?.resume).toBe(true);
    });

    it('rejects a non-boolean resume flag', () => {
      expect(
        WizardDeepAnalyzeParamsSchema.safeParse({ resume: 'yes' }).success,
      ).toBe(false);
    });

    it('rejects an empty model string', () => {
      expect(
        WizardDeepAnalyzeParamsSchema.safeParse({ model: '' }).success,
      ).toBe(false);
    });
  });

  describe('WizardGetResumableRunParamsSchema', () => {
    it('accepts no parameters and drops unknown keys', () => {
      const result = WizardGetResumableRunParamsSchema.safeParse({
        unexpected: 1,
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });

    it('rejects a non-object', () => {
      expect(WizardGetResumableRunParamsSchema.safeParse('x').success).toBe(
        false,
      );
    });
  });

  describe('WizardListAnalysesParamsSchema', () => {
    it('accepts an optional workspacePath', () => {
      expect(WizardListAnalysesParamsSchema.safeParse({}).success).toBe(true);
      expect(
        WizardListAnalysesParamsSchema.safeParse({ workspacePath: '/ws' })
          .success,
      ).toBe(true);
    });
  });

  describe('WizardLoadAnalysisParamsSchema', () => {
    it('requires a non-empty filename', () => {
      expect(WizardLoadAnalysisParamsSchema.safeParse({}).success).toBe(false);
      expect(
        WizardLoadAnalysisParamsSchema.safeParse({ filename: '' }).success,
      ).toBe(false);
      expect(
        WizardLoadAnalysisParamsSchema.safeParse({ filename: 'slug' }).success,
      ).toBe(true);
    });
  });

});
