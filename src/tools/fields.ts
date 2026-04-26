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
        'Append a new field to the form. Choose a field type and provide a label. For select/radio/checkbox/dropdown, supply either `options` (simple labels, with optional `correct_answer` for quizzes) or `option_objects` (full control over isCorrect/points/personalityScore per option). For scored quizzes set `correct_answer` and `points`. For personality quizzes use `option_objects` with `personalityScore`.',
      inputSchema: {
        form_id: z.string().min(1),
        type: FieldType,
        label: z.string().min(1).max(500),
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
    async ({ form_id, label, options, option_objects, correct_answer, points, question_type, explanation, hint, partial_credit, conditional_logic, ...rest }) => {
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
      // Uplup's form document stores question text in `content`, not `label`.
      // The frontend builder + public renderer both read `field.content`.
      const body: Record<string, unknown> = {
        ...rest,
        ...(label !== undefined ? { content: label, label } : {}),
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
    async ({ form_id, field_id, label, options, option_objects, correct_answer, points, question_type, explanation, hint, partial_credit, conditional_logic, ...rest }) => {
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
