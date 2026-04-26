import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

const PresentationMode = z.enum(['multi-page', 'card-form', 'conversational', 'one-page']);
const SortOrder = z.enum(['newest', 'oldest', 'title_asc', 'title_desc', 'most_submissions']);

const SchedulingObject = z.object({
  enabled: z.boolean().optional(),
  start_date: z.string().optional().describe('ISO date or "YYYY-MM-DD HH:mm:ss".'),
  end_date: z.string().optional(),
  time_zone: z.string().optional().describe('e.g. "America/New_York".'),
  date_format: z.string().optional(),
});

const SecurityObject = z.object({
  allow_vpn: z.boolean().optional(),
  entries_per_user: z.number().int().min(0).optional(),
  entries_allowed: z.number().int().min(0).optional(),
  countries_list: z.array(z.string().length(2)).optional()
    .describe('ISO 3166-1 alpha-2 country codes.'),
  countries_include_or_exclude: z.enum(['allow_all', 'allow_only', 'block']).optional(),
});

export function registerFormsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_forms',
    {
      title: 'List forms',
      description:
        "Returns the user's forms and quizzes. Supports filtering by content_type and sorting. Pagination via limit (default 20, max 100) and offset.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        content_type: z.enum(['form', 'quiz', 'all']).optional()
          .describe('Filter to forms, quizzes, or both (default).'),
        sort: SortOrder.optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ limit, offset, content_type, sort }) =>
      runTool('list_forms', '/api/v1/forms', () =>
        api.get(
          `/api/v1/forms${qs({
            limit: limit ?? 20,
            offset: offset ?? 0,
            content_type: content_type === 'all' ? undefined : content_type,
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
        'Fetch one form by id, including its document structure (pages, fields, settings). Use after list_forms to inspect a specific form.',
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
        'Create a new form or quiz. Provide title and optionally description, content_type ("form" or "quiz"), presentation mode, custom URL, language, scheduling window, security policy, and an initial document with pages/fields. Returns the created form id.',
      inputSchema: {
        title: z.string().min(1).max(255),
        description: z.string().max(2000).optional(),
        content_type: z.enum(['form', 'quiz']).optional(),
        presentation_mode: PresentationMode.optional()
          .describe(
            'Layout: "card-form" (Conversational, one question per screen — DEFAULT and recommended for engagement), "multi-page" (classic top-to-bottom with page breaks), "one-page" (everything on one scrolling page). "conversational" is an alias for "card-form".',
          ),
        custom_url: z.string().max(255).optional()
          .describe('URL slug under uplup.com/q/. Letters, numbers, hyphens.'),
        language: z.string().length(2).optional()
          .describe('ISO 639-1 language code (e.g. "en", "es").'),
        scheduling: SchedulingObject.optional(),
        security: SecurityObject.optional(),
        document: z.record(z.unknown()).optional()
          .describe('Optional initial document JSON (pages, fields, etc.).'),
      },
    },
    async ({ title, description, content_type, presentation_mode, custom_url, language, scheduling, security, document }) =>
      runTool('create_form', '/api/v1/forms', () =>
        api.post('/api/v1/forms', {
          title,
          description,
          content_type: content_type ?? 'form',
          // Default to conversational/card-form for engagement. Stored as
          // `card-form` since Uplup uses that name internally for the
          // one-question-per-screen mode (UI labels it "Conversational").
          presentation_mode: presentation_mode ?? 'card-form',
          custom_url,
          language,
          scheduling: scheduling
            ? {
                enabled: scheduling.enabled,
                startDate: scheduling.start_date,
                endDate: scheduling.end_date,
                timeZone: scheduling.time_zone,
                dateFormat: scheduling.date_format,
              }
            : undefined,
          security: security
            ? {
                allowVPN: security.allow_vpn === undefined ? undefined : (security.allow_vpn ? 1 : 0),
                entryPerUser: security.entries_per_user,
                entriesAllowed: security.entries_allowed,
                countriesList: security.countries_list,
                countriesIncludeOrExclude: security.countries_include_or_exclude,
              }
            : undefined,
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
        presentation_mode: PresentationMode.optional(),
        custom_url: z.string().max(255).optional(),
        language: z.string().length(2).optional(),
        scheduling: SchedulingObject.optional(),
        security: SecurityObject.optional(),
        document: z.record(z.unknown()).optional(),
      },
    },
    async ({ form_id, scheduling, security, ...rest }) => {
      const body: Record<string, unknown> = { ...rest };
      if (scheduling) {
        body.scheduling = {
          enabled: scheduling.enabled,
          startDate: scheduling.start_date,
          endDate: scheduling.end_date,
          timeZone: scheduling.time_zone,
          dateFormat: scheduling.date_format,
        };
      }
      if (security) {
        body.security = {
          allowVPN: security.allow_vpn === undefined ? undefined : (security.allow_vpn ? 1 : 0),
          entryPerUser: security.entries_per_user,
          entriesAllowed: security.entries_allowed,
          countriesList: security.countries_list,
          countriesIncludeOrExclude: security.countries_include_or_exclude,
        };
      }
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
      annotations: { idempotentHint: true },
    },
    async ({ form_id, published }) =>
      runTool('publish_form', '/api/v1/forms/{id}/publish', () =>
        api.post(`/api/v1/forms/${encodeURIComponent(form_id)}/publish`, { published }),
      ),
  );
}
