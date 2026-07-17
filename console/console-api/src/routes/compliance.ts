import { Router, Request, Response } from 'express';

const router = Router();

const MOCK_COMPLIANCE = {
  soc2: { status: 'compliant', last_audit: '2026-06-15', valid_until: '2027-06-15' },
  iso27001: { status: 'in_progress', progress_pct: 35 },
  encryption: { at_rest: true, in_transit: true },
  data_retention: { enabled: true, retention_days: 90 },
};

router.get('/compliance', (_req: Request, res: Response) => {
  res.json({ data: MOCK_COMPLIANCE });
});

export default router;
