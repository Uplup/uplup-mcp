import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { AxiosError } from 'axios';

export interface ToolErrorContext {
  tool: string;
  upstreamPath?: string;
}

export function mapAxiosError(err: unknown, ctx: ToolErrorContext): McpError {
  if (err instanceof AxiosError) {
    const status = err.response?.status ?? 0;
    const where = ctx.upstreamPath ? ` (${ctx.upstreamPath})` : '';

    // Upstream 5xx: never forward the body. It may carry stack traces or
    // internal detail, and it is not actionable for the client anyway.
    if (status >= 500) {
      return new McpError(ErrorCode.InternalError, `Uplup API error${where}, please try again.`);
    }

    const upstreamMessage = extractUpstreamMessage(err);

    if (status === 400) {
      return new McpError(ErrorCode.InvalidParams, `Bad request${where}: ${upstreamMessage}`);
    }
    if (status === 401) {
      return new McpError(
        ErrorCode.InvalidRequest,
        `Authentication failed${where}. Reconnect Uplup to refresh your token.`,
      );
    }
    if (status === 403) {
      return new McpError(
        ErrorCode.InvalidRequest,
        `Permission denied${where}: ${upstreamMessage}. Your plan tier may not include this feature, or the token is read-only.`,
      );
    }
    if (status === 404) {
      return new McpError(ErrorCode.InvalidParams, `Not found${where}: ${upstreamMessage}`);
    }
    if (status === 429) {
      const retryAfter = err.response?.headers?.['retry-after'];
      const retryHint = retryAfter ? ` Retry after ${retryAfter}s.` : '';
      return new McpError(
        ErrorCode.InternalError,
        `Rate limited${where}.${retryHint} ${upstreamMessage}`.trim(),
      );
    }
    if (status === 0) {
      // No HTTP response at all: timeout, DNS, connection reset.
      return new McpError(ErrorCode.InternalError, `Uplup API unreachable${where}, please try again.`);
    }
    return new McpError(
      ErrorCode.InternalError,
      `HTTP ${status}${where}: ${upstreamMessage || err.message}`,
    );
  }

  if (err instanceof Error) {
    return new McpError(ErrorCode.InternalError, `${ctx.tool}: ${err.message}`);
  }
  return new McpError(ErrorCode.InternalError, `${ctx.tool}: unknown error`);
}

/** Pull a human-readable message out of a 4xx body; only used for 4xx. */
function extractUpstreamMessage(err: AxiosError): string {
  const data = err.response?.data;
  if (!data) return err.message;
  if (typeof data === 'string') return data.slice(0, 500);
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const msg =
      (typeof obj.error_description === 'string' && obj.error_description) ||
      (typeof obj.message === 'string' && obj.message) ||
      (typeof obj.error === 'string' && obj.error);
    if (msg) return msg;
  }
  return err.message;
}
