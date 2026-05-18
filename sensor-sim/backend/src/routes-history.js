// 历史记录接口
import express from 'express';
import { execute, fetchAll, fetchOne, parseJson } from './db.js';
import { requireAuth, requireFields } from './auth.js';

const MAX_RECORDS_STORE = Number(process.env.HISTORY_MAX_RECORDS || 5000);

function normalizeHistory(row, { includeRecords = false } = {}) {
  return {
    id: row.id,
    name: row.name,
    recordCount: row.record_count,
    stats: parseJson(row.stats_json),
    scene: parseJson(row.scene_json),
    sensors: parseJson(row.sensors_json),
    records: includeRecords ? parseJson(row.records_json) : null,
    createdAt: row.created_at,
  };
}

export function createHistoryRouter() {
  const router = express.Router();
  const asyncHandler =
    (fn) =>
    (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next);

  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const rawLimit = Number.parseInt(String(req.query.limit ?? '30'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 0), 100) : 30;
    const rows = await fetchAll(
      `SELECT id, name, record_count, stats_json, created_at FROM history_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ${limit}`,
      [req.user.id]
    );
    res.json({
      ok: true,
      data: {
        history: rows.map((row) => ({
          id: row.id,
          name: row.name,
          recordCount: row.record_count,
          stats: parseJson(row.stats_json),
          createdAt: row.created_at,
        })),
      },
    });
  }));

  router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ ok: false, message: '记录 ID 不合法' });
      return;
    }
    const row = await fetchOne(
      'SELECT id, name, record_count, stats_json, scene_json, sensors_json, records_json, created_at FROM history_runs WHERE user_id = ? AND id = ?',
      [req.user.id, id]
    );
    if (!row) {
      res.status(404).json({ ok: false, message: '未找到该记录' });
      return;
    }
    res.json({ ok: true, data: { history: normalizeHistory(row, { includeRecords: true }) } });
  }));

  router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const required = requireFields(req.body, ['name']);
    if (!required.ok) {
      res.status(400).json({ ok: false, message: required.message });
      return;
    }
    const name = String(req.body.name || '').trim();
    if (!name) {
      res.status(400).json({ ok: false, message: '记录名称不能为空' });
      return;
    }
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    const trimmed = records.slice(-MAX_RECORDS_STORE);
    const recordCount = trimmed.length;
    const stats = req.body.stats || {
      totalRecords: records.length,
      storedRecords: recordCount,
    };

    const result = await execute(
      'INSERT INTO history_runs (user_id, name, scene_json, sensors_json, stats_json, records_json, record_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        req.user.id,
        name,
        req.body.scene ? JSON.stringify(req.body.scene) : null,
        req.body.sensors ? JSON.stringify(req.body.sensors) : null,
        stats ? JSON.stringify(stats) : null,
        trimmed.length ? JSON.stringify(trimmed) : null,
        recordCount,
      ]
    );
    const row = await fetchOne(
      'SELECT id, name, record_count, stats_json, created_at FROM history_runs WHERE id = ?',
      [result.insertId]
    );
    res.json({
      ok: true,
      data: {
        history: {
          id: row.id,
          name: row.name,
          recordCount: row.record_count,
          stats: parseJson(row.stats_json),
          createdAt: row.created_at,
        },
      },
    });
  }));

  router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ ok: false, message: '记录 ID 不合法' });
      return;
    }
    const result = await execute('DELETE FROM history_runs WHERE user_id = ? AND id = ?', [req.user.id, id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ ok: false, message: '未找到该记录' });
      return;
    }
    res.json({ ok: true });
  }));

  return router;
}
