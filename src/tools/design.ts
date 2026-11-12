import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex like #1A2B3C');
const FontWeight = z.union([z.number().int().min(100).max(900), z.string().max(20)]);
const ThemeId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .describe('Numeric theme id from list_themes.');

type Styling = Record<string, unknown>;

interface DesignResponse {
  data?: {
    styling?: Styling | null;
    background_photo?: string | null;
    logo?: string | null;
    logo_custom_link?: string | null;
    presentation_settings?: Record<string, unknown> | null;
  };
}

/**
 * Friendly snake_case groups, mapped below onto the grouped camelCase theme
 * the builder and the public renderer read (uplup-frontend types/formInit.ts
 * FormInitStyling): headingText.headingColor, buttons.buttonsBackgroundColor,
 * formLayout.formBackgroundColor and so on.
 */
const ThemeOverrides = z.object({
  heading_text: z.object({
    color: Hex.optional(),
    font_family: z.string().max(100).optional(),
    font_size: z.number().int().min(8).max(120).optional(),
    font_weight: FontWeight.optional(),
  }).optional(),
  body_text: z.object({
    color: Hex.optional(),
    font_family: z.string().max(100).optional(),
    font_size: z.number().int().min(8).max(48).optional(),
    font_weight: FontWeight.optional(),
  }).optional(),
  question_text: z.object({
    font_weight: FontWeight.optional(),
  }).optional(),
  buttons: z.object({
    background_color: Hex.optional(),
    text_color: Hex.optional(),
    border_color: Hex.optional(),
    border_width: z.number().int().min(0).max(10).optional(),
    border_radius: z.number().int().min(0).max(64).optional(),
    font_size: z.number().int().min(8).max(48).optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
  }).optional(),
  text_field: z.object({
    background_color: Hex.optional(),
    text_color: Hex.optional(),
    border_color: Hex.optional(),
    border_width: z.number().int().min(0).max(10).optional(),
    border_radius: z.number().int().min(0).max(64).optional(),
  }).optional(),
  checkbox_radio: z.object({
    accent_color: Hex.optional().describe('Accent for checkboxes, radios, scales and sliders.'),
    check_color: Hex.optional(),
  }).optional(),
  links: z.object({
    color: Hex.optional(),
    text_decoration: z.enum(['none', 'underline']).optional(),
  }).optional(),
  form_layout: z.object({
    width: z.string().max(20).optional().describe('CSS width like "700px" or "100%".'),
    padding: z.number().int().min(0).max(120).optional(),
    background_color: Hex.optional().describe('Background of the form card itself.'),
    border_color: Hex.optional(),
    border_width: z.number().int().min(0).max(10).optional(),
    border_radius: z.number().int().min(0).max(64).optional(),
    box_shadow: z.boolean().optional(),
  }).optional(),
  landing_page: z.object({
    background_color: Hex.optional().describe('Page background behind the form.'),
    background_photo: z.string().url().nullable().optional(),
    hide_logo_in_form: z.boolean().optional(),
  }).optional(),
  branding: z.object({
    logo_url: z.string().url().nullable().optional(),
    logo_link: z.string().url().nullable().optional(),
    background_photo: z.string().url().nullable().optional(),
  }).optional(),
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/** Deep-merge `patch` into `target`. Objects recurse; everything else replaces. */
function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isPlainObject(v)) {
      if (!isPlainObject(target[k])) target[k] = {};
      deepMerge(target[k] as Record<string, unknown>, v);
    } else {
      target[k] = v;
    }
  }
}

/** Set a nested group key only when the value is defined. */
function setGroup(patch: Styling, group: string, values: Record<string, unknown>): void {
  const cleaned = stripUndefined(values);
  if (Object.keys(cleaned).length === 0) return;
  const existing = isPlainObject(patch[group]) ? (patch[group] as Record<string, unknown>) : {};
  patch[group] = { ...existing, ...cleaned };
}

