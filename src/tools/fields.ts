import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

/**
 * Canonical field types, mirrored from uplup-api-dotnet
 * Services/FormFieldFactory.cs (CanonicalTypes). `hidden` is not in that list
 * but is accepted by the v1 fields endpoints for URL-param pre-fill.
 */
const CANONICAL_TYPES = [
  'shortAnswer', 'longAnswer', 'richText', 'urlInput', 'number',
  'fullName', 'email', 'phone', 'address', 'country', 'birthday', 'company', 'socialMedia',
  'multipleChoice', 'checkbox', 'dropdown', 'multiSelect', 'pictureChoice', 'yesNo', 'termsConditions',
  'starRating', 'slider', 'npsScore', 'likertScale', 'matrix', 'ranking',
  'dateTime', 'dateRange', 'timePicker',
  'fileUpload', 'mediaUpload', 'signature',
  'heading', 'paragraph', 'divider', 'spacer', 'icon', 'image', 'video', 'mediaBanner',
  'leadCaptureBlock', 'button', 'payment', 'currency', 'tagInput',
  'fillBlank', 'matching', 'ordering',
  'hidden',
] as const;

/**
 * User-friendly aliases accepted on input and translated to canonical types
 * before anything is persisted. The builder and the public renderer only
 * understand the canonical camelCase names.
 */
const TYPE_ALIASES: Record<string, string> = {
  text: 'shortAnswer',
  textarea: 'longAnswer',
  radio: 'multipleChoice',
  select: 'dropdown',
  multiselect: 'multiSelect',
  date: 'dateTime',
  datetime: 'dateTime',
  time: 'timePicker',
  rating: 'starRating',
  url: 'urlInput',
  file: 'fileUpload',
  scale: 'slider',
  nps: 'npsScore',
  likert: 'likertScale',
};

const FieldType = z.enum([...CANONICAL_TYPES, ...Object.keys(TYPE_ALIASES)] as [string, ...string[]]);

const QuizMode = z.enum(['scored', 'personality', 'ungraded']);

const OptionObject = z.object({
  label: z.string().min(1).max(500),
  value: z.string().max(500).optional(),
  isCorrect: z.boolean().optional(),
  points: z.number().int().min(0).optional(),
  personalityTypeId: z.string().min(1).optional()
    .describe('Id of a personality type from update_quiz_settings.personalityTypes. Selecting this option scores one point for that type.'),
  description: z.string().max(500).optional().describe('pictureChoice only.'),
  image: z.string().url().nullable().optional().describe('pictureChoice only.'),
});

const ConditionalLogic = z.object({
  enabled: z.boolean(),
  logic: z.enum(['all', 'any']).optional(),
  conditions: z.array(z.object({
    field_id: z.string(),
    operator: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })).optional(),
});

const CHOICE_TYPES = new Set(['multipleChoice', 'checkbox', 'dropdown', 'multiSelect', 'pictureChoice']);

/**
 * quizConfig.questionType the builder assigns per field type. Mirrors
 * FormFieldFactory.QuestionTypeFor and QuizBuilderContext.getQuestionType.
 */
const ENGINE_QUESTION_TYPE: Record<string, string> = {
  multipleChoice: 'single_choice',
  dropdown: 'single_choice',
  pictureChoice: 'pictureChoice',
  checkbox: 'multipleChoice',
  yesNo: 'yesNo',
  shortAnswer: 'fillBlank',
  longAnswer: 'open_ended',
  number: 'numeric',
  matching: 'matching',
  ordering: 'ordering',
  fillBlank: 'fillBlank',
  ranking: 'ranking',
};

const PARTIAL_CREDIT_DEFAULT = new Set(['checkbox', 'ranking', 'matching', 'fillBlank']);

function canonicalType(type: string): string {
  return TYPE_ALIASES[type] ?? type;
}

function engineQuestionType(type: string): string {
  return ENGINE_QUESTION_TYPE[type] ?? 'single_choice';
}

