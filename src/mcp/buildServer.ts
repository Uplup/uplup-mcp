import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UplupApiClient } from '../api/client.js';
import { registerFormsTools } from '../tools/forms.js';
import { registerFieldsTools } from '../tools/fields.js';
import { registerSubmissionsTools } from '../tools/submissions.js';
import { registerAnalyticsTools } from '../tools/analytics.js';
import { registerQuizTools } from '../tools/quiz.js';
import { registerWebhooksTools } from '../tools/webhooks.js';
import { registerAccountTools } from '../tools/account.js';
import { registerDesignTools } from '../tools/design.js';
import { registerPagesTools } from '../tools/pages.js';
import { registerFormResources } from '../resources/forms.js';
import { registerTemplateResources } from '../resources/templates.js';
import { registerPrompts } from '../prompts/index.js';

const SERVER_NAME = 'uplup-mcp';
const SERVER_VERSION = '0.1.0';

/**
 * Build a fresh McpServer wired to a specific user's API token.
 * One server per request, since the SDK ties a server to a single transport
 * and we want per-request auth isolation.
 */
export function buildMcpServer(bearerToken: string): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false },
        logging: {},
      },
      instructions:
        'Uplup MCP exposes Uplup form/quiz/wheel data. Use list_forms to discover what the user has, get_form to read structure, and create_form/create_field to build new forms. Webhook tools require Pro plan or higher.',
    },
  );

  const api = new UplupApiClient(bearerToken);

  registerFormsTools(server, api);
  registerFieldsTools(server, api);
  registerSubmissionsTools(server, api);
  registerAnalyticsTools(server, api);
  registerQuizTools(server, api);
  registerWebhooksTools(server, api);
  registerAccountTools(server, api);
  registerDesignTools(server, api);
  registerPagesTools(server, api);

  registerFormResources(server, api);
  registerTemplateResources(server);

  registerPrompts(server);

  return server;
}
