import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

const Period = z.enum(['7d', '30d', '90d', 'all']).optional()
  .describe('Time window: last 7, 30 or 90 days, or all time (default all).');
const GroupBy = z.enum(['day', 'week', 'month']).optional()
  .describe('Bucket size for grouped counts (default day).');

const READ_ANNOTATIONS = { readOnlyHint: true, idempotentHint: true } as const;

export function registerAnalyticsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_form_analytics',
    {
      title: 'Form analytics overview',
      description:
        'Top-line totals for a form over the chosen period: total_views, total_submissions and conversion_rate (submissions / views, percent).',
      inputSchema: {
        form_id: z.string().min(1),
        period: Period,
        group_by: GroupBy,
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ form_id, period, group_by }) =>
      runTool('get_form_analytics', '/api/v1/forms/{id}/analytics', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics${qs({ period, group_by })}`,
        ),
      ),
  );

  server.registerTool(
    'get_submission_analytics',
    {
      title: 'Submission trend analytics',
      description:
        'Submission counts grouped by day, week or month over the chosen period, for trend charts. Each row carries the bucket label and its submission count.',
      inputSchema: {
        form_id: z.string().min(1),
        period: Period,
        group_by: GroupBy,
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ form_id, period, group_by }) =>
      runTool('get_submission_analytics', '/api/v1/forms/{id}/analytics/submissions', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics/submissions${qs({ period, group_by })}`,
        ),
      ),
  );

  server.registerTool(
    'get_geography_analytics',
    {
      title: 'Geography analytics',
      description: 'Submission counts by country_code and region (top 50).',
      inputSchema: { form_id: z.string().min(1) },
      annotations: READ_ANNOTATIONS,
    },
    async ({ form_id }) =>
      runTool('get_geography_analytics', '/api/v1/forms/{id}/analytics/geography', () =>
        api.get(`/api/v1/forms/${encodeURIComponent(form_id)}/analytics/geography`),
      ),
  );

  server.registerTool(
    'get_performance_analytics',
    {
      title: 'Activity pattern analytics',
      description:
        'When people submit: hourly_activity (submissions per hour of day, 0-23) and daily_patterns (submissions per weekday). Useful for timing sends and promotions.',
      inputSchema: { form_id: z.string().min(1) },
      annotations: READ_ANNOTATIONS,
    },
    async ({ form_id }) =>
      runTool('get_performance_analytics', '/api/v1/forms/{id}/analytics/performance', () =>
        api.get(`/api/v1/forms/${encodeURIComponent(form_id)}/analytics/performance`),
      ),
  );
}
