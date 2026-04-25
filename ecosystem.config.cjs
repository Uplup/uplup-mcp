/**
 * PM2 ecosystem for production deploys.
 *
 * Single instance: MCP sessions are held in-process (sessionId -> {transport,
 * server, token, lastSeen}). Cluster mode breaks session affinity because
 * Node's cluster module round-robins TCP connections across workers, so a
 * client's `initialize` may land on worker A and the follow-up `tools/list`
 * on worker B — which would respond "Server not initialized". Keep
 * instances at 1 until sessions are externalised (e.g. to Redis).
 *
 * Env vars are inlined here on purpose; pm2 does NOT auto-load `.env`.
 */
module.exports = {
  apps: [
    {
      name: 'uplup-mcp',
      script: './dist/server.js',
      cwd: '/var/www/uplup-mcp',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        PORT: '3010',
        UPLUP_API_BASE_URL: 'https://api.uplup.com',
        MCP_PUBLIC_URL: 'https://mcp.uplup.com',
        LOG_LEVEL: 'info',
        NODE_ENV: 'production',
      },
      out_file: '/var/log/uplup-mcp/out.log',
      error_file: '/var/log/uplup-mcp/err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
