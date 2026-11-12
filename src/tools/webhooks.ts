import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

const WebhookEvent = z.enum(['submission.created', 'quiz.completed', '*']);

const PLAN_NOTE =
  'Webhooks need a Pro plan or higher, both to create a subscription and for deliveries to be sent, and a workspace can hold at most 25 active webhooks.';

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

export function registerWebhooksTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_webhooks',
    {
      title: 'List webhook subscriptions',
      description: `List all webhook subscriptions on the workspace (webhook_id, url, events, form_ids, is_active, created_at). ${PLAN_NOTE}`,
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => runTool('list_webhooks', '/api/v1/webhooks', () => api.get('/api/v1/webhooks')),
  );

  server.registerTool(
    'create_webhook',
    {
      title: 'Create webhook subscription',
      description:
        `Subscribe to events delivered by POST to url. events: submission.created, quiz.completed, or "*" for all. form_ids limits delivery to specific forms. The response includes the HMAC signing secret (shown once). ${PLAN_NOTE}`,
      inputSchema: {
        url: z.string().url().describe('HTTPS endpoint that receives the POSTed events.'),
        events: z.array(WebhookEvent).min(1),
        form_ids: z.array(z.string().min(1)).optional().describe('Limit to specific form ids; omit for all forms.'),
      },
    },
    async ({ url, events, form_ids }) =>
      runTool('create_webhook', '/api/v1/webhooks', () =>
        api.post('/api/v1/webhooks', stripUndefined({ url, events, form_ids })),
      ),
  );

  server.registerTool(
    'get_webhook',
    {
      title: 'Get webhook',
      description:
        'Fetch a single webhook subscription: webhook_id, url, events, form_ids, is_active, created_at, plus recent_deliveries (the last 10 attempts).',
      inputSchema: { webhook_id: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
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
      description: `Modify the webhook url, events, form_ids, or pause/resume it with is_active. Only provided keys change. ${PLAN_NOTE}`,
      inputSchema: {
        webhook_id: z.string().min(1),
        url: z.string().url().optional(),
        events: z.array(WebhookEvent).min(1).optional(),
        form_ids: z.array(z.string().min(1)).optional(),
        is_active: z.boolean().optional(),
      },
    },
    async ({ webhook_id, url, events, form_ids, is_active }) =>
      runTool('update_webhook', '/api/v1/webhooks/{id}', () =>
        api.patch(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`, stripUndefined({ url, events, form_ids, is_active })),
      ),
  );

  server.registerTool(
    'delete_webhook',
    {
      title: 'Delete webhook',
      description: 'Remove a webhook subscription. Future events will not be delivered.',
      inputSchema: { webhook_id: z.string().min(1) },
      annotations: { destructiveHint: true, idempotentHint: true },
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
      description: 'Fire a signed synthetic "test" event so the user can verify their endpoint receives it. Returns the endpoint HTTP status and the first 500 characters of its response.',
      inputSchema: { webhook_id: z.string().min(1) },
    },
    async ({ webhook_id }) =>
      runTool('test_webhook', '/api/v1/webhooks/{id}/test', () =>
        api.post(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}/test`, {}),
      ),
  );

  server.registerTool(
    'regenerate_webhook_secret',
    {
      title: 'Regenerate webhook signing secret',
      description: 'Rotate the HMAC signing secret used to sign webhook payloads (X-Uplup-Signature). Existing receivers must update to the new secret.',
      inputSchema: { webhook_id: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ webhook_id }) =>
      runTool('regenerate_webhook_secret', '/api/v1/webhooks/{id}/regenerate-secret', () =>
        api.post(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}/regenerate-secret`, {}),
      ),
  );

  server.registerTool(
    'get_webhook_deliveries',
    {
      title: 'Webhook delivery log',
      description: 'Delivery attempts for a webhook, newest first: event_type, status, response_code, attempts, created_at, delivered_at. Pagination via limit (default 20, max 100) + offset.',
      inputSchema: {
        webhook_id: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ webhook_id, limit, offset }) =>
      runTool('get_webhook_deliveries', '/api/v1/webhooks/{id}/deliveries', () =>
        api.get(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}/deliveries${qs({ limit: limit ?? 20, offset: offset ?? 0 })}`),
      ),
  );
}
