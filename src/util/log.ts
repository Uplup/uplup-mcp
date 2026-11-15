import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      // Inbound request headers.
      'req.headers.authorization',
      'req.headers.cookie',
      // Axios error objects: the request config and the raw request header
      // block both carry the forwarded Bearer token. The same objects appear
      // again under err.response when upstream answered.
      'err.config.headers.Authorization',
      'err.config.headers.authorization',
      'err.request._header',
      'err.response.config.headers.Authorization',
      'err.response.config.headers.authorization',
      'err.response.request._header',
      // Any object logged at any depth that carries an auth header.
      '*.headers.Authorization',
      '*.headers.authorization',
      '*.config.headers.Authorization',
      '*.config.headers.authorization',
      // Token-shaped fields, top level and one level down.
      'token',
      'access_token',
      'refresh_token',
      '*.token',
      '*.access_token',
      '*.refresh_token',
      '*.client_secret',
      '*.password',
      '*.bearer',
      '*.bearerToken',
    ],
    censor: '[REDACTED]',
  },
  transport: isProd
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
});
