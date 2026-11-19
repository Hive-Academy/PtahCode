import type { BotRepository } from '@ptah-extension/persistence-sqlite';
import { BotApplicationService } from './bot-application.service';
import type { BotCatalogSnapshot } from './bot-ports';

describe('BotApplicationService skill validation', () => {
  it.each(['available', 'partial'] as const)(
    'rejects a missing new skill when skills succeeded and catalog is %s',
    async (status) => {
      const repository: BotRepository = {
        list: jest.fn(() => []),
        get: jest.fn(() => null),
        revisions: jest.fn(() => []),
        save: jest.fn(),
        delete: jest.fn(),
        stageAvatar: jest.fn(),
        readAvatar: jest.fn(() => null),
      };
      const snapshot: BotCatalogSnapshot = {
        status,
        mainProviders: [],
        lanes: [],
        skills: [{ id: 'installed' }],
        toolIds: [],
        diagnostics:
          status === 'partial'
            ? [
                {
                  code: 'MODELS_UNAVAILABLE',
                  message: 'Model lookup timed out.',
                  severity: 'warning',
                },
              ]
            : [],
      };
      const service = new BotApplicationService({
        repository,
        catalog: { read: async () => snapshot },
        sourceReader: { read: async () => ({ items: [], diagnostics: [] }) },
        workspaceAuthorization: { authorize: async (root) => root },
        retentionParticipants: [],
      });
      await expect(
        service.create({
          definition: {
            name: 'Review',
            instructions: 'Review changes.',
            scope: { kind: 'user' },
            skills: [{ id: 'missing' }],
          },
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_PARAMS',
        message: 'Choose an installed skill.',
      });
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
});
