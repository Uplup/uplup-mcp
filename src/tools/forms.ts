import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

const PresentationMode = z.enum(['multi-page', 'card-form', 'conversational', 'one-page']);
const SortOrder = z.enum(['created_desc', 'created_asc', 'title']);
const JsonObject = z.record(z.unknown());

const SecurityObject = z.object({
  allow_vpn: z.boolean().optional(),
  entries_per_user: z.number().int().min(0).optional(),
  entries_allowed: z.number().int().min(0).optional(),
  countries_list: z.array(z.string().length(2)).optional()
    .describe('ISO 3166-1 alpha-2 country codes.'),
  countries_include_or_exclude: z.enum(['allow_all', 'allow_only', 'block']).optional(),
});

/**
 * A whole v3 form document (the shape get_form returns under `document`).
 * Upstream replaces the stored document with it, so it must carry `pages`.
 */
const DocumentObject = z
  .object({ pages: z.array(JsonObject).describe('Page objects in display order.') })
  .passthrough();

/**
 * Map the friendly security inputs onto `document.settings.security`, which
 * upstream reads from the `security_preferences` key. Mirrors the shape the
 * public renderer reads (uplup-frontend types/formInit.ts security_preferences):
 * allowVPN is 0/1, the rest are passed through.
 */
function toSecurityPreferences(security: z.infer<typeof SecurityObject>): Record<string, unknown> {
  return stripUndefined({
    allowVPN: security.allow_vpn === undefined ? undefined : security.allow_vpn ? 1 : 0,
    entryPerUser: security.entries_per_user,
    entriesAllowed: security.entries_allowed,
    countriesList: security.countries_list,
    countriesIncludeOrExclude: security.countries_include_or_exclude,
  });
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

interface CreateFormResponse {
  data?: { form_id?: string; title?: string; content_type?: string };
  [k: string]: unknown;
}

export function registerFormsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_forms',
    {
      title: 'List forms',
      description:
        "Returns the user's forms and quizzes (form_id, title, content_type, custom_url, created_at). Filter with content_type, sort with sort (created_desc is the default). Pagination via limit (default 20, max 100) and offset.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        content_type: z.enum(['form', 'quiz', 'all']).optional()
          .describe('Filter to forms, quizzes, or both (default).'),
        sort: SortOrder.optional().describe('created_desc (default), created_asc or title.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ limit, offset, content_type, sort }) =>
      runTool('list_forms', '/api/v1/forms', () =>
        api.get(
          `/api/v1/forms${qs({
            limit: limit ?? 20,
            offset: offset ?? 0,
            type: content_type === 'all' ? undefined : content_type,
            sort,
          })}`,
        ),
      ),
  );

  server.registerTool(
    'get_form',
    {
      title: 'Get form',
      description:
        'Fetch one form by id, including its document (pages, fields, theme, settings, quiz config). Use after list_forms to inspect a specific form.',
      inputSchema: {
        form_id: z.string().min(1).describe('The form id from list_forms.'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id }) =>
      runTool('get_form', '/api/v1/forms/{id}', () => api.get(`/api/v1/forms/${encodeURIComponent(form_id)}`)),
  );

  server.registerTool(
    'create_form',
    {
      title: 'Create form',
      description:
        'Create a new form or quiz. Provide a title and optionally description, content_type ("form" or "quiz"), presentation_mode, custom_url, language, a security policy, and initial form_pages / styling / presentation_settings / quiz_settings. To start from a complete v3 document instead, pass `document`: the form is created first and the document is then written over it. Publishing and scheduling are handled by publish_form. Returns the new form_id.',
      inputSchema: {
        title: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        content_type: z.enum(['form', 'quiz']).optional(),
        presentation_mode: PresentationMode.optional()
          .describe(
            'Layout: "card-form" (Conversational, one question per screen; the default and recommended for engagement), "multi-page" (classic top-to-bottom with page breaks), "one-page" (everything on one scrolling page). "conversational" is an alias for "card-form".',
          ),
        custom_url: z.string().max(255).optional()
          .describe('URL slug under uplup.com/q/. Letters, numbers, hyphens.'),
        language: z.string().length(2).optional()
          .describe('ISO 639-1 language code (e.g. "en", "es").'),
        security: SecurityObject.optional()
          .describe('Anti-abuse policy: VPN blocking, entries per user, total entries, country allow/block list.'),
        form_pages: z.array(JsonObject).optional()
          .describe('Initial pages array (document.pages shape). Prefer create_field for simple forms.'),
        styling: JsonObject.optional()
          .describe('Initial theme object (the grouped shape get_form_design returns under styling).'),
        presentation_settings: JsonObject.optional(),
        quiz_settings: JsonObject.optional()
          .describe('Initial quiz settings (camelCase keys, see update_quiz_settings).'),
        document: DocumentObject.optional()
          .describe('A complete v3 document (must contain a pages array). Applied with a second request after creation.'),
      },
    },
    async ({ title, description, content_type, presentation_mode, custom_url, language, security, form_pages, styling, presentation_settings, quiz_settings, document }) =>
      runTool('create_form', '/api/v1/forms', async () => {
        const created = await api.post<CreateFormResponse>(
          '/api/v1/forms',
          stripUndefined({
            title,
            description,
            content_type: content_type ?? 'form',
            // Default to conversational/card-form for engagement. Stored as
            // `card-form` since Uplup uses that name internally for the
            // one-question-per-screen mode (UI labels it "Conversational").
            presentation_mode: presentation_mode ?? 'card-form',
            custom_url,
            language,
            form_pages,
            styling,
            presentation_settings,
            quiz_settings,
            security_preferences: security ? toSecurityPreferences(security) : undefined,
          }),
        );
        if (!document) return created;
        const formId = created?.data?.form_id;
        if (!formId) {
          throw new Error('Form was created but the response carried no form_id, so the document was not applied.');
        }
        await api.patch(`/api/v1/forms/${encodeURIComponent(formId)}`, { document });
        return { ...created, document_applied: true };
      }),
  );

  server.registerTool(
    'update_form',
    {
      title: 'Update form',
      description:
        'Update form metadata or content. Only provided keys change. form_pages, styling, quiz_settings and presentation_settings each replace that whole section of the document, so prefer the pages, design and quiz tools for partial edits. Pass `document` to replace the entire v3 document (must contain a pages array).',
      inputSchema: {
        form_id: z.string().min(1),
        title: z.string().min(1).max(255).optional(),
        description: z.string().max(2000).optional(),
        content_type: z.enum(['form', 'quiz']).optional(),
        presentation_mode: PresentationMode.optional(),
        custom_url: z.string().max(255).optional(),
        language: z.string().length(2).optional(),
        security: SecurityObject.optional(),
        form_pages: z.array(JsonObject).optional(),
        styling: JsonObject.optional(),
        presentation_settings: JsonObject.optional(),
        quiz_settings: JsonObject.optional(),
        document: DocumentObject.optional(),
      },
    },
    async ({ form_id, security, ...rest }) => {
      const body = stripUndefined({
        ...rest,
        security_preferences: security ? toSecurityPreferences(security) : undefined,
      });
      return runTool('update_form', '/api/v1/forms/{id}', () =>
        api.patch(`/api/v1/forms/${encodeURIComponent(form_id)}`, body),
      );
    },
  );

  server.registerTool(
    'delete_form',
    {
      title: 'Delete form',
      description: 'Permanently delete a form and all its submissions. This is irreversible.',
      inputSchema: { form_id: z.string().min(1) },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ form_id }) =>
      runTool('delete_form', '/api/v1/forms/{id}', () => api.delete(`/api/v1/forms/${encodeURIComponent(form_id)}`)),
  );

  server.registerTool(
    'clone_form',
    {
      title: 'Clone form',
      description: 'Duplicate a form. Pass title to name the copy; otherwise it is "<original> (Copy)". Returns the new form id.',
      inputSchema: {
        form_id: z.string().min(1),
        title: z.string().min(1).max(255).optional().describe('Optional title for the clone.'),
      },
    },
    async ({ form_id, title }) =>
      runTool('clone_form', '/api/v1/forms/{id}/clone', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/clone`, title !== undefined ? { title } : {}),
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
      annotations: { idempotentHint: true },
    },
    async ({ form_id, published }) =>
      runTool('publish_form', '/api/v1/forms/{id}/publish', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/publish`, { published }),
      ),
  );
}
