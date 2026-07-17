import { Router, Request, Response } from 'express';

const router = Router();

const MOCK_CONFIG = {
  provider: 'saml',
  enabled: false,
  entity_id: 'https://ultralisk.io/saml/metadata',
  acs_url: 'https://ultralisk.io/saml/acs',
  idp_sso_url: '',
  idp_entity_id: '',
  jit_provisioning: true,
  default_role: 'developer',
};

router.get('/settings/sso', (_req: Request, res: Response) => {
  res.json({ data: MOCK_CONFIG });
});

router.put('/settings/sso', (req: Request, res: Response) => {
  Object.assign(MOCK_CONFIG, req.body);
  res.json({ data: MOCK_CONFIG });
});

router.post('/settings/sso/test', (_req: Request, res: Response) => {
  res.json({ data: { success: true, message: 'SSO connection test successful' } });
});

export default router;
