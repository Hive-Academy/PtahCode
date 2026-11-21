/**
 * M-2: the carry-over readiness probe never offers a provider session; no
 * chat path serves one before P6. A Claude execution on the same harness
 * stays eligible, so the refusal is the provider-session arm, not the setup.
 */

import 'reflect-metadata';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `chat-session.service` (imported for its constants) pulls the
// workspace-intelligence barrel, whose `import.meta.url` ts-jest cannot parse.
jest.mock('@ptah-extension/workspace-intelligence', () => ({
  ProjectType: {},
  Framework: {},
  MonorepoType: {},
  FileType: {},
  TreeSitterParserService: class TreeSitterParserServiceStub {},
  AstAnalysisService: class AstAnalysisServiceStub {},
  DependencyGraphService: class DependencyGraphServiceStub {},
  WorkspaceAnalyzerService: class WorkspaceAnalyzerServiceStub {},
  ContextService: class ContextServiceStub {},
  ContextOrchestrationService: class ContextOrchestrationServiceStub {},
  WorkspaceService: class WorkspaceServiceStub {},
  TokenCounterService: class TokenCounterServiceStub {},
  FileSystemService: class FileSystemServiceStub {},
  FileSystemError: class FileSystemErrorStub extends Error {},
  ProjectDetectorService: class ProjectDetectorServiceStub {},
  FrameworkDetectorService: class FrameworkDetectorServiceStub {},
  DependencyAnalyzerService: class DependencyAnalyzerServiceStub {},
  MonorepoDetectorService: class MonorepoDetectorServiceStub {},
  PatternMatcherService: class PatternMatcherServiceStub {},
  IgnorePatternResolverService: class IgnorePatternResolverServiceStub {},
  WorkspaceIndexerService: class WorkspaceIndexerServiceStub {},
  FileTypeClassifierService: class FileTypeClassifierServiceStub {},
  FileRelevanceScorerService: class FileRelevanceScorerServiceStub {},
  ContextSizeOptimizerService: class ContextSizeOptimizerServiceStub {},
  ContextEnrichmentService: class ContextEnrichmentServiceStub {},
}));

import type { SessionId } from '@ptah-extension/shared';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { createMockModelSettings } from '../../../test-utils/mock-settings';
import { ChatCarryOverService } from './chat-carry-over.service';

const TEST_ROOT = mkdtempSync(join(tmpdir(), 'ptah-carry-over-ps-'));
afterAll(() => rmSync(TEST_ROOT, { recursive: true, force: true }));
const FOLDER = join(TEST_ROOT, 'project');
mkdirSync(FOLDER, { recursive: true });
const SESSION_ID = '0d4c3f0e-6a51-4c55-9a8e-2d3f8c1b7a10' as SessionId;

function harness(execution: unknown) {
  const prepare = jest.fn(async () => execution);
  const isAuthenticated = jest.fn(async () => true);
  const startSession = jest.fn();
  const service = new ChatCarryOverService(
    createMockLogger() as never,
    { startSession, resumeSession: jest.fn(), continueSession: jest.fn() } as never,
    { resolveSessionFolder: jest.fn(async () => FOLDER) } as never,
    {
      get: jest.fn(async () => ({ providerId: 'anthropic', workspaceId: FOLDER })),
    } as never,
    { readCarryOverTranscript: jest.fn() } as never,
    {
      resolveStoredModel: jest.fn((_path: string, model: string) => model),
      resolveProviderProfileForWorkspace: jest.fn(async () => undefined),
    } as never,
    createMockModelSettings() as never,
    {
      resolveActiveAuthForPath: jest.fn(() => ({
        authMethod: 'thirdParty',
        providerId: 'antigravity-cli',
      })),
    } as never,
    { prepare, assertAuthorizedFolder: jest.fn() } as never,
    { isAuthenticated } as never,
  );
  return { service, prepare, isAuthenticated, startSession };
}

const params = { sessionId: SESSION_ID, workspacePath: FOLDER };

describe('ChatCarryOverService with a provider-session active provider', () => {
  it('is not eligible: the probe reports a provider session as not ready', async () => {
    const h = harness({
      runtime: 'provider-session',
      seed: {
        providerId: 'antigravity-cli',
        profile: 'antigravity',
        consumer: 'chat',
        workspacePath: FOLDER,
        workspaceId: FOLDER,
      },
      workspacePath: FOLDER,
      cwd: FOLDER,
      config: { tabId: SESSION_ID },
    });
    await expect(h.service.check(params)).resolves.toEqual({ eligible: false });
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.isAuthenticated).not.toHaveBeenCalled();
    expect(h.startSession).not.toHaveBeenCalled();
  });

  it('control: a Claude execution on the same harness stays eligible', async () => {
    const h = harness({
      runtime: 'claude-sdk',
      model: 'default',
      providerProfile: undefined,
    });
    await expect(h.service.check(params)).resolves.toMatchObject({
      eligible: true,
      providerId: 'antigravity-cli',
    });
  });
});