function normalizeYesNo(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return 'yes';
  if (['no', 'n', 'false', '0'].includes(s)) return 'no';
  return undefined;
}

/**
 * Build the option-object array the Uplup form document expects for the
 * given canonical type. Accepts either:
 *  - `optionObjects`: full per-option control (used as-is, with id filled in)
 *  - `options`: simple string labels; any label matching `correctLabels`
 *    (case-insensitive) gets isCorrect=true and, when set, `pointsPerCorrect`.
 * The per-type parity keys (checked / selected / description+image) match
 * what the builder writes so MCP-built fields render identically.
 */
function buildOptions(type: string, args: {
  options?: string[];
  optionObjects?: z.infer<typeof OptionObject>[];
  correctLabels: string[];
  pointsPerCorrect?: number;
}): Array<Record<string, unknown>> | undefined {
  const parity = (): Record<string, unknown> =>
    type === 'pictureChoice' ? { description: '', image: null } : type === 'multiSelect' ? { selected: false } : { checked: false };

  if (args.optionObjects?.length) {
    return args.optionObjects.map((o) => ({
      id: `opt-${randomUUID().slice(0, 12)}`,
      ...parity(),
      label: o.label,
      value: o.value ?? o.label,
      isCorrect: o.isCorrect ?? false,
      ...(o.points !== undefined ? { points: o.points } : {}),
      ...(o.personalityTypeId !== undefined ? { personalityTypeId: o.personalityTypeId } : {}),
      ...(o.description !== undefined ? { description: o.description } : {}),
      ...(o.image !== undefined ? { image: o.image } : {}),
    }));
  }
  if (args.options?.length) {
    const targets = new Set(args.correctLabels.map((s) => s.trim().toLowerCase()).filter(Boolean));
    return args.options.map((label) => {
      const isCorrect = targets.has(label.trim().toLowerCase());
      return {
        id: `opt-${randomUUID().slice(0, 12)}`,
        ...parity(),
        label,
        value: label,
        isCorrect,
        ...(isCorrect && args.pointsPerCorrect !== undefined ? { points: args.pointsPerCorrect } : {}),
      };
    });
  }
  return undefined;
}

/**
 * Derive a canonical fieldName from a free-form label. Used for hidden fields
 * where the label IS the URL-param key (e.g. label="utm_source") but the
 * canonical `fieldName` slot is still empty. Public-form pre-fill matches
 * URL params against fieldName first, and downstream consumers (CSV export,
 * webhook payloads, KIT/Zapier integrations) all read fieldName directly.
 *
 * Mirror of the normalisation in uplup-frontend/utils/urlParamPrefill.ts:
 *   "First Name" / "first-name" / "firstName" all become "first_name".
 */
function deriveFieldNameFromLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const cleaned = label
    .trim()
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || undefined;
}

interface QuizArgs {
  mode?: z.infer<typeof QuizMode>;
  points?: number;
  correctAnswer?: string;
  acceptedAnswers?: string[];
  explanation?: string;
  hint?: string;
  partialCredit?: boolean;
  hasPersonalityOptions: boolean;
}

/**
 * Build quizConfig the way the builder does (FormFieldFactory.BuildQuizConfig).
 * Returns undefined when nothing quiz-related was requested, or when the
 * question is explicitly ungraded.
 */
