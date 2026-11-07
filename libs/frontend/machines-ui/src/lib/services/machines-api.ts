import { Injectable, inject } from '@angular/core';
import { ClaudeRpcService, type RpcResult } from '@ptah-extension/core';
import type {
  MachineResult,
  MachinesListResult,
  MachinesPermissionRespondParams,
  MachinesPermissionRespondResult,
  MachinesReadinessResult,
  MachinesRemoveResult,
  MachinesSessionAttachResult,
  MachinesSessionContinueResult,
  MachinesSessionDetachResult,
  MachinesSessionStartParams,
  MachinesSessionStartResult,
  MachinesSessionStopResult,
  MachinesSessionsResult,
  MachinesSshAliasesResult,
  MachinesWorkspacesResult,
} from '@ptah-extension/shared';

/**
 * Typed wrapper over {@link ClaudeRpcService} for the `machines:*` methods
 * (`rpc-machines.types.ts`). One method per RPC, no state and no retries:
 * each returns the call's `RpcResult` so the caller sees `errorCode`
 * (`MACHINE_UNREACHABLE`, `SESSION_DRIVEN_ELSEWHERE`, ...) unchanged.
 * Electron main validates every params object with the strict zod schemas.
 */
@Injectable({ providedIn: 'root' })
export class MachinesApi {
  private readonly rpc = inject(ClaudeRpcService);

  public list(): Promise<RpcResult<MachinesListResult>> {
    return this.rpc.call('machines:list', {});
  }

  public sshAliases(): Promise<RpcResult<MachinesSshAliasesResult>> {
    return this.rpc.call('machines:sshAliases', {});
  }

  public add(alias: string): Promise<RpcResult<MachineResult>> {
    return this.rpc.call('machines:add', { alias });
  }

  public pair(
    machineId: string,
    code: string,
  ): Promise<RpcResult<MachineResult>> {
    return this.rpc.call('machines:pair', { machineId, code });
  }

  public pairViaSsh(machineId: string): Promise<RpcResult<MachineResult>> {
    return this.rpc.call('machines:pairViaSsh', { machineId });
  }

  public remove(machineId: string): Promise<RpcResult<MachinesRemoveResult>> {
    return this.rpc.call('machines:remove', { machineId });
  }

  public retry(machineId: string): Promise<RpcResult<MachineResult>> {
    return this.rpc.call('machines:retry', { machineId });
  }

  public readiness(
    machineId: string,
  ): Promise<RpcResult<MachinesReadinessResult>> {
    return this.rpc.call('machines:readiness', { machineId });
  }

  public workspaces(
    machineId: string,
  ): Promise<RpcResult<MachinesWorkspacesResult>> {
    return this.rpc.call('machines:workspaces', { machineId });
  }

  public sessions(
    machineId: string,
    workspaceId: string,
  ): Promise<RpcResult<MachinesSessionsResult>> {
    return this.rpc.call('machines:sessions', { machineId, workspaceId });
  }

  public attach(
    machineId: string,
    sessionId: string,
  ): Promise<RpcResult<MachinesSessionAttachResult>> {
    return this.rpc.call('machines:session.attach', { machineId, sessionId });
  }

  public detach(
    machineId: string,
    sessionId: string,
  ): Promise<RpcResult<MachinesSessionDetachResult>> {
    return this.rpc.call('machines:session.detach', { machineId, sessionId });
  }

  /** Re-attach from `afterSeq`: the worker resends every event after it. */
  public replay(
    machineId: string,
    sessionId: string,
    afterSeq: number,
  ): Promise<RpcResult<MachinesSessionAttachResult>> {
    return this.rpc.call('machines:session.replay', {
      machineId,
      sessionId,
      afterSeq,
    });
  }

  public start(
    params: MachinesSessionStartParams,
  ): Promise<RpcResult<MachinesSessionStartResult>> {
    return this.rpc.call('machines:session.start', params);
  }

  public continue(
    machineId: string,
    sessionId: string,
    prompt: string,
  ): Promise<RpcResult<MachinesSessionContinueResult>> {
    return this.rpc.call('machines:session.continue', {
      machineId,
      sessionId,
      prompt,
    });
  }

  public stop(
    machineId: string,
    sessionId: string,
  ): Promise<RpcResult<MachinesSessionStopResult>> {
    return this.rpc.call('machines:session.stop', { machineId, sessionId });
  }

  public respondPermission(
    params: MachinesPermissionRespondParams,
  ): Promise<RpcResult<MachinesPermissionRespondResult>> {
    return this.rpc.call('machines:permission.respond', params);
  }
}
