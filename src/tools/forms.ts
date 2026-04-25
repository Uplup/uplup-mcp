import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

export function registerFormsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_forms',
    {
      title: 'List forms',
      description:
        'Returns the user\'s forms and quizzes. Use this first when a user asks about a form by name. Supports pagination via limit (default 20, max 100) and offset.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async ({ limit, offset }) =>
      runTool('list_forms', '/api/v1/forms', () =>
        api.get(`/api/v1/forms${qs({ limit: limit ?? 20, offset: offset ?? 0 })}`),
      ),
  );

  server.registerTool(
    'get_form',
    {
      title: 'Get form',
      description:
        'Fetch one form by id, including its document structure (pages, fields, settings). Use after list_forms to inspect a specific form.',
      inputSchema: {
        form_id: z.string().min(1).describe('The form id from list_forms.'),
      },
    },
    async ({ form_id }) =>
      runTool('get_form', '/api/v1/forms/{id}', () => api.get(`/api/v1/forms/${encodeURIComponent(form_id)}`)),
  );

  server.registerTool(
    'create_form',
    {
      title: 'Create form',
      description:
        'Create a new form or quiz. Provide title and optionally description, content_type ("form" or "quiz"), and an initial document with pages/fields. Returns the created form id.',
      inputSchema: {
        title: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        content_type: z.enum(['form', 'quiz']).optional(),
        document: z.record(z.unknown()).optional().describe('Optional initial document JSON (pages, fields, etc.).'),
      },
    },
    async ({ title, description, content_type, document }) =>
      runTool('create_form', '/api/v1/forms', () =>
        api.post('/api/v1/forms', {
          title,
          description,
          content_type: content_type ?? 'form',
          document,
        }),
      ),
  );

  server.registerTool(
    'update_form',
    {
      title: 'Update form',
      description: 'Update form metadata or document. Only provided fields are changed.',
      inputSchema: {
        form_id: z.string().min(1),
        title: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).optional(),
        document: z.record(z.unknown()).optional(),
      },
    },
    async ({ form_id, ...rest }) =>
      runTool('update_form', '/api/v1/forms/{id}', () =>
        api.patch(`/api/v1/forms/${encodeURIComponent(form_id)}`, rest),
      ),
  );

  server.registerTool(
    'delete_form',
    {
      title: 'Delete form',
      description: 'Permanently delete a form and all its submissions. This is irreversible.',
      inputSchema: { form_id: z.string().min(1) },
      annotations: { destructiveHint: true },
    },
    async ({ form_id }) =>
      runTool('delete_form', '/api/v1/forms/{id}', () => api.delete(`/api/v1/forms/${encodeURIComponent(form_id)}`)),
  );

  server.registerTool(
    'clone_form',
    {
      title: 'Clone form',
      description: 'Duplicate a form. Returns the new form id.',
      inputSchema: {
        form_id: z.string().min(1),
        title: z.string().min(1).max(255).optional().describe('Optional title for the clone.'),
      },
    },
    async ({ form_id, title }) =>
      runTool('clone_form', '/api/v1/forms/{id}/clone', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/clone`, { title }),
      ),
  );

  server.registerTool(
    'publish_form',
    {
      title: 'Publish or unpublish form',
      description: 'Toggle whether a form is publicly accessible. Pass published=true to make it live, false to take it offline.',
      inputSchema: {
        form_id: z.string().min(1),
        published: z.boolean(),
      },
    },
    async ({ form_id, published }) =>
      runTool('publish_form', '/api/v1/forms/{id}/publish', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/publish`, { published }),
      ),
  );
}