function buildQuizConfig(type: string, a: QuizArgs): Record<string, unknown> | undefined {
  if (a.mode === 'ungraded') return undefined;

  if (a.mode === 'personality' || a.hasPersonalityOptions) {
    return { isQuizQuestion: true, questionType: 'personality', points: 1 };
  }

  const anythingRequested =
    a.mode !== undefined ||
    a.points !== undefined ||
    a.correctAnswer !== undefined ||
    a.acceptedAnswers !== undefined ||
    a.explanation !== undefined ||
    a.hint !== undefined ||
    a.partialCredit !== undefined;
  if (!anythingRequested) return undefined;

  const qc: Record<string, unknown> = {
    isQuizQuestion: true,
    questionType: engineQuestionType(type),
    points: Math.min(1000, Math.max(0, a.points ?? 1)),
    partialCredit: a.partialCredit ?? PARTIAL_CREDIT_DEFAULT.has(type),
    partialCreditMode: 'proportional',
    explanation: a.explanation ?? '',
    explanationMedia: null,
    hint: a.hint ?? '',
    timeLimit: null,
    required: true,
  };

  switch (type) {
    case 'yesNo':
      qc.correctAnswer = normalizeYesNo(a.correctAnswer) ?? 'yes';
      break;
    case 'number':
      qc.correctAnswer = a.correctAnswer ?? '';
      qc.tolerance = 0;
      break;
    case 'shortAnswer':
    case 'longAnswer': {
      const accepted = (a.acceptedAnswers ?? []).map((s) => s.trim()).filter(Boolean);
      if (accepted.length === 0 && a.correctAnswer?.trim()) accepted.push(a.correctAnswer.trim());
      qc.acceptedAnswers = accepted;
      break;
    }
    default:
      // Choice types carry correctness on options[].isCorrect.
      break;
  }
  return qc;
}

function buildConditionalLogic(cl: z.infer<typeof ConditionalLogic>): Record<string, unknown> {
  return {
    enabled: cl.enabled,
    logic: cl.logic ?? 'all',
    conditions: (cl.conditions ?? []).map((c) => ({
      fieldId: c.field_id,
      operator: c.operator,
      value: c.value,
    })),
  };
}

interface FieldArgs {
  label?: string;
  field_name?: string;
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: string[];
  option_objects?: z.infer<typeof OptionObject>[];
  correct_answer?: string;
  accepted_answers?: string[];
  points?: number;
  question_type?: z.infer<typeof QuizMode>;
  explanation?: string;
  hint?: string;
  partial_credit?: boolean;
  conditional_logic?: z.infer<typeof ConditionalLogic>;
}

/** Assemble the field body for a known canonical type. */
function buildFieldBody(type: string, a: FieldArgs, opts: { includeType: boolean; deriveHiddenName: boolean }): Record<string, unknown> {
  const hasPersonalityOptions = a.option_objects?.some((o) => o.personalityTypeId !== undefined) ?? false;
  const pointsPerCorrect = a.points ?? (a.correct_answer || a.accepted_answers?.length ? 1 : undefined);

  const richOptions = CHOICE_TYPES.has(type) || a.options?.length || a.option_objects?.length
    ? buildOptions(type, {
        options: a.options,
        optionObjects: a.option_objects,
        correctLabels: [...(a.correct_answer ? [a.correct_answer] : []), ...(a.accepted_answers ?? [])],
        pointsPerCorrect,
      })
    : undefined;

  const quizConfig = buildQuizConfig(type, {
    mode: a.question_type,
    points: pointsPerCorrect,
    correctAnswer: a.correct_answer,
    acceptedAnswers: a.accepted_answers,
    explanation: a.explanation,
    hint: a.hint,
    partialCredit: a.partial_credit,
    hasPersonalityOptions,
  });

  // Hidden fields: the label IS the URL-param key, so derive fieldName from
  // it when the caller did not supply one. Other types only set fieldName
  // when the caller passes it explicitly.
  const resolvedFieldName =
    a.field_name ?? (opts.deriveHiddenName && type === 'hidden' ? deriveFieldNameFromLabel(a.label) : undefined);

  // Uplup's form document stores question text in `content`, not `label`.
  return {
    ...(opts.includeType ? { type } : {}),
    ...(a.required !== undefined ? { required: a.required } : {}),
    ...(a.placeholder !== undefined ? { placeholder: a.placeholder } : {}),
    ...(a.description !== undefined ? { description: a.description } : {}),
    ...(a.label !== undefined ? { content: a.label, label: a.label } : {}),
    ...(resolvedFieldName ? { fieldName: resolvedFieldName, field_name: resolvedFieldName } : {}),
    ...(richOptions ? { options: richOptions } : {}),
    ...(quizConfig ? { quizConfig, points: quizConfig.points } : {}),
    ...(a.conditional_logic ? { conditionalLogic: buildConditionalLogic(a.conditional_logic) } : {}),
  };
}

