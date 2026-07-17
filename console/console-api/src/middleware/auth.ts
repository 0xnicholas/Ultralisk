import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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
  return null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Authentication required' } });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Claims;
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
