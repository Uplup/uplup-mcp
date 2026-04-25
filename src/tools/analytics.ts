import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

const RangeArgs = {
  form_id: z.string().min(1),
  from: z.string().optional().describe('ISO date (YYYY-MM-DD) — start of range.'),
  to: z.string().optional().describe('ISO date (YYYY-MM-DD) — end of range.'),
};

export function registerAnalyticsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_form_analytics',
    {
      title: 'Form analytics overview',
      description: 'Top-line analytics for a form: views, starts, submissions, conversion rate.',
      inputSchema: RangeArgs,
    },
    async ({ form_id, from, to }) =>
      runTool('get_form_analytics', '/api/v1/forms/{id}/analytics', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics${qs({ from, to })}`,
        ),
      ),
  );

  server.registerTool(
    'get_submission_analytics',
    {
      title: 'Submission trend analytics',
      description: 'Per-day submission counts to show trends over a time range.',
      inputSchema: RangeArgs,
    },
    async ({ form_id, from, to }) =>
      runTool('get_submission_analytics', '/api/v1/forms/{id}/analytics/submissions', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics/submissions${qs({ from, to })}`,
        ),
      ),
  );

  server.registerTool(
    'get_geography_analytics',
    {
      title: 'Geography analytics',
      description: 'Submission counts by country and region.',
      inputSchema: RangeArgs,
    },
    async ({ form_id, from, to }) =>
      runTool('get_geography_analytics', '/api/v1/forms/{id}/analytics/geography', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics/geography${qs({ from, to })}`,
        ),
      ),
  );

  server.registerTool(
    'get_performance_analytics',
    {
      title: 'Performance analytics',
      description: 'Form load time, time-to-submit, drop-off rate by field.',
      inputSchema: RangeArgs,
    },
    async ({ form_id, from, to }) =>
      runTool('get_performance_analytics', '/api/v1/forms/{id}/analytics/performance', () =>
        api.get(
          `/api/v1/forms/${encodeURIComponent(form_id)}/analytics/performance${qs({ from, to })}`,
        ),
      ),
  );
}
