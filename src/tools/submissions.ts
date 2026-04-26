import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

export function registerSubmissionsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_submissions',
    {
      title: 'List submissions',
      description:
        'Returns submissions for a form. Supports filtering by country and pass/fail (for quizzes), and sorting by newest/oldest/highest_score/lowest_score. Pagination via limit (default 20, max 100) + offset.',
      inputSchema: {
        form_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        sort: z.enum(['newest', 'oldest', 'highest_score', 'lowest_score']).optional(),
        filter_country: z.string().length(2).optional()
          .describe('ISO 3166-1 alpha-2 country code (e.g. "US", "GB").'),
        filter_passed: z.boolean().optional()
          .describe('Quiz only: true returns passing submissions, false returns failing.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id, limit, offset, sort, filter_country, filter_passed }) =>
      runTool('list_submissions', '/api/v1/forms/{id}/submissions', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/submissions${qs({
            limit: limit ?? 20,
            offset: offset ?? 0,
            sort,
            filter_country,
            filter_passed,
          })}`,
        ),
      ),
  );

  server.registerTool(
    'get_submission',
    {
      title: 'Get submission',
      description: 'Fetch a single submission with all field answers and metadata.',
      inputSchema: {
        form_id: z.string().min(1),
        submission_id: z.string().min(1),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id, submission_id }) =>
      runTool('get_submission', '/api/v1/forms/{id}/submissions/{sid}', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/submissions/${encodeURIComponent(submission_id)}`,
        ),
      ),
  );

  server.registerTool(
    'delete_submission',
    {
      title: 'Delete submission',
      description: 'Permanently delete a single submission. Irreversible.',
      inputSchema: {
        form_id: z.string().min(1),
        submission_id: z.string().min(1),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ form_id, submission_id }) =>
      runTool('delete_submission', '/api/v1/forms/{id}/submissions/{sid}', () =>
        api.delete(
          `/api/v1/forms/${encodeURIComponent(form_id)}/submissions/${encodeURIComponent(submission_id)}`,
        ),
      ),
  );

  server.registerTool(
    'export_submissions',
    {
      title: 'Export submissions',
      description: 'Generate a CSV or JSON export of all submissions on a form.',
      inputSchema: {
        form_id: z.string().min(1),
        format: z.enum(['csv', 'json']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ form_id, format }) =>
      runTool('export_submissions', '/api/v1/forms/{id}/submissions/export', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/submissions/export`, {
          format: format ?? 'json',
        }),
      ),
  );
}
