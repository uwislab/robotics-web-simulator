// 登录/注册接口
import express from 'express';
import bcrypt from 'bcryptjs';
import { execute, fetchOne } from './db.js';
import { requireAuth, requireFields, signToken } from './auth.js';

export function createAuthRouter() {
  const router = express.Router();
  const asyncHandler =
    (fn) =>
    (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next);

  router.post('/register', asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const required = requireFields(req.body, ['username', 'password']);
    if (!required.ok) {
      res.status(400).json({ ok: false, message: required.message });
      return;
    }

    const trimmed = String(username).trim();
    if (trimmed.length < 3 || trimmed.length > 32) {
      res.status(400).json({ ok: false, message: '用户名长度需在 3-32 字符之间' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ ok: false, message: '密码至少 6 位' });
      return;
    }

    const hash = await bcrypt.hash(String(password), 10);
    try {
      const result = await execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', [trimmed, hash]);
      const user = { id: result.insertId, username: trimmed };
      const token = signToken(user);
      res.json({ ok: true, data: { user, token } });
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ ok: false, message: '用户名已存在' });
        return;
      }
      res.status(500).json({ ok: false, message: '注册失败' });
    }
  }));

  router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    const required = requireFields(req.body, ['username', 'password']);
    if (!required.ok) {
      res.status(400).json({ ok: false, message: required.message });
      return;
    }
    const user = await fetchOne('SELECT id, username, password_hash FROM users WHERE username = ?', [
      String(username).trim(),
    ]);
    if (!user) {
      res.status(401).json({ ok: false, message: '用户名或密码错误' });
      return;
    }
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      res.status(401).json({ ok: false, message: '用户名或密码错误' });
      return;
    }
    const token = signToken({ id: user.id, username: user.username });
    res.json({ ok: true, data: { user: { id: user.id, username: user.username }, token } });
  }));

  router.get('/me', requireAuth, asyncHandler(async (req, res) => {
    res.json({ ok: true, data: { user: { id: req.user.id, username: req.user.username } } });
  }));

  router.post('/logout', requireAuth, asyncHandler(async (req, res) => {
    res.json({ ok: true });
  }));

  return router;
}
