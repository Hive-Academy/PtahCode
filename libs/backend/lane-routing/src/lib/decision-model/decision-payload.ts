import { LANE_DEFAULT_MODEL, type LaneLimitState } from '@ptah-extension/shared';
import type { ModelEffort } from '../contracts/route-decide-result.schema';
import { ANY_EFFORT, type EffortBucket } from '../matrix/choice-evidence';
import { AUTOMATIC_MATRIX_MODEL } from '../matrix/local-derivation';
import { FAMILY_PROFILE_MODEL } from '../matrix/matrix.types';
import type {
  CompactSystemOneState,
  SystemOneQuestions,
  SystemOneState,
} from './system-one.schema';

/** Request text is capped at the payload boundary (NFR Security, part A §12). */
export const REQUEST_TEXT_MAX_CHARS = 8000;

/** One offered executor and model, with effort when choice scoring is enabled. */
export interface DecisionOption {
  readonly laneId: string;
  readonly family: string;
  readonly model: string;
  readonly effort?: ModelEffort;
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

/** Aggregated outcome figures for one lane and task kind, optionally by choice. */
export interface DecisionOutcomeFigures {
  readonly laneId: string;
  readonly taskKind: string;
  readonly model?: string;
  readonly effort?: EffortBucket;
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
    ...(option.effort === undefined ? [] : [`effort ${option.effort}`]),
    `limit state ${option.limitState}`,
    `score ${option.score}`,
  ].join(', ');
}

export function decisionOutcomeModel(model: string): string {
  return model === LANE_DEFAULT_MODEL || model === AUTOMATIC_MATRIX_MODEL ? FAMILY_PROFILE_MODEL : model;
}

export function outcomeFigureLabel({ laneId, taskKind, model, effort }: DecisionOutcomeFigures): string {
  return model === undefined
    ? `${laneId}/${taskKind}`
    : JSON.stringify([laneId, taskKind, model, effort ?? ANY_EFFORT]);
}

function figureGroup(laneId: string, model?: string, effort?: EffortBucket): string {
  return JSON.stringify([laneId, model, model === undefined ? undefined : effort ?? ANY_EFFORT]);
}

/** Build the allowlisted request state and choice criteria. */
export function buildDecisionPayload(input: DecisionPayloadInput): DecisionPayload {
  const request = input.request.slice(0, REQUEST_TEXT_MAX_CHARS);
  const hasChoiceFacts = input.outcomeFigures.some((figure) => figure.model !== undefined)
    || input.questions.some((question) =>
      question.kind === 'lane-choice' && question.options.some((option) => option.effort !== undefined));
  const state: CompactSystemOneState = {
    request,
    ...(input.taskType === undefined ? {} : { taskType: input.taskType }),
    ...(input.depth === undefined ? {} : { depth: input.depth }),
    legend: hasChoiceFacts
      ? 'Criteria: executor index, total (includes outcomes), limit state, sample count. Executors: lane, family, model, optional effort. Past outcomes by [lane, task kind, model, effort]: delivery %, sample count. Model "*" denotes the lane default.'
      : 'Criteria: executor index, total (includes outcomes), limit state, sample count. Executors: lane, family, model. Past outcomes by lane/task kind: delivery %, sample count.',
    availableExecutors: {},
    pastOutcomes: {},
  };
  const questions: SystemOneQuestions = {};
  const executorIndices = new Map<string, string>();
  const figuresByChoice = new Map<string, Map<string, { label: string; counts: [number, number] }>>();
  for (const figures of input.outcomeFigures) {
    const samples = figures.delivered + figures.failed;
    if (samples > 0) {
      const group = figureGroup(figures.laneId, figures.model, figures.effort);
      let byTask = figuresByChoice.get(group);
      if (byTask === undefined) {
        byTask = new Map();
        figuresByChoice.set(group, byTask);
      }
      byTask.set(figures.taskKind, {
        label: outcomeFigureLabel(figures),
        counts: [Math.round(100 * figures.delivered / samples), samples],
      });
    }
  }

  for (const question of input.questions) {
    const criteria: Record<string, string> = {};
    if (question.kind === 'lane-choice') {
      question.options.forEach((option, index) => {
        const choice = JSON.stringify([option.laneId, option.model, option.effort]);
        let executor = executorIndices.get(choice);
        if (executor === undefined) {
          executor = `e${executorIndices.size + 1}`;
          executorIndices.set(choice, executor);
          state.availableExecutors[executor] = option.effort === undefined
            ? [option.laneId, option.family, option.model]
            : [option.laneId, option.family, option.model, option.effort];
        }
        const model = decisionOutcomeModel(option.model);
        const exact = figuresByChoice.get(figureGroup(option.laneId, model, option.effort));
        const anyEffort = figuresByChoice.get(figureGroup(option.laneId, model, ANY_EFFORT));
        const lane = figuresByChoice.get(figureGroup(option.laneId));
        let samples = 0;
        if (question.taskKind === undefined) {
          const byTask = exact ?? anyEffort ?? lane;
          for (const { label, counts } of byTask?.values() ?? []) {
            state.pastOutcomes[label] = counts;
            samples += counts[1];
          }
        } else {
          const outcome = exact?.get(question.taskKind)
            ?? anyEffort?.get(question.taskKind)
            ?? lane?.get(question.taskKind);
          if (outcome !== undefined) {
            state.pastOutcomes[outcome.label] = outcome.counts;
            samples = outcome.counts[1];
          }
        }
        criteria[`o${index + 1}`] = `${executor} ${option.score} ${option.limitState} ${samples}`;
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