const QUIZ_AND_OPTION_INPUTS = {
  options: z.array(z.string().min(1).max(500)).optional()
    .describe('Simple option labels for choice types. Pair with `correct_answer` (or `accepted_answers` for several) to mark the correct ones.'),
  correct_answer: z.string().min(1).max(500).optional()
    .describe('Choice types: the label of the correct option (case-insensitive). yesNo: "yes" or "no". number: the expected value. shortAnswer/longAnswer: one accepted answer.'),
  accepted_answers: z.array(z.string().min(1).max(500)).optional()
    .describe('shortAnswer/longAnswer: every answer that counts as correct (written to quizConfig.acceptedAnswers). For choice types, several correct labels.'),
  points: z.number().int().min(0).max(1000).optional()
    .describe('Points for a correct answer (default 1 when a correct answer is given).'),
  option_objects: z.array(OptionObject).optional()
    .describe('Full per-option control: label, isCorrect, points, personalityTypeId (and description/image for pictureChoice). Use instead of `options` for partial credit, multi-correct, or personality quizzes.'),
  question_type: QuizMode.optional()
    .describe('Quiz mode for this question: "scored" (default when any quiz input is given), "personality" (options carry personalityTypeId), or "ungraded" (no quizConfig).'),
  explanation: z.string().max(2000).optional()
    .describe('Shown after submit to explain the correct answer.'),
  hint: z.string().max(500).optional(),
  partial_credit: z.boolean().optional()
    .describe('Award proportional partial credit (defaults to true for checkbox, ranking, matching and fillBlank).'),
  conditional_logic: ConditionalLogic.optional(),
};

interface FieldResponse {
  data?: { type?: string; [k: string]: unknown };
}

