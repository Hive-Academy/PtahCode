import type { CliLaneDefaults, CliType } from '@ptah-extension/shared';
import type {
  ProvidersSettingsPatch,
  SaveOperation,
} from './providers-settings.types';
import type { ProvidersLaneRpc } from './providers-system-lane-test';

/** Preserve the lane-default write and read-back comparison as one operation per CLI. */
export function laneDefaultOperations(
  rows: NonNullable<
    NonNullable<ProvidersSettingsPatch['orchestration']>['cliLaneDefaults']
  >,
  require: ProvidersLaneRpc,
): SaveOperation[] {
  return Object.entries(rows).map(([cli, choice]) => {
    let expected: CliLaneDefaults[CliType] | undefined;
    return {
      fields: [`agentOrchestration.cliLaneDefaults.${cli}`],
      write: async () => {
        const before = (await require('agent:getConfig', undefined))
          .cliLaneDefaults;
        const previous = Object.entries(before ?? {}).find(
          ([name]) => name === cli,
        )?.[1];
        expected =
          choice === null
            ? undefined
            : {
                ...previous,
                ...(choice.permission === null
                  ? { permission: undefined }
                  : choice.permission === undefined
                    ? {}
                    : { permission: choice.permission }),
                ...(choice.network === null
                  ? { network: undefined }
                  : choice.network === undefined
                    ? {}
                    : { network: choice.network }),
              };
        if (
          cli === 'codex' &&
          expected?.permission === undefined &&
          expected?.network === undefined
        )
          expected = undefined;
        return (
          await require('agent:setConfig', {
            cliLaneDefaults: { [cli]: choice },
          })
        ).success;
      },
      readBack: async () => {
        const saved = (await require('agent:getConfig', undefined))
          .cliLaneDefaults;
        const row = Object.entries(saved ?? {}).find(
          ([name]) => name === cli,
        )?.[1];
        return (
          (row === undefined) === (expected === undefined) &&
          row?.permission === expected?.permission &&
          row?.network === expected?.network
        );
      },
    };
  });
}