function buildStylingPatch(args: {
  primary_color?: string;
  background_color?: string;
  font_family?: string;
  button_radius?: number;
  theme_overrides?: z.infer<typeof ThemeOverrides>;
  styling?: Styling;
}): Styling {
  const patch: Styling = {};

  // Friendly shortcuts land on the grouped canonical keys the renderer reads.
  setGroup(patch, 'buttons', {
    buttonsBackgroundColor: args.primary_color,
    buttonsBorderRadius: args.button_radius,
  });
  setGroup(patch, 'checkboxRadio', { checkboxRadioAccentColor: args.primary_color });
  setGroup(patch, 'landingPage', { landingPageBackgroundColor: args.background_color });
  setGroup(patch, 'headingText', { headingFontFamily: args.font_family });
  setGroup(patch, 'bodyText', { bodyFontFamily: args.font_family });

  const t = args.theme_overrides;
  if (t) {
    if (t.heading_text) {
      setGroup(patch, 'headingText', {
        headingColor: t.heading_text.color,
        headingFontFamily: t.heading_text.font_family,
        headingFontSize: t.heading_text.font_size,
        headingFontWeight: t.heading_text.font_weight,
      });
    }
    if (t.body_text) {
      setGroup(patch, 'bodyText', {
        bodyTextColor: t.body_text.color,
        bodyFontFamily: t.body_text.font_family,
        bodyFontSize: t.body_text.font_size,
        bodyFontWeight: t.body_text.font_weight,
      });
    }
    if (t.question_text) {
      setGroup(patch, 'questionText', { questionFontWeight: t.question_text.font_weight });
    }
    if (t.buttons) {
      setGroup(patch, 'buttons', {
        buttonsBackgroundColor: t.buttons.background_color,
        buttonsTextColor: t.buttons.text_color,
        buttonsBorderColor: t.buttons.border_color,
        buttonsBorderWidth: t.buttons.border_width,
        buttonsBorderRadius: t.buttons.border_radius,
        buttonsFontSize: t.buttons.font_size,
        buttonsAlignment: t.buttons.alignment,
      });
    }
    if (t.text_field) {
      setGroup(patch, 'textField', {
        textFieldBackgroundColor: t.text_field.background_color,
        textFieldTextColor: t.text_field.text_color,
        textFieldBorderColor: t.text_field.border_color,
        textFieldBorderWidth: t.text_field.border_width,
        textFieldBorderRadius: t.text_field.border_radius,
      });
    }
    if (t.checkbox_radio) {
      setGroup(patch, 'checkboxRadio', {
        checkboxRadioAccentColor: t.checkbox_radio.accent_color,
        checkboxRadioCheckColor: t.checkbox_radio.check_color,
      });
    }
    if (t.links) {
      setGroup(patch, 'links', {
        linkTextColor: t.links.color,
        linkTextDecoration: t.links.text_decoration,
      });
    }
    if (t.form_layout) {
      setGroup(patch, 'formLayout', {
        formWidth: t.form_layout.width,
        formPadding: t.form_layout.padding,
        formBackgroundColor: t.form_layout.background_color,
        formBorderColor: t.form_layout.border_color,
        formBorderWidth: t.form_layout.border_width,
        formBorderRadius: t.form_layout.border_radius,
        formBoxShadowEnabled: t.form_layout.box_shadow,
      });
    }
    if (t.landing_page) {
      setGroup(patch, 'landingPage', {
        landingPageBackgroundColor: t.landing_page.background_color,
        landingPageBackgroundPhoto: t.landing_page.background_photo,
        hideLogoInForm: t.landing_page.hide_logo_in_form,
      });
    }
    if (t.branding) {
      setGroup(patch, 'branding', {
        logo: t.branding.logo_url,
        logoLink: t.branding.logo_link,
        backgroundPhoto: t.branding.background_photo,
      });
    }
  }

  // Raw canonical styling wins over the friendly inputs.
  if (args.styling) deepMerge(patch, args.styling);
  return patch;
}

