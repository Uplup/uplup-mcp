import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

const FieldType = z.enum([
  'text',
  'email',
  'phone',
  'number',
  'textarea',
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'date',
  'time',
  'datetime',
  'rating',
  'url',
  'file',
  'address',
  'signature',
  'hidden',
  'yesNo',
  'multipleChoice',
  'scale',
  'shortAnswer',
  'longAnswer',
  'dropdown',
]);

const QuestionType = z.enum(['scored', 'personality', 'ungraded']);

const OptionObject = z.object({
  label: z.string().min(1).max(500),
  value: z.string().max(500).optional(),
  isCorrect: z.boolean().optional(),
  points: z.number().int().min(0).optional(),
  personalityScore: z.number().int().optional(),
});

/**
 * Build the rich option-object array that the Uplup form-document expects.
 * Accepts either:
 *  - `option_objects`: full per-option control (used as-is, with id filled in)
 *  - `options`: simple string labels; if `correct_answer` matches one (case-insensitive),
 *    that option gets isCorrect=true; if `points_per_correct` is set, all-correct options
 *    get that point value.
 */
function buildOptions(args: {
  options?: string[];
  optionObjects?: z.infer<typeof OptionObject>[];
  correctAnswer?: string;
  pointsPerCorrect?: number;
}): Array<Record<string, unknown>> | undefined {
  if (args.optionObjects?.length) {
    return args.optionObjects.map((o) => ({
      id: `opt-${randomUUID().slice(0, 12)}`,
      label: o.label,
      value: o.value ?? o.label,
      isCorrect: o.isCorrect ?? false,
      ...(o.points !== undefined ? { points: o.points } : {}),
      ...(o.personalityScore !== undefined ? { personalityScore: o.personalityScore } : {}),
    }));
  }
  if (args.options?.length) {
    const target = args.correctAnswer?.trim().toLowerCase();
    return args.options.map((label) => {
      const isCorrect = target !== undefined && label.trim().toLowerCase() === target;
      return {
        id: `opt-${randomUUID().slice(0, 12)}`,
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
 * Map user-friendly MCP field type aliases to Uplup's canonical document types.
 * The form builder + public renderer only handle canonical types (camelCase Uplup
 * convention). Aliases like `radio` or `text` are accepted for ergonomic input
 * but must be translated before persisting.
 */
const TYPE_ALIASES: Record<string, string> = {
  radio: 'multipleChoice',
  multiselect: 'multiSelect',
  select: 'dropdown',
  text: 'shortAnswer',
  textarea: 'longAnswer',
  date: 'dateTime',
  datetime: 'dateTime',
  time: 'Time',
  rating: 'starRating',
  url: 'urlInput',
  file: 'fileUpload',
  scale: 'likertScale',
};

function canonicalType(type: string): string {
  return TYPE_ALIASES[type] ?? type;
}

/**
 * Derive a canonical fieldName from a free-form label. Used for hidden fields
 * where the label IS the URL-param key (e.g. label="utm_source") but the
 * canonical `fieldName` slot is still empty. Public-form pre-fill matches
 * URL params against fieldName first, so leaving it null silently breaks
 * the use case — even though the frontend has a label fallback for hidden
 * fields specifically, downstream consumers (CSV export, webhook payloads,
 * KIT/Zapier integrations) all read fieldName directly, so populating it
 * here keeps the data model clean at the source.
 *
 * Mirror of the normalisation in uplup-frontend/utils/urlParamPrefill.ts:
 *   "First Name" / "first-name" / "firstName" all become "first_name".
 */
function deriveFieldNameFromLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const cleaned = label
    .trim()
    .toLowerCase()
    // Insert underscore between camelCase boundaries: firstName -> first_name.
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // Collapse anything non-alphanumeric to underscore.
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || undefined;
}

function buildQuizConfig(args: {
  questionType?: 'scored' | 'personality' | 'ungraded';
  points?: number;
  correctAnswer?: string;
  explanation?: string;
  hint?: string;
  partialCredit?: boolean;
}): Record<string, unknown> | undefined {
  if (
    args.questionType === undefined &&
    args.points === undefined &&
    args.correctAnswer === undefined &&
    args.explanation === undefined &&
    args.hint === undefined &&
    args.partialCredit === undefined
  ) {
    return undefined;
  }
  return {
    questionType: args.questionType ?? 'scored',
    isQuizQuestion: true,
    points: args.points ?? 1,
    ...(args.correctAnswer !== undefined ? { correctAnswer: args.correctAnswer } : {}),
    ...(args.explanation !== undefined ? { explanation: args.explanation } : {}),
    ...(args.hint !== undefined ? { hint: args.hint } : {}),
    ...(args.partialCredit !== undefined
      ? { partialCredit: args.partialCredit, partialCreditMode: 'proportional' }
      : {}),
  };
}

export function registerFieldsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_fields',
    {
      title: 'List fields on a form',
      description: 'Returns every field across all content pages of the form, in display order.',
      inputSchema: { form_id: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id }) =>
      runTool('list_fields', '/api/v1/forms/{id}/fields', () =>
        api.get(`/api/v1/forms/${encodeURIComponent(form_id)}/fields`),
      ),
  );

  server.registerTool(
    'create_field',
    {
      title: 'Create field',
      description:
        'Append a new field to the form. Choose a field type and provide a label. For select/radio/checkbox/dropdown, supply either `options` (simple labels, with optional `correct_answer` for quizzes) or `option_objects` (full control over isCorrect/points/personalityScore per option). For scored quizzes set `correct_answer` and `points`. For personality quizzes use `option_objects` with `personalityScore`. For HIDDEN fields, the `label` doubles as the URL-param key: a hidden field with label "utm_source" will pre-fill from `?utm_source=...` when a participant lands on the form. Pass `field_name` explicitly if you need a different key from the label.',
      inputSchema: {
        form_id: z.string().min(1),
        type: FieldType,
        label: z.string().min(1).max(500),
        field_name: z.string().min(1).max(120).optional()
          .describe('Canonical key used for URL-param pre-fill, CSV export, and webhook payloads. For hidden fields, defaults to a normalised version of `label` if omitted.'),
        required: z.boolean().optional(),
        placeholder: z.string().max(255).optional(),
        description: z.string().max(1000).optional(),

        // Simple options + scored-quiz shortcut
        options: z.array(z.string().min(1).max(500)).optional()
          .describe('Simple option labels. Pair with `correct_answer` to mark one correct.'),
        correct_answer: z.string().min(1).max(500).optional()
          .describe('Must match exactly one entry in `options` (case-insensitive). Sets that option isCorrect=true.'),
        points: z.number().int().min(0).max(100).optional()
          .describe('Points awarded for a correct answer (default 1 if `correct_answer` is set).'),

        // Full per-option control
        option_objects: z.array(OptionObject).optional()
          .describe('Full per-option control: label, isCorrect, points, personalityScore. Use instead of `options` for partial credit, multi-correct, or personality quizzes.'),

        // Quiz config extras
        question_type: QuestionType.optional()
          .describe('Quiz mode for this question. Default "scored".'),
        explanation: z.string().max(2000).optional()
          .describe('Shown after submit to explain the correct answer.'),
        hint: z.string().max(500).optional(),
        partial_credit: z.boolean().optional()
          .describe('For multi-select questions, award proportional partial credit.'),

        // Conditional logic pass-through
        conditional_logic: z.object({
          enabled: z.boolean(),
          logic: z.enum(['all', 'any']).optional(),
          conditions: z.array(z.object({
            field_id: z.string(),
            operator: z.string(),
            value: z.union([z.string(), z.number(), z.boolean()]).optional(),
          })).optional(),
        }).optional(),
      },
    },
    async ({ form_id, type, label, field_name, options, option_objects, correct_answer, points, question_type, explanation, hint, partial_credit, conditional_logic, ...rest }) => {
      const richOptions = buildOptions({
        options,
        optionObjects: option_objects,
        correctAnswer: correct_answer,
        pointsPerCorrect: points ?? (correct_answer ? 1 : undefined),
      });
      const quizConfig = buildQuizConfig({
        questionType: question_type,
        points: points ?? (correct_answer ? 1 : undefined),
        correctAnswer: correct_answer,
        explanation,
        hint,
        partialCredit: partial_credit,
      });
      const finalType = canonicalType(type);
      // Auto-derive fieldName for hidden fields when the caller didn't supply
      // one — the label IS the URL-param key in that case (e.g. label="email"
      // matches ?email=...). Other field types only set fieldName when the
      // caller passes it explicitly, to keep the canonical-key column out of
      // every author's way for normal questions.
      const resolvedFieldName =
        field_name ?? (finalType === 'hidden' ? deriveFieldNameFromLabel(label) : undefined);
      // Uplup's form document stores question text in `content`, not `label`,
      // and uses canonical type names (e.g. `multipleChoice`, not `radio`).
      const body: Record<string, unknown> = {
        ...rest,
        type: finalType,
        ...(label !== undefined ? { content: label, label } : {}),
        ...(resolvedFieldName ? { fieldName: resolvedFieldName, field_name: resolvedFieldName } : {}),
        ...(richOptions ? { options: richOptions } : {}),
        ...(quizConfig ? { quizConfig, points: quizConfig.points } : {}),
        ...(conditional_logic
          ? {
              conditionalLogic: {
                enabled: conditional_logic.enabled,
                logic: conditional_logic.logic ?? 'all',
                conditions: (conditional_logic.conditions ?? []).map((c) => ({
                  fieldId: c.field_id,
                  operator: c.operator,
                  value: c.value,
                })),
              },
            }
          : {}),
      };
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
        'Patch an existing field. Only provided properties change. Same option/quiz semantics as create_field — supply `correct_answer` + `points` for scored quizzes, or `option_objects` for full control.',
      inputSchema: {
        form_id: z.string().min(1),
        field_id: z.string().min(1),
        label: z.string().min(1).max(500).optional(),
        field_name: z.string().min(1).max(120).optional()
          .describe('Canonical key used for URL-param pre-fill, CSV export, and webhook payloads.'),
        required: z.boolean().optional(),
        placeholder: z.string().max(255).optional(),
        description: z.string().max(1000).optional(),
        options: z.array(z.string().min(1).max(500)).optional(),
        correct_answer: z.string().min(1).max(500).optional(),
        points: z.number().int().min(0).max(100).optional(),
        option_objects: z.array(OptionObject).optional(),
        question_type: QuestionType.optional(),
        explanation: z.string().max(2000).optional(),
        hint: z.string().max(500).optional(),
        partial_credit: z.boolean().optional(),
        conditional_logic: z.object({
          enabled: z.boolean(),
          logic: z.enum(['all', 'any']).optional(),
          conditions: z.array(z.object({
            field_id: z.string(),
            operator: z.string(),
            value: z.union([z.string(), z.number(), z.boolean()]).optional(),
          })).optional(),
        }).optional(),
      },
    },
    async ({ form_id, field_id, label, field_name, options, option_objects, correct_answer, points, question_type, explanation, hint, partial_credit, conditional_logic, ...rest }) => {
      const richOptions = buildOptions({
        options,
        optionObjects: option_objects,
        correctAnswer: correct_answer,
        pointsPerCorrect: points ?? (correct_answer ? 1 : undefined),
      });
      const quizConfig = buildQuizConfig({
        questionType: question_type,
        points: points ?? (correct_answer ? 1 : undefined),
        correctAnswer: correct_answer,
        explanation,
        hint,
        partialCredit: partial_credit,
      });
      const body: Record<string, unknown> = {
        ...rest,
        ...(label !== undefined ? { content: label, label } : {}),
        ...(field_name !== undefined ? { fieldName: field_name, field_name } : {}),
        ...(richOptions ? { options: richOptions } : {}),
        ...(quizConfig ? { quizConfig, points: quizConfig.points } : {}),
        ...(conditional_logic
          ? {
              conditionalLogic: {
                enabled: conditional_logic.enabled,
                logic: conditional_logic.logic ?? 'all',
                conditions: (conditional_logic.conditions ?? []).map((c) => ({
                  fieldId: c.field_id,
                  operator: c.operator,
                  value: c.value,
                })),
              },
            }
          : {}),
      };
      return runTool('update_field', '/api/v1/forms/{id}/fields/{fid}', () =>
        api.patch(
          `/api/v1/forms/${encodeURIComponent(form_id)}/fields/${encodeURIComponent(field_id)}`,
          body,
        ),
      );
    },
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
      description: 'Change the order of fields on a form. Provide field_ids in the desired order.',
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
