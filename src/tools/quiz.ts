import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

/**
 * Input keys mirror document.quiz exactly (uplup-frontend
 * context/QuizBuilderContext.tsx QuizSettings), so what the client sends is
 * what the builder reads. Upstream merges the provided keys into the stored
 * settings; nothing omitted here is touched.
 */
const ScoringMode = z.enum(['points', 'percentage', 'pass_fail', 'personality']);
const ShowCorrectAnswers = z.enum(['always', 'after_submit', 'never']);

const Timing = z.object({
  enabled: z.boolean().optional(),
  totalTimeLimit: z.number().int().min(0).nullable().optional()
    .describe('Whole-quiz time limit in MINUTES; null for none.'),
  perQuestionTimeLimit: z.number().int().min(0).nullable().optional()
    .describe('Per-question time limit in SECONDS; null for none.'),
  showTimer: z.boolean().optional(),
  autoSubmitOnTimeout: z.boolean().optional(),
});

const RetakePolicy = z.object({
  allowRetakes: z.boolean().optional(),
  maxAttempts: z.number().int().min(0).nullable().optional().describe('null means unlimited.'),
  cooldownPeriod: z.number().int().min(0).nullable().optional()
    .describe('Wait between attempts in MINUTES; null for none.'),
  keepBestScore: z.boolean().optional(),
});

const QuestionBehavior = z.object({
  randomizeQuestions: z.boolean().optional(),
  randomizeAnswers: z.boolean().optional(),
  showQuestionNumbers: z.boolean().optional(),
  allowSkipping: z.boolean().optional(),
  allowBackNavigation: z.boolean().optional(),
  showProgressBar: z.boolean().optional(),
  instantFeedback: z.boolean().optional(),
});

const ResultsDisplay = z.object({
  showScore: z.boolean().optional(),
  showPercentage: z.boolean().optional(),
  showCorrectAnswers: ShowCorrectAnswers.optional(),
  showExplanations: z.boolean().optional(),
  showDetailedBreakdown: z.boolean().optional(),
});

const LeadCaptureField = z.object({
  enabled: z.boolean().optional(),
  required: z.boolean().optional(),
  label: z.string().max(120).optional(),
});

const LeadCapture = z.object({
  enabled: z.boolean().optional(),
  required: z.boolean().optional().describe('When false, respondents may skip the lead form.'),
  skipText: z.string().max(200).optional(),
  fields: z.object({
    name: LeadCaptureField.optional(),
    email: LeadCaptureField.optional(),
    phone: LeadCaptureField.optional(),
  }).optional(),
  heading: z.string().max(200).optional(),
  subheading: z.string().max(300).optional(),
  buttonText: z.string().max(100).optional(),
  privacyText: z.string().max(500).optional(),
  showPrivacyNote: z.boolean().optional(),
  sendResultsEmail: z.boolean().optional(),
});

const PersonalityType = z.object({
  id: z.string().min(1).optional().describe('Omit to have one generated; the response lists the ids.'),
  name: z.string().min(1).max(120),
  color: z.string().max(32).optional(),
  image: z.string().url().nullable().optional(),
  shortDescription: z.string().max(500).optional(),
  fullDescription: z.string().max(5000).optional(),
  description: z.string().max(5000).optional(),
}).passthrough();

const PersonalitySettings = z.object({
  showBreakdown: z.boolean().optional().describe('Show percentage bars for every type on the results page.'),
  tieBreaker: z.string().max(32).optional().describe('How ties are resolved, e.g. "first".'),
}).passthrough();

/** Recursively drop undefined values so only provided keys reach upstream. */
function compact<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => compact(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = compact(v);
    }
    return out as T;
  }
  return value;
}

