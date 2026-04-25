import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

export function registerQuizTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_quiz_settings',
    {
      title: 'Get quiz settings',
      description: 'Returns scoring rules, pass/fail thresholds, and outcome configuration for a quiz.',
      inputSchema: { form_id: z.string().min(1) },
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
        'Update scoring rules, pass threshold, and outcome rules for a quiz. Only provided fields change.',
      inputSchema: {
        form_id: z.string().min(1),
        passing_score: z.number().min(0).max(100).optional(),
        scoring_method: z.enum(['points', 'percentage', 'custom']).optional(),
        outcomes: z
          .array(
            z.object({
              name: z.string(),
              min_score: z.number().optional(),
              max_score: z.number().optional(),
              message: z.string().optional(),
            }),
          )
          .optional(),
      },
    },
    async ({ form_id, ...rest }) =>
      runTool('update_quiz_settings', '/api/v1/forms/{id}/quiz/settings', () =>
        api.patch(`/api/v1/forms/${encodeURIComponent(form_id)}/quiz/settings`, rest),
      ),
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
    },
    async ({ form_id, limit }) =>
      runTool('get_quiz_leaderboard', '/api/v1/forms/{id}/quiz/leaderboard', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/quiz/leaderboard${qs({ limit: limit ?? 10 })}`,
        ),
      ),
  );
}
