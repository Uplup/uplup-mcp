import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

export function registerDesignTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_form_design',
    {
      title: 'Get form design',
      description: 'Returns colors, typography, layout, background, and theme assignment for a form.',
      inputSchema: { form_id: z.string().min(1) },
    },
    async ({ form_id }) =>
      runTool('get_form_design', '/api/v1/forms/{id}/design', () =>
        api.get(`/api/v1/forms/${encodeURIComponent(form_id)}/design`),
      ),
  );

  server.registerTool(
    'update_form_design',
    {
      title: 'Update form design',
      description:
        'Patch design properties (colors, typography, button styles, background). Only provided keys change.',
      inputSchema: {
        form_id: z.string().min(1),
        primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        background_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        font_family: z.string().max(100).optional(),
        button_radius: z.number().min(0).max(64).optional(),
        layout: z.enum(['single', 'multi-step', 'conversational']).optional(),
        theme_id: z.string().optional(),
      },
    },
    async ({ form_id, ...rest }) =>
      runTool('update_form_design', '/api/v1/forms/{id}/design', () =>
        api.patch(`/api/v1/forms/${encodeURIComponent(form_id)}/design`, rest),
      ),
  );

  server.registerTool(
    'list_themes',
    {
      title: 'List themes',
      description: 'Available preset themes that can be applied to a form via update_form_design (theme_id).',
      inputSchema: {},
    },
    async () => runTool('list_themes', '/api/v1/themes', () => api.get('/api/v1/themes')),
  );
}