export function registerQuizTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_quiz_settings',
    {
      title: 'Get quiz settings',
      description:
        'Returns document.quiz for a quiz: scoringMode, passingScore, passingScoreType, timing, questionBehavior, resultsDisplay, retakePolicy, personalityTypes, personalitySettings, leadCapture and result pages.',
      inputSchema: { form_id: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id }) =>
      runTool('get_quiz_settings', '/api/v1/forms/{id}/quiz/settings', () =>
        api.get(`/api/v1/forms/${encodeURIComponent(form_id)}/quiz/settings`),
      ),
  );

  server.registerTool(
    'update_quiz_settings',
    {
      title: 'Update quiz settings',
      description:
        'Update quiz settings with the same camelCase keys the builder stores: scoringMode, passingScore, passingScoreType, timing (totalTimeLimit in minutes), retakePolicy (cooldownPeriod in minutes), questionBehavior, resultsDisplay, leadCapture, personalityTypes and personalitySettings. Upstream merges the provided keys into the existing settings, so send only what should change. Personality types without an id get one generated; the response lists the ids to use as personalityTypeId on option_objects in create_field.',
      inputSchema: {
        form_id: z.string().min(1),
        scoringMode: ScoringMode.optional(),
        passingScore: z.number().min(0).optional()
          .describe('Threshold to pass, interpreted per passingScoreType.'),
        passingScoreType: z.enum(['percentage', 'points']).optional(),
        timing: Timing.optional(),
        retakePolicy: RetakePolicy.optional(),
        questionBehavior: QuestionBehavior.optional(),
        resultsDisplay: ResultsDisplay.optional(),
        leadCapture: LeadCapture.optional(),
        personalityTypes: z.array(PersonalityType).optional()
          .describe('Replaces the personality type list. Each option on a personality question references one of these ids.'),
        personalitySettings: PersonalitySettings.optional(),
      },
    },
    async ({ form_id, personalityTypes, ...rest }) => {
      const body: Record<string, unknown> = compact({ ...rest });
      let assignedTypes: Array<{ id: string; name: string }> | undefined;
      if (personalityTypes) {
        const withIds = personalityTypes.map((t) => ({
          ...t,
          id: t.id ?? `pt-${randomUUID().slice(0, 12)}`,
          color: t.color ?? '#6366f1',
          image: t.image ?? null,
        }));
        body.personalityTypes = compact(withIds);
        assignedTypes = withIds.map((t) => ({ id: t.id, name: t.name }));
      }
      if (Object.keys(body).length === 0) {
        throw new Error('Nothing to update: pass at least one quiz setting.');
      }
      return runTool('update_quiz_settings', '/api/v1/forms/{id}/quiz/settings', async () => {
        const result = await api.patch<Record<string, unknown>>(
          `/api/v1/forms/${encodeURIComponent(form_id)}/quiz/settings`,
          body,
        );
        return assignedTypes ? { ...result, personalityTypes: assignedTypes } : result;
      });
    },
  );

  server.registerTool(
    'get_quiz_results',
    {
      title: 'List quiz results',
      description:
        'Per-attempt quiz results, newest first: submission_id, email, values (the answers), timestamp, country_code, score, max_score, percentage and passed. Rows hidden by the Free plan paywall carry is_hidden=true with no email or values. Pagination via limit (default 20, max 100) + offset.',
      inputSchema: {
        form_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id, limit, offset }) =>
      runTool('get_quiz_results', '/api/v1/forms/{id}/quiz/results', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/quiz/results${qs({ limit: limit ?? 20, offset: offset ?? 0 })}`,
        ),
      ),
  );

  server.registerTool(
    'get_quiz_leaderboard',
    {
      title: 'Quiz leaderboard',
      description: 'Top attempts on a quiz ranked by percentage score (highest first). limit 1 to 50, default 10.',
      inputSchema: {
        form_id: z.string().min(1),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id, limit }) =>
      runTool('get_quiz_leaderboard', '/api/v1/forms/{id}/quiz/leaderboard', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/quiz/leaderboard${qs({ limit: limit ?? 10 })}`,
        ),
      ),
  );
}
