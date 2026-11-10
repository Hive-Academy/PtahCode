import { z } from 'zod';
import type { EffortLevel } from '@ptah-extension/shared';
import type { DecisionModelConfig } from '../decision-model/decision-model.config';
import { DecisionCaller } from '../decision-model/decision-caller';
import type { StructuredDecisionCompleter } from '../decision-model/structured-decision.port';
import type { LaneRoutingLogger } from '../lane-routing-logger';
import { runFixedRequest } from '../pipeline/model-refine';
import {
  DECISION_REQUEST_TIMEOUT_MS,
  REQUEST_SIZE_LIMIT_BYTES,
} from '../routing-constants';
import {
  rankChildSettings,
  type ChildSettingChoice,
} from './child-setting-rule';

const Input = z.object({
  brief: z.string().transform((brief) => brief.slice(0, 8000)),
  models: z.array(z.string().min(1).max(200)),
  model: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
});
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export class ChildSettingRouterService {
  private readonly caller: DecisionCaller;

  constructor(
    config: DecisionModelConfig,
    private readonly logger: LaneRoutingLogger,
    structured?: StructuredDecisionCompleter,
  ) {
    this.caller = new DecisionCaller({
      config,
      logger,
      ...(structured ? { structured } : {}),
    });
  }

  async route(raw: unknown): Promise<ChildSettingChoice> {
    const input = Input.parse(raw);
    const fallback = rankChildSettings(input.brief, input.models);
    const result: ChildSettingChoice = {
      ...(input.model
        ? { model: input.model }
        : fallback.model
          ? { model: fallback.model }
          : {}),
      ...(input.effort
        ? { effort: input.effort }
        : fallback.effort
          ? { effort: fallback.effort }
          : {}),
      modelSource: input.model ? 'pin' : fallback.modelSource,
      effortSource: input.effort ? 'pin' : fallback.effortSource,
    };
    if (input.model && input.effort) return result;
    const modelOptions = input.model ? [] : [...new Set(input.models)];
    const effortOptions = input.effort ? [] : [...EFFORTS];
    const questions = [
      ...(modelOptions.length
        ? [
            {
              key: 'model',
              instructions: 'Choose one admitted child model for this brief.',
              criteria: Object.fromEntries(
                modelOptions.map((model, index) => [`o${index + 1}`, model]),
              ),
            },
          ]
        : []),
      ...(effortOptions.length
        ? [
            {
              key: 'effort',
              instructions: 'Choose one child effort level for this brief.',
              criteria: Object.fromEntries(
                effortOptions.map((effort, index) => [`o${index + 1}`, effort]),
              ),
            },
          ]
        : []),
    ];
    if (!questions.length) return result;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    const timedOut = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        expired = true;
        reject(new Error('child setting decision timeout'));
      }, DECISION_REQUEST_TIMEOUT_MS);
    });
    const request = async () => {
      const opened = await this.caller.openCaller();
      if (expired) return result;
      if (opened.kind === 'unset') return result;
      if (opened.kind === 'blocked') {
        this.logger.warn('[child-setting-router] decision model unavailable', {
          cause: opened.cause,
        });
        return result;
      }
      const outcome = await runFixedRequest({
        request: input.brief,
        questions,
        maxRequestBytes: REQUEST_SIZE_LIMIT_BYTES,
        dispatch: this.caller.dispatchFor(opened),
        logger: this.logger,
      });
      if (expired) return result;
      await this.caller.noteLive(opened, outcome);
      if (!outcome.succeeded)
        this.logger.warn('[child-setting-router] decision failed', {
          cause: outcome.requestCause,
        });
      const choice = (
        key: string,
        options: readonly string[],
      ): string | undefined => {
        const answer = outcome.answers.get(key);
        if (answer?.cause || !answer?.choice) {
          if (answer)
            this.logger.warn('[child-setting-router] invalid decision label', {
              key,
              cause: answer.cause,
            });
          return undefined;
        }
        const index = Number(answer.choice.slice(1)) - 1;
        const selected = /^o[1-9]\d*$/.test(answer.choice)
          ? options[index]
          : undefined;
        if (!selected)
          this.logger.warn('[child-setting-router] invalid decision label', {
            key,
          });
        return selected;
      };
      const model = modelOptions.length
        ? choice('model', modelOptions)
        : undefined;
      const effort = effortOptions.length
        ? (choice('effort', effortOptions) as EffortLevel | undefined)
        : undefined;
      return {
        ...(model || result.model ? { model: model ?? result.model } : {}),
        ...(effort || result.effort ? { effort: effort ?? result.effort } : {}),
        modelSource: model ? 'model' : result.modelSource,
        effortSource: effort ? 'model' : result.effortSource,
      };
    };
    const pending = request();
    pending.catch((error: unknown) => {
      this.logger.debug('[child-setting-router] late decision error', {
        name: error instanceof Error ? error.name : typeof error,
      });
    });
    try {
      return await Promise.race([pending, timedOut]);
    } catch (error: unknown) {
      this.logger.warn('[child-setting-router] decision error', {
        name: error instanceof Error ? error.name : typeof error,
      });
      return result;
    } finally {
      if (deadline) clearTimeout(deadline);
    }
  }
}
