import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

const PageType = z.enum(['cover', 'content', 'leadCapture', 'ending']);

interface FormDocument {
  pages?: PageObject[];
  [k: string]: unknown;
}
interface PageObject {
  id: string;
  type?: string;
  title?: string;
  fields?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}
interface FormResponse {
  data?: { document?: FormDocument };
}

function pageId(): string {
  return `page-${randomUUID().slice(0, 12)}`;
}

async function readDocument(api: UplupApiClient, formId: string): Promise<FormDocument> {
  const res = await api.get<FormResponse>(`/api/v1/forms/${encodeURIComponent(formId)}`);
  return res?.data?.document ?? {};
}

async function writeDocument(api: UplupApiClient, formId: string, doc: FormDocument): Promise<unknown> {
  return api.patch(`/api/v1/forms/${encodeURIComponent(formId)}`, { document: doc });
}

export function registerPagesTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_pages',
    {
      title: 'List form pages',
      description: 'Returns the pages of a form in display order, with id, type (cover/content/leadCapture/ending), title, and field count.',
      inputSchema: { form_id: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id }) =>
      runTool('list_pages', '/api/v1/forms/{id}', async () => {
        const doc = await readDocument(api, form_id);
        const pages = doc.pages ?? [];
        return {
          form_id,
          total_pages: pages.length,
          pages: pages.map((p) => ({
            id: p.id,
            type: p.type ?? 'content',
            title: p.title ?? '',
            field_count: p.fields?.length ?? 0,
          })),
        };
      }),
  );

  server.registerTool(
    'add_page',
    {
      title: 'Add a page to a form',
      description:
        'Insert a new page into a form. Defaults to a content page appended before the ending page (or last). Pass `position` (0-indexed) to insert at a specific spot, or `before_page_id` / `after_page_id` to insert relative to an existing page.',
      inputSchema: {
        form_id: z.string().min(1),
        title: z.string().min(1).max(255),
        type: PageType.optional().describe('Default "content".'),
        position: z.number().int().min(0).optional(),
        before_page_id: z.string().optional(),
        after_page_id: z.string().optional(),
      },
    },
    async ({ form_id, title, type, position, before_page_id, after_page_id }) =>
      runTool('add_page', '/api/v1/forms/{id}', async () => {
        const doc = await readDocument(api, form_id);
        const pages = doc.pages ?? [];
        const newPage: PageObject = {
          id: pageId(),
          type: type ?? 'content',
          title,
          fields: [],
        };

        let insertAt: number;
        if (before_page_id) {
          const idx = pages.findIndex((p) => p.id === before_page_id);
          insertAt = idx === -1 ? pages.length : idx;
        } else if (after_page_id) {
          const idx = pages.findIndex((p) => p.id === after_page_id);
          insertAt = idx === -1 ? pages.length : idx + 1;
        } else if (position !== undefined) {
          insertAt = Math.min(position, pages.length);
        } else {
          // default: insert before ending page if present, else at end
          const endingIdx = pages.findIndex((p) => p.type === 'ending');
          insertAt = endingIdx === -1 ? pages.length : endingIdx;
        }

        pages.splice(insertAt, 0, newPage);
        doc.pages = pages;
        await writeDocument(api, form_id, doc);
        return { form_id, page_id: newPage.id, inserted_at_index: insertAt, total_pages: pages.length };
      }),
  );

  server.registerTool(
    'update_page',
    {
      title: 'Update a page',
      description: 'Patch a page\'s title or type. Only provided fields change.',
      inputSchema: {
        form_id: z.string().min(1),
        page_id: z.string().min(1),
        title: z.string().min(1).max(255).optional(),
        type: PageType.optional(),
      },
    },
    async ({ form_id, page_id, title, type }) =>
      runTool('update_page', '/api/v1/forms/{id}', async () => {
        const doc = await readDocument(api, form_id);
        const pages = doc.pages ?? [];
        const page = pages.find((p) => p.id === page_id);
        if (!page) throw new Error(`Page ${page_id} not found in form ${form_id}`);
        if (title !== undefined) page.title = title;
        if (type !== undefined) page.type = type;
        await writeDocument(api, form_id, doc);
        return { form_id, page_id, updated: { title, type } };
      }),
  );

  server.registerTool(
    'delete_page',
    {
      title: 'Delete a page',
      description: 'Remove a page from a form along with all its fields. Cannot delete cover or ending pages without replacement.',
      inputSchema: {
        form_id: z.string().min(1),
        page_id: z.string().min(1),
      },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ form_id, page_id }) =>
      runTool('delete_page', '/api/v1/forms/{id}', async () => {
        const doc = await readDocument(api, form_id);
        const pages = doc.pages ?? [];
        const idx = pages.findIndex((p) => p.id === page_id);
        if (idx === -1) throw new Error(`Page ${page_id} not found in form ${form_id}`);
        pages.splice(idx, 1);
        doc.pages = pages;
        await writeDocument(api, form_id, doc);
        return { form_id, page_id, deleted: true, total_pages: pages.length };
      }),
  );

  server.registerTool(
    'reorder_pages',
    {
      title: 'Reorder pages',
      description: 'Reorder pages by providing page ids in the desired order. Any pages omitted from the list are appended at the end in their original relative order.',
      inputSchema: {
        form_id: z.string().min(1),
        page_ids: z.array(z.string().min(1)).min(1),
      },
      annotations: { idempotentHint: true },
    },
    async ({ form_id, page_ids }) =>
      runTool('reorder_pages', '/api/v1/forms/{id}', async () => {
        const doc = await readDocument(api, form_id);
        const pages = doc.pages ?? [];
        const byId = new Map(pages.map((p) => [p.id, p] as const));
        const reordered: PageObject[] = [];
        for (const id of page_ids) {
          const p = byId.get(id);
          if (p) {
            reordered.push(p);
            byId.delete(id);
          }
        }
        // append leftovers preserving original order
        for (const p of pages) if (byId.has(p.id)) reordered.push(p);
        doc.pages = reordered;
        await writeDocument(api, form_id, doc);
        return { form_id, total_pages: reordered.length, order: reordered.map((p) => p.id) };
      }),
  );

  server.registerTool(
    'get_logic_summary',
    {
      title: 'Summarise conditional logic',
      description:
        'Walks the form document and returns every field that has conditional show/hide/require logic configured, plus any page-level routing rules.',
      inputSchema: { form_id: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ form_id }) =>
      runTool('get_logic_summary', '/api/v1/forms/{id}', async () => {
        const doc = await readDocument(api, form_id);
        const pages = doc.pages ?? [];
        const fieldRules: Array<{
          page_id: string;
          field_id: string;
          field_label?: string;
          enabled: boolean;
          logic: string;
          condition_count: number;
          conditions?: unknown;
        }> = [];
        for (const page of pages) {
          for (const f of page.fields ?? []) {
            const cl = f.conditionalLogic as
              | { enabled?: boolean; logic?: string; conditions?: unknown[] }
              | undefined;
            if (cl?.enabled) {
              fieldRules.push({
                page_id: page.id,
                field_id: String(f.id),
                field_label: typeof f.label === 'string' ? f.label : undefined,
                enabled: true,
                logic: cl.logic ?? 'all',
                condition_count: Array.isArray(cl.conditions) ? cl.conditions.length : 0,
                conditions: cl.conditions,
              });
            }
          }
        }
        return {
          form_id,
          total_fields_with_logic: fieldRules.length,
          field_rules: fieldRules,
        };
      }),
  );
}
