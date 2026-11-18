import type { ChildSettingSource, EffortLevel } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';
import type { IChildChatSessionHost } from './child-chat-session-host.port';
import type {
  ChildSettingReason,
  IChildSettingRouter,
} from './child-setting-router.port';
import type { SessionChildStartRequest } from './session-spawner.port';

type Resolution =
  | {
      readonly ok: true;
      readonly model?: string;
      readonly effort?: EffortLevel;
      readonly modelSource: ChildSettingSource;
      readonly effortSource: ChildSettingSource;
      readonly settingReason?: ChildSettingReason;
    }
  | {
      readonly ok: false;
      readonly code: 'invalid-model' | 'model-catalog-unavailable';
      readonly detail: string;
    };

/** Resolve pins before provisioning, then admit ranked candidates in preference order. */
export async function resolveChildSettings(
  host: IChildChatSessionHost,
  router: IChildSettingRouter | null,
  request: SessionChildStartRequest,
  root: string,
  caller: string,
  task: string,
  branch: string,
  logger?: Pick<Logger, 'warn' | 'error'> | null,
): Promise<Resolution> {
  let model: string | undefined;
  let effort = request.effort;
  let modelSource: ChildSettingSource = request.model ? 'pin' : 'default';
  let effortSource: ChildSettingSource = request.effort ? 'pin' : 'default';
  let settingReason: ChildSettingReason | undefined =
    request.model && request.effort
      ? { rule: 'pin', input: 'model, effort' }
      : undefined;
  const scope = { workspaceRoot: root, parentSessionId: caller };
  if (request.model) {
    try {
      const admission = await host.resolveChildModel({
        model: request.model,
        ...scope,
      });
      if (!admission.accepted) {
        const accepted = admission.acceptedModels;
        return {
          ok: false,
          code: admission.code,
          detail: accepted?.length
            ? `${admission.message} Accepted models: ${accepted.slice(0, 30).join(', ')}${accepted.length > 30 ? ` (+${accepted.length - 30} more)` : ''}`
            : admission.message,
        };
      }
      model = admission.resolvedModel;
    } catch (error: unknown) {
      logger?.error(
        '[SessionSpawner] Model catalog validation failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      return {
        ok: false,
        code: 'model-catalog-unavailable',
        detail: errorMessage(error),
      };
    }
  }
  if (!request.model || !request.effort) {
    try {
      if (!router) throw new Error('no child setting router is registered');
      const routed = await router.route({
        brief: `${request.label ?? branch}\n${task}`,
        models: request.model ? [] : await host.listChildModels(scope),
        ...(model ? { model } : {}),
        ...(request.effort ? { effort: request.effort } : {}),
        ...(request.phase ? { phaseKind: request.phase.kind } : {}),
        ...(request.workKind ? { workKind: request.workKind } : {}),
      });
      settingReason = routed.reason;
      if (!request.effort) {
        effort = routed.effort;
        effortSource = routed.effortSource;
      }
      if (!request.model && routed.model) {
        for (const candidate of new Set([routed.model, ...routed.candidates])) {
          const admission = await host.resolveChildModel({
            model: candidate,
            ...scope,
          });
          if (admission.accepted) {
            model = admission.resolvedModel;
            // A fallback candidate comes from the ranking, not from the decision model.
            modelSource =
              candidate === routed.model ? routed.modelSource : 'ranking';
            break;
          }
          logger?.warn('[SessionSpawner] Routed model was not admitted', {
            code: admission.code,
          });
        }
        if (!model) settingReason = { rule: 'routed-model-refused', input: routed.reason.input };
      }
    } catch (error: unknown) {
      // degradation-audit: reported - without a route the model stays the host default,
      // but the effort floor still applies, so code work never starts at a low effort.
      logger?.warn('[SessionSpawner] Child setting route unavailable', {
        message: errorMessage(error),
      });
      if (!request.effort) {
        effort = 'high';
        effortSource = 'ranking';
      }
      settingReason = { rule: 'router-unavailable', input: 'effort floor high' };
    }
  }
  return {
    ok: true,
    model,
    effort,
    modelSource,
    effortSource,
    ...(settingReason ? { settingReason } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
