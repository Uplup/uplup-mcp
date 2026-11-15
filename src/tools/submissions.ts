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
        'Returns submissions for a form (submission_id, email, phone, country_code, region, values, timestamp, created_at). Filter by country and, for quizzes, pass/fail; sort by newest/oldest/highest_score/lowest_score. Pagination via limit (default 20, max 100) + offset. Plan paywall: on the Free plan, rows over the monthly response limit come back as stubs with is_hidden=true and their values stripped, and the list carries hidden_count with how many were hidden.',
      inputSchema: {
        form_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        sort: z.enum(['newest', 'oldest', 'highest_score', 'lowest_score']).optional()
          .describe('Default newest. highest_score / lowest_score apply to quizzes.'),
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
      description:
        'Fetch a single submission with all field answers and metadata. A row beyond the Free plan limit comes back with is_hidden=true and no values.',
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
      description:
        'Soft deletes a single submission: it disappears from lists, exports and analytics but is retained upstream. There is no API to restore it.',
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
      description:
        'Export all submissions on a form (up to 10,000, newest first) as CSV or JSON. CSV export needs a paid plan (Pro or higher); the Free plan receives a 403 with an upgrade message. Rows hidden by the plan paywall are omitted from exports.',
      inputSchema: {
        form_id: z.string().min(1),
        format: z.enum(['csv', 'json']).optional().describe('Default json.'),
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
