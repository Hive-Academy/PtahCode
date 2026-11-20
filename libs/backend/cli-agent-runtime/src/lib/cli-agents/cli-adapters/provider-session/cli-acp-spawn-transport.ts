/**
 * The spawn policy a lane hands the ACP runtime (`AcpSpawnTransport`): the
 * same `resolveDirectSpawn` + `spawnCli` path every CLI lane uses, so an ACP
 * agent child gets the lane's clean environment, Windows `.cmd` resolution,
 * a detached process group and orphan-descendant cleanup.
 */
import type { AcpSpawnTransport } from '@ptah-extension/acp-runtime';
import { resolveDirectSpawn, spawnCli } from '../cli-adapter.utils';

export const cliAcpSpawnTransport: AcpSpawnTransport = async (request) => {
  const descriptor = await resolveDirectSpawn(request.command);
  return spawnCli(descriptor.command, [...descriptor.prefixArgs, ...request.args], {
    cwd: request.cwd,
    env: request.env,
    detached: true,
    cleanupOrphanDescendants: true,
    windowsJobPolicy: 'no-job',
    spawner: request.spawner,
  });
};
