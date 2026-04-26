import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'err.config.headers.Authorization',
      'err.config.headers.authorization',
      'err.request._header',
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
