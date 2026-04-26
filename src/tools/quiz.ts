import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

const ScoringMethod = z.enum(['points', 'percentage', 'pass_fail', 'personality', 'custom']);
const ShowCorrectAnswers = z.enum(['never', 'after_submit', 'always']);

export function registerQuizTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_quiz_settings',
    {
      title: 'Get quiz settings',
      description: 'Returns scoring rules, pass/fail thresholds, outcome configuration, timing, retake policy, and results display settings for a quiz.',
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
        'Update scoring rules, pass threshold, outcomes, timing, retake policy, question behavior (randomize / progress bar / instant feedback), and how results are displayed. Only provided fields change.',
      inputSchema: {
        form_id: z.string().min(1),

        // Core scoring
        passing_score: z.number().min(0).max(100).optional(),
        passing_score_type: z.enum(['percentage', 'absolute']).optional(),
        scoring_method: ScoringMethod.optional(),

        // Outcomes (score band → message)
        outcomes: z
          .array(
            z.object({
              name: z.string().min(1),
              min_score: z.number().optional(),
              max_score: z.number().optional(),
              message: z.string().optional(),
            }),
          )
          .optional(),

        // Personality outcomes (for personality-mode quizzes)
        personality_outcomes: z
          .array(
            z.object({
              id: z.string().min(1),
              title: z.string().min(1),
              description: z.string().optional(),
              min_score: z.number().optional(),
              max_score: z.number().optional(),
            }),
          )
          .optional(),

        // Timing
        timing: z
          .object({
            enabled: z.boolean().optional(),
            show_timer: z.boolean().optional(),
            total_time_limit_seconds: z.number().int().min(0).optional(),
            per_question_time_limit_seconds: z.number().int().min(0).optional(),
            auto_submit_on_timeout: z.boolean().optional(),
          })
          .optional(),

        // Retake policy
        retake_policy: z
          .object({
            allow_retakes: z.boolean().optional(),
            max_attempts: z.number().int().min(0).nullable().optional(),
            keep_best_score: z.boolean().optional(),
            cooldown_period_seconds: z.number().int().min(0).nullable().optional(),
          })
          .optional(),

        // Question behavior
        question_behavior: z
          .object({
            show_progress_bar: z.boolean().optional(),
            show_question_numbers: z.boolean().optional(),
            randomize_questions: z.boolean().optional(),
            randomize_answers: z.boolean().optional(),
            allow_skipping: z.boolean().optional(),
            instant_feedback: z.boolean().optional(),
            allow_back_navigation: z.boolean().optional(),
          })
          .optional(),

        // Results display
        results_display: z
          .object({
            show_score: z.boolean().optional(),
            show_percentage: z.boolean().optional(),
            show_correct_answers: ShowCorrectAnswers.optional(),
            show_explanations: z.boolean().optional(),
            show_detailed_breakdown: z.boolean().optional(),
          })
          .optional(),

        // Leaderboard
        leaderboard_enabled: z.boolean().optional(),
      },
    },
    async ({ form_id, timing, retake_policy, question_behavior, results_display, leaderboard_enabled, personality_outcomes, ...rest }) => {
      const body: Record<string, unknown> = { ...rest };
      if (timing) {
        body.timing = {
          ...(timing.enabled !== undefined ? { enabled: timing.enabled } : {}),
          ...(timing.show_timer !== undefined ? { showTimer: timing.show_timer } : {}),
          ...(timing.total_time_limit_seconds !== undefined ? { totalTimeLimit: timing.total_time_limit_seconds } : {}),
          ...(timing.per_question_time_limit_seconds !== undefined ? { perQuestionTimeLimit: timing.per_question_time_limit_seconds } : {}),
          ...(timing.auto_submit_on_timeout !== undefined ? { autoSubmitOnTimeout: timing.auto_submit_on_timeout } : {}),
        };
      }
      if (retake_policy) {
        body.retakePolicy = {
          ...(retake_policy.allow_retakes !== undefined ? { allowRetakes: retake_policy.allow_retakes } : {}),
          ...(retake_policy.max_attempts !== undefined ? { maxAttempts: retake_policy.max_attempts } : {}),
          ...(retake_policy.keep_best_score !== undefined ? { keepBestScore: retake_policy.keep_best_score } : {}),
          ...(retake_policy.cooldown_period_seconds !== undefined ? { cooldownPeriod: retake_policy.cooldown_period_seconds } : {}),
        };
      }
      if (question_behavior) {
        body.questionBehavior = {
          ...(question_behavior.show_progress_bar !== undefined ? { showProgressBar: question_behavior.show_progress_bar } : {}),
          ...(question_behavior.show_question_numbers !== undefined ? { showQuestionNumbers: question_behavior.show_question_numbers } : {}),
          ...(question_behavior.randomize_questions !== undefined ? { randomizeQuestions: question_behavior.randomize_questions } : {}),
          ...(question_behavior.randomize_answers !== undefined ? { randomizeAnswers: question_behavior.randomize_answers } : {}),
          ...(question_behavior.allow_skipping !== undefined ? { allowSkipping: question_behavior.allow_skipping } : {}),
          ...(question_behavior.instant_feedback !== undefined ? { instantFeedback: question_behavior.instant_feedback } : {}),
          ...(question_behavior.allow_back_navigation !== undefined ? { allowBackNavigation: question_behavior.allow_back_navigation } : {}),
        };
      }
      if (results_display) {
        body.resultsDisplay = {
          ...(results_display.show_score !== undefined ? { showScore: results_display.show_score } : {}),
          ...(results_display.show_percentage !== undefined ? { showPercentage: results_display.show_percentage } : {}),
          ...(results_display.show_correct_answers !== undefined ? { showCorrectAnswers: results_display.show_correct_answers } : {}),
          ...(results_display.show_explanations !== undefined ? { showExplanations: results_display.show_explanations } : {}),
          ...(results_display.show_detailed_breakdown !== undefined ? { showDetailedBreakdown: results_display.show_detailed_breakdown } : {}),
        };
      }
      if (leaderboard_enabled !== undefined) {
        body.leaderboard = { enabled: leaderboard_enabled };
      }
      if (personality_outcomes) {
        body.personalityResults = personality_outcomes.map((o) => ({
          id: o.id,
          title: o.title,
          ...(o.description !== undefined ? { description: o.description } : {}),
          ...(o.min_score !== undefined ? { minScore: o.min_score } : {}),
          ...(o.max_score !== undefined ? { maxScore: o.max_score } : {}),
        }));
      }
      return runTool('update_quiz_settings', '/api/v1/forms/{id}/quiz/settings', () =>
        api.patch(`/api/v1/forms/${encodeURIComponent(form_id)}/quiz/settings`, body),
      );
    },
  );

  server.registerTool(
    'get_quiz_results',
    {
      title: 'List quiz results',
      description: 'Per-attempt quiz results: score, percentage, outcome, pass/fail.',
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
      description: 'Top scorers on a quiz.',
      inputSchema: {
        form_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional(),
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
