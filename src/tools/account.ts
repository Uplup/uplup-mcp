import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UplupApiClient } from '../api/client.js';
import { runTool } from '../util/tool.js';

export function registerAccountTools(server: McpServer, api: UplupApiClient): void {
  server.registerTool(
    'get_account',
    {
      title: 'Account & plan info',
      description:
        'Returns the connected user, brand, plan tier, response limits, and current month usage. Use this when a user asks "what plan am I on?" or to check remaining quota.',
      inputSchema: {},
    },
    async () => runTool('get_account', '/api/v1/account', () => api.get('/api/v1/account')),
  );
}
