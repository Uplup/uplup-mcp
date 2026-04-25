import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { mapAxiosError } from './errors.js';

/**
 * Wraps a tool body so axios/HTTP errors are converted to MCP errors and the
 * happy-path JSON is wrapped in a CallToolResult content array.
 */
export async function runTool<T>(
  toolName: string,
  upstreamPath: string,
  fn: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    const data = await fn();
    return {
      content: [
        {
          type: 'text',
          text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
        },
      ],
      structuredContent: typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined,
    };
  } catch (err) {
    throw mapAxiosError(err, { tool: toolName, upstreamPath });
  }
}

/** Build a query string from defined values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}
