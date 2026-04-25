import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

const WebhookEvent = z.enum(['submission.created', 'quiz.completed', '*']);

export function registerWebhooksTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_webhooks',
    {
      title: 'List webhook subscriptions',
      description: 'List all webhook subscriptions on the account. Pro plan or higher.',
      inputSchema: {},
    },
    async () => runTool('list_webhooks', '/api/v1/webhooks', () => api.get('/api/v1/webhooks')),
  );

  server.registerTool(
    'create_webhook',
    {
      title: 'Create webhook subscription',
      description:
        'Subscribe to events delivered to a target_url. Use "*" in events for all events. Pro plan or higher required.',
      inputSchema: {
        target_url: z.string().url(),
        events: z.array(WebhookEvent).min(1),
        form_ids: z.array(z.string().min(1)).optional().describe('Limit to specific form ids; omit for all forms.'),
      },
    },
    async ({ target_url, events, form_ids }) =>
      runTool('create_webhook', '/api/v1/webhooks', () =>
        api.post('/api/v1/webhooks', { target_url, events, form_ids }),
      ),
  );

  server.registerTool(
    'get_webhook',
    {
      title: 'Get webhook',
      description: 'Fetch a single webhook subscription including its target URL.',
      inputSchema: { webhook_id: z.string().min(1) },
    },
    async ({ webhook_id }) =>
      runTool('get_webhook', '/api/v1/webhooks/{id}', () =>
        api.get(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`),
      ),
  );

  server.registerTool(
    'update_webhook',
    {
      title: 'Update webhook',
      description: 'Modify webhook target URL, events, or form filters.',
      inputSchema: {
        webhook_id: z.string().min(1),
        target_url: z.string().url().optional(),
        events: z.array(WebhookEvent).min(1).optional(),
        form_ids: z.array(z.string().min(1)).optional(),
        is_active: z.boolean().optional(),
      },
    },
    async ({ webhook_id, ...rest }) =>
      runTool('update_webhook', '/api/v1/webhooks/{id}', () =>
        api.patch(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`, rest),
      ),
  );

  server.registerTool(
    'delete_webhook',
    {
      title: 'Delete webhook',
      description: 'Remove a webhook subscription. Future events will not be delivered.',
      inputSchema: { webhook_id: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ webhook_id }) =>
      runTool('delete_webhook', '/api/v1/webhooks/{id}', () =>
        api.delete(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`),
      ),
  );

  server.registerTool(
    'test_webhook',
    {
      title: 'Send test webhook payload',
      description: 'Fire a synthetic test event so the user can verify their endpoint receives it.',
      inputSchema: { webhook_id: z.string().min(1) },
    },
    async ({ webhook_id }) =>
      runTool('test_webhook', '/api/v1/webhooks/{id}/test', () =>
        api.post(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}/test`, {}),
      ),
  );

  server.registerTool(
    'get_webhook_deliveries',
    {
      title: 'Webhook delivery log',
      description: 'Recent delivery attempts for a webhook, with status codes and response body summaries.',
      inputSchema: { webhook_id: z.string().min(1) },
    },
    async ({ webhook_id }) =>
      runTool('get_webhook_deliveries', '/api/v1/webhooks/{id}/deliveries', () =>
        api.get(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}/deliveries`),
      ),
  );
}
