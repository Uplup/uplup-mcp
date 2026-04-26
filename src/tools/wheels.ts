import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { UplupApiClient } from '../api/client.js';
import { runTool, qs } from '../util/tool.js';

const READ = { readOnlyHint: true, idempotentHint: true } as const;

const EntryObject = z.object({
  Name: z.string().min(1),
  weight: z.number().optional(),
  color: z.string().optional(),
});

const Entry = z.union([z.string().min(1), EntryObject]);

export function registerWheelsTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'list_wheels',
    {
      title: 'List wheels',
      description: 'Returns the user\'s random name picker wheels.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
      annotations: READ,
    },
    async ({ limit, offset }) =>
      runTool('list_wheels', '/api/v1/wheels', () =>
        api.get(`/api/v1/wheels${qs({ limit: limit ?? 50, offset: offset ?? 0 })}`),
      ),
  );

  server.registerTool(
    'get_wheel',
    {
      title: 'Get wheel',
      description: 'Fetch one wheel by id, including its entries, settings, winners, and display config.',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: READ,
    },
    async ({ wheel_id }) =>
      runTool('get_wheel', '/api/v1/wheels/{id}', () =>
        api.get(`/api/v1/wheels/${encodeURIComponent(wheel_id)}`),
      ),
  );

  server.registerTool(
    'create_wheel',
    {
      title: 'Create wheel',
      description:
        'Create a new random name picker wheel. Supply a name and optionally an initial set of entries (strings or objects with Name/weight/color).',
      inputSchema: {
        wheel_name: z.string().min(1).max(255),
        entries: z.array(Entry).optional()
          .describe('Initial entries. Accepts plain strings or { Name, weight?, color? } objects.'),
      },
    },
    async ({ wheel_name, entries }) =>
      runTool('create_wheel', '/api/v1/wheels', () =>
        api.post('/api/v1/wheels', {
          wheel_name,
          names: entries
            ? entries.map((e) => (typeof e === 'string' ? { Name: e } : e))
            : undefined,
        }),
      ),
  );

  server.registerTool(
    'update_wheel',
    {
      title: 'Update wheel',
      description: 'Patch wheel name, entries, settings, display mode, or visibility.',
      inputSchema: {
        wheel_id: z.string().min(1),
        wheel_name: z.string().min(1).max(255).optional(),
        entries: z.array(Entry).optional(),
        settings: z.record(z.unknown()).optional(),
        display_mode: z.enum(['wheel', 'list', 'roulette', 'slot']).optional(),
        display_settings: z.record(z.unknown()).optional(),
        background_image: z.string().url().nullable().optional(),
        is_public: z.boolean().optional(),
      },
    },
    async ({ wheel_id, entries, ...rest }) =>
      runTool('update_wheel', '/api/v1/wheels/{id}', () =>
        api.patch(`/api/v1/wheels/${encodeURIComponent(wheel_id)}`, {
          ...rest,
          ...(entries
            ? { names: entries.map((e) => (typeof e === 'string' ? { Name: e } : e)) }
            : {}),
        }),
      ),
  );

  server.registerTool(
    'delete_wheel',
    {
      title: 'Delete wheel',
      description: 'Soft-delete a wheel. Use restore_wheel to bring it back.',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ wheel_id }) =>
      runTool('delete_wheel', '/api/v1/wheels/{id}', () =>
        api.delete(`/api/v1/wheels/${encodeURIComponent(wheel_id)}`),
      ),
  );

  server.registerTool(
    'clone_wheel',
    {
      title: 'Clone wheel',
      description: 'Duplicate a wheel including its entries and settings. Returns the new wheel id.',
      inputSchema: { wheel_id: z.string().min(1) },
    },
    async ({ wheel_id }) =>
      runTool('clone_wheel', '/api/v1/wheels/{id}/clone', () =>
        api.post(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/clone`, {}),
      ),
  );

  server.registerTool(
    'restore_wheel',
    {
      title: 'Restore deleted wheel',
      description: 'Undo a wheel deletion (only works on soft-deleted wheels).',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: { idempotentHint: true },
    },
    async ({ wheel_id }) =>
      runTool('restore_wheel', '/api/v1/wheels/{id}/restore', () =>
        api.post(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/restore`, {}),
      ),
  );

  server.registerTool(
    'get_wheel_settings',
    {
      title: 'Get wheel settings',
      description: 'Returns the wheel\'s spin settings, display mode, and display options.',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: READ,
    },
    async ({ wheel_id }) =>
      runTool('get_wheel_settings', '/api/v1/wheels/{id}/settings', () =>
        api.get(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/settings`),
      ),
  );

  server.registerTool(
    'update_wheel_settings',
    {
      title: 'Update wheel settings',
      description: 'Replace the wheel\'s universal settings JSON (spin duration, animation, sounds, remove-on-win, etc.).',
      inputSchema: {
        wheel_id: z.string().min(1),
        settings: z.record(z.unknown()),
      },
    },
    async ({ wheel_id, settings }) =>
      runTool('update_wheel_settings', '/api/v1/wheels/{id}/settings', () =>
        api.put(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/settings`, settings),
      ),
  );

  server.registerTool(
    'update_wheel_appearance',
    {
      title: 'Update wheel appearance',
      description: 'Set the wheel\'s display mode (wheel / list / roulette / slot) and per-mode display settings.',
      inputSchema: {
        wheel_id: z.string().min(1),
        display_mode: z.enum(['wheel', 'list', 'roulette', 'slot']),
        display_settings: z.record(z.unknown()).optional(),
      },
    },
    async ({ wheel_id, display_mode, display_settings }) =>
      runTool('update_wheel_appearance', '/api/v1/wheels/{id}/appearance', () =>
        api.put(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/appearance`, {
          display_mode,
          display_settings: display_settings ?? {},
        }),
      ),
  );

  server.registerTool(
    'get_wheel_entries',
    {
      title: 'Get wheel entries',
      description: 'Returns the entries currently on the wheel.',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: READ,
    },
    async ({ wheel_id }) =>
      runTool('get_wheel_entries', '/api/v1/wheels/{id}/entries', () =>
        api.get(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/entries`),
      ),
  );

  server.registerTool(
    'add_wheel_entries',
    {
      title: 'Add wheel entries',
      description: 'Append new entries to a wheel. Existing entries are preserved.',
      inputSchema: {
        wheel_id: z.string().min(1),
        entries: z.array(Entry).min(1),
      },
    },
    async ({ wheel_id, entries }) =>
      runTool('add_wheel_entries', '/api/v1/wheels/{id}/entries', () =>
        api.post(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/entries`, {
          entries: entries.map((e) => (typeof e === 'string' ? { Name: e } : e)),
        }),
      ),
  );

  server.registerTool(
    'replace_wheel_entries',
    {
      title: 'Replace wheel entries',
      description: 'Overwrite the entire entries list on a wheel. Existing entries are removed.',
      inputSchema: {
        wheel_id: z.string().min(1),
        entries: z.array(Entry).min(1),
      },
    },
    async ({ wheel_id, entries }) =>
      runTool('replace_wheel_entries', '/api/v1/wheels/{id}/entries', () =>
        api.put(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/entries`, {
          entries: entries.map((e) => (typeof e === 'string' ? { Name: e } : e)),
        }),
      ),
  );

  server.registerTool(
    'clear_wheel_entries',
    {
      title: 'Clear wheel entries',
      description: 'Remove every entry from a wheel.',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ wheel_id }) =>
      runTool('clear_wheel_entries', '/api/v1/wheels/{id}/entries', () =>
        api.delete(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/entries`),
      ),
  );

  server.registerTool(
    'spin_wheel',
    {
      title: 'Spin the wheel',
      description: 'Spin the wheel and return a randomly-selected winner from the entries. Increments the wheel\'s spin counter.',
      inputSchema: { wheel_id: z.string().min(1) },
    },
    async ({ wheel_id }) =>
      runTool('spin_wheel', '/api/v1/wheels/{id}/spin', () =>
        api.post(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/spin`, {}),
      ),
  );

  server.registerTool(
    'get_wheel_results',
    {
      title: 'Get wheel spin history',
      description: 'List recent winners drawn from this wheel.',
      inputSchema: {
        wheel_id: z.string().min(1),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: READ,
    },
    async ({ wheel_id, limit }) =>
      runTool('get_wheel_results', '/api/v1/wheels/{id}/results', () =>
        api.get(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/results${qs({ limit: limit ?? 50 })}`),
      ),
  );

  server.registerTool(
    'clear_wheel_results',
    {
      title: 'Clear wheel spin history',
      description: 'Wipe the recorded winners list (does not affect entries).',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: { destructiveHint: true, idempotentHint: true },
    },
    async ({ wheel_id }) =>
      runTool('clear_wheel_results', '/api/v1/wheels/{id}/results', () =>
        api.delete(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/results`),
      ),
  );

  server.registerTool(
    'get_wheel_stats',
    {
      title: 'Wheel stats',
      description: 'Quick metrics: total_spins, total_entries, total_winners.',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: READ,
    },
    async ({ wheel_id }) =>
      runTool('get_wheel_stats', '/api/v1/wheels/{id}/stats', () =>
        api.get(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/stats`),
      ),
  );

  server.registerTool(
    'get_wheel_embed',
    {
      title: 'Wheel embed code',
      description: 'Returns the iframe embed URL and HTML snippet for the wheel.',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: READ,
    },
    async ({ wheel_id }) =>
      runTool('get_wheel_embed', '/api/v1/wheels/{id}/embed', () =>
        api.get(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/embed`),
      ),
  );

  server.registerTool(
    'get_wheel_share_url',
    {
      title: 'Wheel share URL',
      description: 'Returns the public share URL and visibility flag.',
      inputSchema: { wheel_id: z.string().min(1) },
      annotations: READ,
    },
    async ({ wheel_id }) =>
      runTool('get_wheel_share_url', '/api/v1/wheels/{id}/share', () =>
        api.get(`/api/v1/wheels/${encodeURIComponent(wheel_id)}/share`),
      ),
  );
}
