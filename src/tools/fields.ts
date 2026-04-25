import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

const FieldType = z.enum([
  'text',
  'email',
  'phone',
  'number',
  'textarea',
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'date',
  'time',
  'datetime',
  'rating',
  'url',
  'file',
  'address',
  'signature',
  'hidden',
]);

export function registerFieldsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_fields',
    {
      title: 'List fields on a form',
      description: 'Returns every field across all content pages of the form, in display order.',
      inputSchema: { form_id: z.string().min(1) },
    },
    async ({ form_id }) =>
      runTool('list_fields', '/api/v1/forms/{id}/fields', () =>
        api.get(`/api/v1/forms/${encodeURIComponent(form_id)}/fields`),
      ),
  );

  server.registerTool(
    'create_field',
    {
      title: 'Create field',
      description:
        'Append a new field to the form. Choose a field type and provide a label. Options arrays are required for select/radio/checkbox/multiselect.',
      inputSchema: {
        form_id: z.string().min(1),
        type: FieldType,
        label: z.string().min(1).max(255),
        required: z.boolean().optional(),
        placeholder: z.string().max(255).optional(),
        options: z.array(z.string()).optional().describe('Options for select-style fields.'),
        description: z.string().max(1000).optional(),
      },
    },
    async ({ form_id, ...field }) =>
      runTool('create_field', '/api/v1/forms/{id}/fields', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/fields`, field),
      ),
  );

  server.registerTool(
    'update_field',
    {
      title: 'Update field',
      description: 'Patch an existing field. Only provided properties change.',
      inputSchema: {
        form_id: z.string().min(1),
        field_id: z.string().min(1),
        label: z.string().min(1).max(255).optional(),
        required: z.boolean().optional(),
        placeholder: z.string().max(255).optional(),
        options: z.array(z.string()).optional(),
        description: z.string().max(1000).optional(),
      },
    },
    async ({ form_id, field_id, ...rest }) =>
      runTool('update_field', '/api/v1/forms/{id}/fields/{fid}', () =>
        api.patch(
          `/api/v1/forms/${encodeURIComponent(form_id)}/fields/${encodeURIComponent(field_id)}`,
          rest,
        ),
      ),
  );

  server.registerTool(
    'delete_field',
    {
      title: 'Delete field',
      description: 'Remove a field from a form. Existing submissions retain their answers but new submissions will not collect this value.',
      inputSchema: {
        form_id: z.string().min(1),
        field_id: z.string().min(1),
      },
      annotations: { destructiveHint: true },
    },
    async ({ form_id, field_id }) =>
      runTool('delete_field', '/api/v1/forms/{id}/fields/{fid}', () =>
        api.delete(
          `/api/v1/forms/${encodeURIComponent(form_id)}/fields/${encodeURIComponent(field_id)}`,
        ),
      ),
  );

  server.registerTool(
    'reorder_fields',
    {
      title: 'Reorder fields',
      description: 'Change the order of fields on a form. Provide field_ids in the desired order.',
      inputSchema: {
        form_id: z.string().min(1),
        field_ids: z.array(z.string().min(1)).min(1),
      },
    },
    async ({ form_id, field_ids }) =>
      runTool('reorder_fields', '/api/v1/forms/{id}/fields/reorder', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/fields/reorder`, { field_ids }),
      ),
  );
}
