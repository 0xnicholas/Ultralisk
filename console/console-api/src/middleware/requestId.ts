import { Request, Response, NextFunction } from 'express';
import { logger, newReqId } from '../logger.js';

const HEADER = 'x-request-id';
const VALID = /^[A-Za-z0-9._-]{1,128}$/;

// Attach a request id (and a child logger that carries it) to every
// request. Reuse an inbound X-Request-Id if it looks safe so a
// frontend / gateway can correlate across hops.
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers[HEADER];
  const id = typeof inbound === 'string' && VALID.test(inbound) ? inbound : newReqId();
  req.id = id;
  req.log = logger.child({ req_id: id });
  res.setHeader(HEADER, id);

  const start = Date.now();
  res.on('finish', () => {
    req.log.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
    }, 'request');
  });
  next();
}
