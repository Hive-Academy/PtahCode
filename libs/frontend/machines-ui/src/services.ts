/**
 * Machines UI Library - services-only entry point
 *
 * The narrow surface eager code needs: the `MESSAGE_HANDLERS` feed the
 * composition root registers at bootstrap, and the store the Electron shell
 * reads for the Machines tab's approval badge and the welcome's
 * "Machines (N connected)" button. Nothing here imports a component, so a
 * static import of this entry does not pull the Machines view into the
 * initial bundle:
 *
 *   import { MachinesFeed, MachinesStore } from '@ptah-extension/machines-ui/services';
 *
 * The view stays behind the main entry, reached only via `import()` from the
 * webview's route table.
 */

export { MachinesApi } from './lib/services/machines-api';
export {
  MachinesFeed,
  type MachinesEventListener,
  type MachinesStateListener,
} from './lib/services/machines-feed';
export {
  MachinesStore,
  type MachinesError,
  type MachinesOutcome,
  type MachinesRefusal,
  type RemoteMachine,
} from './lib/services/machines-store';
