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
import { registerWheelsTools } from '../tools/wheels.js';
import { registerFormResources } from '../resources/forms.js';
import { registerTemplateResources } from '../resources/templates.js';
import { registerPrompts } from '../prompts/index.js';
import { SERVER_NAME, SERVER_VERSION } from '../util/version.js';

const INSTRUCTIONS = [
  'Uplup MCP exposes the connected account\'s forms, quizzes, submissions, analytics, webhooks and random name picker wheels through the Uplup public API.',
  'Start with list_forms to discover what the user has, get_form to read a form\'s structure, and create_form followed by create_field to build new forms.',
  'Webhooks need a Pro plan or higher, both to create a subscription and to receive deliveries, and a workspace can hold at most 25 active webhooks.',
  'Read-only API tokens cannot call write tools; the API answers 403 "This token has read access only".',
  'The upstream API allows 600 requests an hour per token and returns 429 with X-RateLimit-* headers when that is exceeded.',
].join(' ');

/**
 * Build a fresh McpServer wired to one user's API token.
 *
 * One server per session: the SDK ties a server to a single transport, and
 * server.ts binds each session to the Bearer token that initialized it (a
 * later request on the same session with a different token is rejected).
 * Every tool call inside the session therefore runs as that token, and
 * closing the session disposes the server and its API client together.
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
      instructions: INSTRUCTIONS,
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
  registerWheelsTools(server, api);

  registerFormResources(server, api);
  registerTemplateResources(server);

  registerPrompts(server);

  return server;
}
