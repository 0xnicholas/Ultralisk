import { Router, Request, Response } from 'express';

const router = Router();

const MOCK_LICENSE = {
  key: 'ULTR-XXXX-XXXX-XXXX-XXXX',
  status: 'active',
  plan: 'Enterprise',
  issued_at: '2026-01-01',
  expires_at: '2027-01-01',
  max_gpus: 64,
  used_gpus: 22,
  max_users: 50,
  used_users: 8,
  support_level: 'premium',
  support_expires_at: '2027-01-01',
};

router.get('/license', (_req: Request, res: Response) => {
  res.json({ data: MOCK_LICENSE });
});

export default router;
