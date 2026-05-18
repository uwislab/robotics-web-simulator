// HTTP 接口入口，集中挂载路由
import express from 'express';
import cors from 'cors';
import { createAuthRouter } from './routes-auth.js';
import { createPresetRouter } from './routes-presets.js';
import { createHistoryRouter } from './routes-history.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: false,
    })
  );
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter());
  app.use('/api/presets', createPresetRouter());
  app.use('/api/history', createHistoryRouter());

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ ok: false, message: '服务器内部错误' });
  });

  return app;
}
