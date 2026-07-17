import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

function getSecret(): string {
  return process.env.JWT_SECRET || 'dev-secret-change-in-production';
}

interface Claims {
  sub: string;
  org_id: string;
  role: string;
  exp: number;
}

function extractToken(req: Request): string | null {
  const auth = req.headers['authorization'];
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const cookieToken = (req as any).cookies?.jwt;
  if (cookieToken) return cookieToken;
  // Fall back to parsing the raw Cookie header so we don't need
  // cookie-parser middleware just for this single field.
  const rawCookie = req.headers['cookie'];
  if (rawCookie) {
    const match = rawCookie.match(/(?:^|;\s*)jwt=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    return;
  }

  try {
    const decoded = jwt.verify(token, getSecret()) as Claims;
    if (!decoded.sub || !decoded.org_id) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid token claims' } });
      return;
    }
    req.headers['x-user-id'] = decoded.sub;
    req.headers['x-org-id'] = decoded.org_id;
    req.headers['x-user-role'] = decoded.role;
    next();
  } catch {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Invalid or expired token' } });
  }
}
