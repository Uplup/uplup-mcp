import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UplupApiClient } from '../api/client.js';

/**
 * Two resource templates:
 *   uplup://forms/{form_id}                 — form definition JSON
 *   uplup://forms/{form_id}/submissions     — paginated submissions JSON
 *
 * Listing returns the user's forms (one resource per form).
 */
export function registerFormResources(server: McpServer, api: UplupApiClient): void {
  server.registerResource(
    'form',
    new ResourceTemplate('uplup://forms/{form_id}', {
      list: async () => {
        const data = (await api.get<{ forms?: Array<{ id: string; title?: string }> }>('/api/v1/forms?limit=100')) ?? {};
        const forms = data.forms ?? [];
        return {
          resources: forms.map((f) => ({
            uri: `uplup://forms/${encodeURIComponent(f.id)}`,
            name: f.title ?? f.id,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    {
      title: 'Uplup form',
      description: 'Full form definition including pages, fields, settings, and design.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const formId = String(vars.form_id);
      const data = await api.get(`/api/v1/forms/${encodeURIComponent(formId)}`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    'form-submissions',
    new ResourceTemplate('uplup://forms/{form_id}/submissions', { list: undefined }),
    {
      title: 'Uplup form submissions',
      description: 'Paginated submissions for a form (first 100).',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const formId = String(vars.form_id);
      const data = await api.get(`/api/v1/forms/${encodeURIComponent(formId)}/submissions?limit=100`);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}
