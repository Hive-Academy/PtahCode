import type { LaneLimitState } from '@ptah-extension/shared';
import type {
  CompactSystemOneState,
  SystemOneQuestions,
  SystemOneState,
} from './system-one.schema';

/** Request text is capped at the payload boundary (NFR Security, part A §12). */
export const REQUEST_TEXT_MAX_CHARS = 8000;

/** One offered (executor, model) pair with the facts its label may carry. */
export interface DecisionOption {
  readonly laneId: string;
  readonly family: string;
  readonly model: string;
  readonly limitState: LaneLimitState;
  readonly score: number;
}

/** A phase question whose options are ranked lane entries, labelled `o1..oN` in order. */
export interface LaneChoiceQuestionInput {
  readonly kind: 'lane-choice';
  readonly taskKind?: string;
  readonly phaseId: string;
  readonly instructions: string;
  /** Top P with the rotation pick first (part A §6 step 8). */
  readonly options: readonly DecisionOption[];
}

/** A question with caller-authored criteria (pre-flight `task_type`, `depth`). */
export interface FixedCriteriaQuestionInput {
  readonly kind: 'fixed-criteria';
  readonly phaseId: string;
  readonly instructions: string;
  readonly criteria: Readonly<Record<string, string>>;
}

export type DecisionQuestionInput =
  LaneChoiceQuestionInput | FixedCriteriaQuestionInput;

/** Aggregated outcome figures for one lane and task kind. */
export interface DecisionOutcomeFigures {
  readonly laneId: string;
  readonly taskKind: string;
  readonly delivered: number;
  readonly failed: number;
}

export interface DecisionPayloadInput {
  readonly request: string;
  readonly taskType?: string;
  readonly depth?: string;
  readonly questions: readonly DecisionQuestionInput[];
  readonly outcomeFigures: readonly DecisionOutcomeFigures[];
}

/** Request pieces the builder emits; the client adds the `model` field. */
export interface DecisionPayload {
  readonly state: SystemOneState;
  readonly questions: SystemOneQuestions;
}

/** The option text carried by the structured-provider prompt. */
export function formatDecisionOptionLabel(option: DecisionOption): string {
  return [
    `lane ${option.laneId}`,
    `family ${option.family}`,
    `model ${option.model}`,
    `limit state ${option.limitState}`,
    `score ${option.score}`,
  ].join(', ');
}

/** Build the allowlisted request state and choice criteria. */
export function buildDecisionPayload(input: DecisionPayloadInput): DecisionPayload {
  const request = input.request.slice(0, REQUEST_TEXT_MAX_CHARS);
  const state: CompactSystemOneState = {
    request,
    ...(input.taskType === undefined ? {} : { taskType: input.taskType }),
    ...(input.depth === undefined ? {} : { depth: input.depth }),
    legend: 'Criteria: executor index, total (includes outcomes), limit state, sample count. Executors: lane, family, model. Past outcomes by lane/task kind: delivery %, sample count.',
    availableExecutors: {},
    pastOutcomes: {},
  };
  const questions: SystemOneQuestions = {};
  const executorIndices = new Map<string, string>();
  const figuresByKey = new Map<string, [number, number]>();
  for (const figures of input.outcomeFigures) {
    const samples = figures.delivered + figures.failed;
    if (samples > 0) {
      figuresByKey.set(`${figures.laneId}/${figures.taskKind}`, [
        Math.round(100 * figures.delivered / samples),
        samples,
      ]);
    }
  }

  for (const question of input.questions) {
    const criteria: Record<string, string> = {};
    if (question.kind === 'lane-choice') {
      question.options.forEach((option, index) => {
        const pair = JSON.stringify([option.laneId, option.model]);
        let executor = executorIndices.get(pair);
        if (executor === undefined) {
          executor = `e${executorIndices.size + 1}`;
          executorIndices.set(pair, executor);
          state.availableExecutors[executor] = [option.laneId, option.family, option.model];
        }
        const key = `${option.laneId}/${question.taskKind}`;
        const outcome = figuresByKey.get(key);
        if (outcome !== undefined) state.pastOutcomes[key] = outcome;
        criteria[`o${index + 1}`] = `${executor} ${option.score} ${option.limitState} ${outcome?.[1] ?? 0}`;
      });
    } else {
      Object.assign(criteria, question.criteria);
    }
    questions[question.phaseId] = {
      type: 'choice',
      instructions: question.instructions,
      criteria,
    };
  }

  return {
    state: executorIndices.size === 0 ? { request, availableExecutors: {}, pastOutcomes: {} } : state,
    questions,
  };
}
