import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

const RangeArgs = {
  form_id: z.string().min(1),
  from: z.string().optional().describe('ISO date (YYYY-MM-DD) — start of range.'),
  to: z.string().optional().describe('ISO date (YYYY-MM-DD) — end of range.'),
  period: z.enum(['7d', '30d', '90d', 'all']).optional()
    .describe('Convenience preset; when present, takes precedence over from/to.'),
};

const READ_ANNOTATIONS = { readOnlyHint: true, idempotentHint: true } as const;

export function registerAnalyticsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_form_analytics',
    {
      title: 'Form analytics overview',
      description: 'Top-line analytics for a form: views, starts, submissions, conversion rate. Use either explicit from/to dates or a preset period (7d/30d/90d/all).',
      inputSchema: RangeArgs,
      annotations: READ_ANNOTATIONS,
    },
    async ({ form_id, from, to, period }) =>
      runTool('get_form_analytics', '/api/v1/forms/{id}/analytics', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics${qs({ from, to, period })}`,
        ),
      ),
  );

  server.registerTool(
    'get_submission_analytics',
    {
      title: 'Submission trend analytics',
      description: 'Per-day submission counts to show trends over a time range, plus hourly activity and weekday patterns.',
      inputSchema: RangeArgs,
      annotations: READ_ANNOTATIONS,
    },
    async ({ form_id, from, to, period }) =>
      runTool('get_submission_analytics', '/api/v1/forms/{id}/analytics/submissions', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics/submissions${qs({ from, to, period })}`,
        ),
      ),
  );

  server.registerTool(
    'get_geography_analytics',
    {
      title: 'Geography analytics',
      description: 'Submission counts by country and region.',
      inputSchema: RangeArgs,
      annotations: READ_ANNOTATIONS,
    },
    async ({ form_id, from, to, period }) =>
      runTool('get_geography_analytics', '/api/v1/forms/{id}/analytics/geography', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics/geography${qs({ from, to, period })}`,
        ),
      ),
  );

  server.registerTool(
    'get_performance_analytics',
    {
      title: 'Performance analytics',
      description: 'Form load time, time-to-submit, drop-off rate by field.',
      inputSchema: RangeArgs,
      annotations: READ_ANNOTATIONS,
    },
    async ({ form_id, from, to, period }) =>
      runTool('get_performance_analytics', '/api/v1/forms/{id}/analytics/performance', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics/performance${qs({ from, to, period })}`,
        ),
      ),
  );
}
