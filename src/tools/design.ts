import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex like #1A2B3C');

export function registerDesignTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_form_design',
    {
      title: 'Get form design',
      description: 'Returns colors, typography, layout, background, and theme assignment for a form.',
      inputSchema: { form_id: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
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
        'Patch design properties for a form. Use top-level shortcuts (primary_color, background_color, font_family, etc.) for quick changes, or `theme_overrides` to patch nested groups exactly: heading_text, body_text, question_text, buttons, text_field, form_layout, branding, completion. Only provided keys change.',
      inputSchema: {
        form_id: z.string().min(1),

        // Quick shortcuts that map to common properties
        primary_color: Hex.optional()
          .describe('Sets buttons.backgroundColor + accent colors (links, scale, checkbox/radio).'),
        background_color: Hex.optional(),
        font_family: z.string().max(100).optional(),
        button_radius: z.number().min(0).max(64).optional(),
        layout: z.enum(['single', 'multi-step', 'conversational', 'seamless']).optional(),
        theme_id: z.union([z.string(), z.number()]).optional()
          .describe('Apply a saved theme by id. Use list_themes to see available themes.'),

        // Full nested theme override
        theme_overrides: z.object({
          heading_text: z.object({
            color: Hex.optional(),
            font_family: z.string().max(100).optional(),
            font_size: z.number().int().min(8).max(120).optional(),
            font_weight: z.number().int().optional(),
          }).optional(),
          body_text: z.object({
            color: Hex.optional(),
            font_family: z.string().max(100).optional(),
            font_size: z.number().int().min(8).max(48).optional(),
            font_weight: z.number().int().optional(),
          }).optional(),
          question_text: z.object({
            color: Hex.optional(),
            font_weight: z.number().int().optional(),
          }).optional(),
          buttons: z.object({
            background_color: Hex.optional(),
            text_color: Hex.optional(),
            border_color: Hex.optional(),
            border_radius: z.number().int().min(0).max(64).optional(),
            shape: z.enum(['rounded', 'pill', 'square']).optional(),
            size: z.enum(['sm', 'md', 'lg']).optional(),
          }).optional(),
          text_field: z.object({
            background_color: Hex.optional(),
            text_color: Hex.optional(),
            border_color: Hex.optional(),
            border_radius: z.number().int().min(0).max(64).optional(),
          }).optional(),
          form_layout: z.object({
            width: z.string().max(20).optional().describe('CSS width like "700px" or "100%".'),
            padding: z.number().int().min(0).max(120).optional(),
            background_color: Hex.optional(),
            border_color: Hex.optional(),
            border_radius: z.number().int().min(0).max(64).optional(),
            box_shadow: z.boolean().optional(),
          }).optional(),
          branding: z.object({
            logo_url: z.string().url().nullable().optional(),
            logo_link: z.string().url().nullable().optional(),
            background_photo: z.string().url().nullable().optional(),
          }).optional(),
        }).optional(),
      },
    },
    async ({ form_id, theme_overrides, ...rest }) => {
      const body: Record<string, unknown> = { ...rest };
      if (theme_overrides) {
        // Map snake_case nested groups onto Uplup's theme structure (camelCase)
        const theme: Record<string, Record<string, unknown>> = {};
        if (theme_overrides.heading_text) {
          theme.headingText = stripUndefined({
            headingColor: theme_overrides.heading_text.color,
            headingFontFamily: theme_overrides.heading_text.font_family,
            headingFontSize: theme_overrides.heading_text.font_size,
            headingFontWeight: theme_overrides.heading_text.font_weight,
          });
        }
        if (theme_overrides.body_text) {
          theme.bodyText = stripUndefined({
            bodyTextColor: theme_overrides.body_text.color,
            bodyFontFamily: theme_overrides.body_text.font_family,
            bodyFontSize: theme_overrides.body_text.font_size,
            bodyFontWeight: theme_overrides.body_text.font_weight,
          });
        }
        if (theme_overrides.question_text) {
          theme.questionText = stripUndefined({
            questionColor: theme_overrides.question_text.color,
            questionFontWeight: theme_overrides.question_text.font_weight,
          });
        }
        if (theme_overrides.buttons) {
          theme.buttons = stripUndefined({
            buttonsBackgroundColor: theme_overrides.buttons.background_color,
            buttonsTextColor: theme_overrides.buttons.text_color,
            buttonsBorderColor: theme_overrides.buttons.border_color,
            buttonsBorderRadius: theme_overrides.buttons.border_radius,
            buttonsShape: theme_overrides.buttons.shape,
            buttonsSize: theme_overrides.buttons.size,
          });
        }
        if (theme_overrides.text_field) {
          theme.textField = stripUndefined({
            textFieldBackgroundColor: theme_overrides.text_field.background_color,
            textFieldTextColor: theme_overrides.text_field.text_color,
            textFieldBorderColor: theme_overrides.text_field.border_color,
            textFieldBorderRadius: theme_overrides.text_field.border_radius,
          });
        }
        if (theme_overrides.form_layout) {
          theme.formLayout = stripUndefined({
            formWidth: theme_overrides.form_layout.width,
            formPadding: theme_overrides.form_layout.padding,
            formBackgroundColor: theme_overrides.form_layout.background_color,
            formBorderColor: theme_overrides.form_layout.border_color,
            formBorderRadius: theme_overrides.form_layout.border_radius,
            formBoxShadowEnabled: theme_overrides.form_layout.box_shadow,
          });
        }
        if (theme_overrides.branding) {
          theme.branding = stripUndefined({
            logo: theme_overrides.branding.logo_url,
            logoLink: theme_overrides.branding.logo_link,
            backgroundPhoto: theme_overrides.branding.background_photo,
          });
        }
        body.theme = theme;
      }
      return runTool('update_form_design', '/api/v1/forms/{id}/design', () =>
        api.patch(`/api/v1/forms/${encodeURIComponent(form_id)}/design`, body),
      );
    },
  );

  server.registerTool(
    'apply_theme',
    {
      title: 'Apply a saved theme to a form',
      description: 'Apply a preset or custom theme to a form by its theme id. Use list_themes to discover available themes.',
      inputSchema: {
        form_id: z.string().min(1),
        theme_id: z.union([z.string(), z.number()]),
      },
      annotations: { idempotentHint: true },
    },
    async ({ form_id, theme_id }) =>
      runTool('apply_theme', '/api/v1/forms/{id}/design/theme', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/design/theme`, { theme_id }),
      ),
  );

  server.registerTool(
    'list_themes',
    {
      title: 'List themes',
      description: 'Available preset and custom themes that can be applied to a form via apply_theme or update_form_design.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => runTool('list_themes', '/api/v1/themes', () => api.get('/api/v1/themes')),
  );
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}
