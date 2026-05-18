// 登录鉴权与 JWT 处理
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(user) {
  return jwt.sign({ uid: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ ok: false, message: '未登录或令牌缺失' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.uid, username: payload.username };
    next();
  } catch {
    res.status(401).json({ ok: false, message: '登录已过期，请重新登录' });
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter((field) => body?.[field] === undefined || body?.[field] === null);
  if (missing.length) {
    return { ok: false, message: `缺少字段: ${missing.join(', ')}` };
  }
  return { ok: true };
}
