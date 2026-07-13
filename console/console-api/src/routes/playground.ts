import { Router, Request, Response } from 'express';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8080';

const router = Router();

// POST /v1/chat/completions → forward to Gateway
router.post('/chat/completions', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['authorization'] || '';
    const response = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify(req.body),
    });

    // For SSE streaming, pipe the response
    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body?.getReader();
      if (!reader) return res.status(502).json({ error: { code: 'no_response_body', message: 'Gateway returned no response body' } });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch (streamErr) {
        if (!res.headersSent) {
          res.status(502).json({ error: { code: 'upstream_error', message: 'Stream interrupted' } });
        } else {
          res.end();
        }
      }
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (err) {
    res.status(502).json({ error: { code: 'upstream_error', message: 'Upstream service unavailable' } });
  }
});

export default router;