export function registerFieldsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_fields',
    {
      title: 'List fields on a form',
      description: 'Returns every question field across all content pages of the form, in display order (layout blocks such as headings and buttons are skipped).',
      inputSchema: { form_id: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id }) =>
      runTool('list_fields', '/api/v1/forms/{id}/fields', () =>
        api.get(`/api/v1/forms/${encodeURIComponent(form_id)}/fields`),
      ),
  );

  server.registerTool(
    'get_field',
    {
      title: 'Get field',
      description: 'Fetch a single field by id, including its options, quizConfig and conditional logic.',
      inputSchema: {
        form_id: z.string().min(1),
        field_id: z.string().min(1),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id, field_id }) =>
      runTool('get_field', '/api/v1/forms/{id}/fields/{fid}', () =>
        api.get(`/api/v1/forms/${encodeURIComponent(form_id)}/fields/${encodeURIComponent(field_id)}`),
      ),
  );

  server.registerTool(
    'create_field',
    {
      title: 'Create field',
      description:
        'Append a new field to the form. Canonical types are camelCase (shortAnswer, longAnswer, email, phone, number, multipleChoice, checkbox, dropdown, multiSelect, pictureChoice, yesNo, starRating, slider, npsScore, likertScale, dateTime, timePicker, fileUpload, hidden, ...); the aliases text, textarea, radio, select, multiselect, date, time, rating, url, file, scale, nps and likert are translated. For choice types supply `options` (labels, with `correct_answer` for quizzes) or `option_objects` (per-option isCorrect/points/personalityTypeId). Scored quizzes: set `correct_answer` (or `accepted_answers` for text questions) and `points`. Personality quizzes: use `option_objects` with `personalityTypeId` matching update_quiz_settings.personalityTypes. HIDDEN fields: the `label` doubles as the URL-param key (label "utm_source" pre-fills from ?utm_source=...); pass `field_name` for a different key.',
      inputSchema: {
        form_id: z.string().min(1),
        type: FieldType,
        label: z.string().min(1).max(500),
        field_name: z.string().min(1).max(120).optional()
          .describe('Canonical key used for URL-param pre-fill, CSV export, and webhook payloads. For hidden fields, defaults to a normalised version of `label` if omitted.'),
        required: z.boolean().optional(),
        placeholder: z.string().max(255).optional(),
        description: z.string().max(1000).optional(),
        ...QUIZ_AND_OPTION_INPUTS,
      },
    },
    async ({ form_id, type, ...rest }) => {
      const finalType = canonicalType(type);
      const body = buildFieldBody(finalType, rest, { includeType: true, deriveHiddenName: true });
      return runTool('create_field', '/api/v1/forms/{id}/fields', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/fields`, body),
      );
    },
  );

  server.registerTool(
    'update_field',
    {
      title: 'Update field',
      description:
        'Patch an existing field. Only provided properties change. Same option/quiz semantics as create_field: supply `correct_answer` or `accepted_answers` plus `points` for scored quizzes, or `option_objects` for full control. When options or quiz inputs are given the field is read first so the right question type is written.',
      inputSchema: {
        form_id: z.string().min(1),
        field_id: z.string().min(1),
        label: z.string().min(1).max(500).optional(),
        field_name: z.string().min(1).max(120).optional()
          .describe('Canonical key used for URL-param pre-fill, CSV export, and webhook payloads.'),
        required: z.boolean().optional(),
        placeholder: z.string().max(255).optional(),
        description: z.string().max(1000).optional(),
        ...QUIZ_AND_OPTION_INPUTS,
      },
    },
    async ({ form_id, field_id, ...rest }) =>
      runTool('update_field', '/api/v1/forms/{id}/fields/{fid}', async () => {
        const path = `/api/v1/forms/${encodeURIComponent(form_id)}/fields/${encodeURIComponent(field_id)}`;
        const needsType =
          rest.options !== undefined ||
          rest.option_objects !== undefined ||
          rest.correct_answer !== undefined ||
          rest.accepted_answers !== undefined ||
          rest.points !== undefined ||
          rest.question_type !== undefined ||
          rest.explanation !== undefined ||
          rest.hint !== undefined ||
          rest.partial_credit !== undefined;
        let type = 'multipleChoice';
        if (needsType) {
          const current = await api.get<FieldResponse>(path);
          type = canonicalType(current?.data?.type ?? type);
        }
        const body = buildFieldBody(type, rest, { includeType: false, deriveHiddenName: false });
        return api.patch(path, body);
      }),
  );

  server.registerTool(
    'delete_field',
    {
      title: 'Delete field',
      description: 'Remove a field from a form. Existing submissions retain their answers but new submissions will not collect this value.',
      inputSchema: {
        form_id: z.string().min(1),
        field_id: z.string().min(1),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ form_id, field_id }) =>
      runTool('delete_field', '/api/v1/forms/{id}/fields/{fid}', () =>
        api.delete(
          `/api/v1/forms/${encodeURIComponent(form_id)}/fields/${encodeURIComponent(field_id)}`,
        ),
      ),
  );

  server.registerTool(
    'reorder_fields',
    {
      title: 'Reorder fields',
      description: 'Change the order of fields on a form. Provide field_ids in the desired order; fields are reordered within their own page.',
      inputSchema: {
        form_id: z.string().min(1),
        field_ids: z.array(z.string().min(1)).min(1),
      },
      annotations: { idempotentHint: true },
    },
    async ({ form_id, field_ids }) =>
      runTool('reorder_fields', '/api/v1/forms/{id}/fields/reorder', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/fields/reorder`, { field_ids }),
      ),
  );
}