export function registerDesignTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_form_design',
    {
      title: 'Get form design',
      description:
        'Returns the form theme (styling: grouped camelCase keys such as headingText.headingColor, buttons.buttonsBackgroundColor, formLayout.formBackgroundColor, landingPage.landingPageBackgroundColor), plus background_photo, logo, logo_custom_link and presentation_settings.',
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
        'Patch the form theme. Quick shortcuts: primary_color (buttons + checkbox/radio accent), background_color (page behind the form), font_family (headings + body), button_radius. For precise control use theme_overrides (snake_case groups mapped onto the canonical theme) or pass `styling` in the exact grouped shape get_form_design returns. The current styling is read first and the changes are merged into it, so untouched keys are kept. background_photo, logo and logo_custom_link set the branding images; presentation_settings replaces document.settings.presentation. To apply a saved theme use apply_theme; to change layout mode use update_form.presentation_mode.',
      inputSchema: {
        form_id: z.string().min(1),

        primary_color: Hex.optional()
          .describe('Sets buttons.buttonsBackgroundColor and checkboxRadio.checkboxRadioAccentColor.'),
        background_color: Hex.optional()
          .describe('Sets landingPage.landingPageBackgroundColor (the page behind the form). For the form card use theme_overrides.form_layout.background_color.'),
        font_family: z.string().max(100).optional()
          .describe('Sets headingText.headingFontFamily and bodyText.bodyFontFamily.'),
        button_radius: z.number().int().min(0).max(64).optional()
          .describe('Sets buttons.buttonsBorderRadius (px).'),

        theme_overrides: ThemeOverrides.optional(),
        styling: z.record(z.unknown()).optional()
          .describe('Raw grouped styling object (same shape as get_form_design.styling). Deep-merged over the current theme; overrides the shortcuts.'),

        background_photo: z.string().url().nullable().optional(),
        logo: z.string().url().nullable().optional(),
        logo_custom_link: z.string().url().nullable().optional(),
        presentation_settings: z.record(z.unknown()).optional(),
      },
    },
    async ({ form_id, background_photo, logo, logo_custom_link, presentation_settings, ...styleArgs }) =>
      runTool('update_form_design', '/api/v1/forms/{id}/design', async () => {
        const path = `/api/v1/forms/${encodeURIComponent(form_id)}/design`;
        const patch = buildStylingPatch(styleArgs);
        const hasStyling = Object.keys(patch).length > 0;
        const hasBranding = background_photo !== undefined || logo !== undefined || logo_custom_link !== undefined;
        if (!hasStyling && !hasBranding && presentation_settings === undefined) {
          throw new Error('Nothing to update: pass at least one design input.');
        }

        // Upstream replaces document.theme with `styling`, so always send the
        // full merged theme rather than just the keys that changed.
        const current = await api.get<DesignResponse>(path);
        const styling: Styling = isPlainObject(current?.data?.styling) ? structuredClone(current.data!.styling as Styling) : {};
        deepMerge(styling, patch);

        // Branding keys are mirrored into styling.branding as well, because
        // upstream writes them there and skips them if the group is missing.
        if (!isPlainObject(styling.branding)) styling.branding = { logo: null, logoLink: null, backgroundPhoto: null };
        const branding = styling.branding as Record<string, unknown>;
        if (background_photo !== undefined) branding.backgroundPhoto = background_photo;
        if (logo !== undefined) branding.logo = logo;
        if (logo_custom_link !== undefined) branding.logoLink = logo_custom_link;

        const body = stripUndefined({
          styling,
          background_photo: background_photo ?? undefined,
          logo: logo ?? undefined,
          logo_custom_link: logo_custom_link ?? undefined,
          presentation_settings,
        });
        return api.patch(path, body);
      }),
  );

  server.registerTool(
    'apply_theme',
    {
      title: 'Apply a saved theme to a form',
      description: 'Replace the form theme with a preset or custom theme by its numeric id. Use list_themes to discover available themes.',
      inputSchema: {
        form_id: z.string().min(1),
        theme_id: ThemeId,
      },
      annotations: { idempotentHint: true },
    },
    async ({ form_id, theme_id }) =>
      runTool('apply_theme', '/api/v1/forms/{id}/design/theme', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/design/theme`, { theme_id: Number(theme_id) }),
      ),
  );

  server.registerTool(
    'list_themes',
    {
      title: 'List themes',
      description: 'Available preset and custom themes (id, name, type, styling) that can be applied to a form via apply_theme.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async () => runTool('list_themes', '/api/v1/themes', () => api.get('/api/v1/themes')),
  );

  server.registerTool(
    'get_theme',
    {
      title: 'Get theme',
      description: 'Fetch one preset or custom theme by numeric id, including its full styling object.',
      inputSchema: { theme_id: ThemeId },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ theme_id }) =>
      runTool('get_theme', '/api/v1/themes/{id}', () => api.get(`/api/v1/themes/${Number(theme_id)}`)),
  );
}
