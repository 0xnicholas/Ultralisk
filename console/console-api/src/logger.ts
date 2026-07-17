import pino from 'pino';
import { randomUUID } from 'crypto';

const IS_PROD = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug'),
  // In dev: pretty single-line text. In prod: JSON one-line-per-record.
  ...(IS_PROD ? {} : {
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  }),
  base: {
    service: 'console-api',
    pid: process.pid,
  },
  // Auto-trim noisy fields from error objects.
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Per-request child logger: caller adds `req.log = logger.child({ req_id })`
// in the requestId middleware, then handlers do `req.log.info(...)` etc.
export function newReqId(): string {
  return randomUUID();
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      log: pino.Logger;
    }
  }
}

export {};
