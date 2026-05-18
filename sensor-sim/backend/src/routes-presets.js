// 预设场景接口
import express from 'express';
import { execute, fetchAll, fetchOne, parseJson } from './db.js';
import { requireAuth, requireFields } from './auth.js';

const VALID_CATEGORIES = new Set(['scene', 'robot', 'full']);

function normalizePreset(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    scene: parseJson(row.scene_json),
    robot: parseJson(row.robot_json),
    sensors: parseJson(row.sensors_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createPresetRouter() {
  const router = express.Router();
  const asyncHandler =
    (fn) =>
    (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next);

  router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const category = req.query.category;
    const params = [req.user.id];
    let sql =
      'SELECT id, name, category, scene_json, robot_json, sensors_json, created_at, updated_at FROM presets WHERE user_id = ?';
    if (category && VALID_CATEGORIES.has(String(category))) {
      sql += ' AND category = ?';
      params.push(String(category));
    }
    sql += ' ORDER BY created_at DESC';
    const rows = await fetchAll(sql, params);
    res.json({ ok: true, data: { presets: rows.map(normalizePreset) } });
  }));

  router.post('/', requireAuth, asyncHandler(async (req, res) => {
    const required = requireFields(req.body, ['name', 'category']);
    if (!required.ok) {
      res.status(400).json({ ok: false, message: required.message });
      return;
    }
    const name = String(req.body.name || '').trim();
    if (!name) {
      res.status(400).json({ ok: false, message: '预设名称不能为空' });
      return;
    }
    const category = String(req.body.category || 'full');
    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ ok: false, message: '预设类型不合法' });
      return;
    }

    const scene = req.body.scene ? JSON.stringify(req.body.scene) : null;
    const robot = req.body.robot ? JSON.stringify(req.body.robot) : null;
    const sensors = req.body.sensors ? JSON.stringify(req.body.sensors) : null;

    const result = await execute(
      'INSERT INTO presets (user_id, name, category, scene_json, robot_json, sensors_json) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, name, category, scene, robot, sensors]
    );
    const row = await fetchOne(
      'SELECT id, name, category, scene_json, robot_json, sensors_json, created_at, updated_at FROM presets WHERE id = ?',
      [result.insertId]
    );
    res.json({ ok: true, data: { preset: normalizePreset(row) } });
  }));

  router.put('/:id', requireAuth, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ ok: false, message: '预设 ID 不合法' });
      return;
    }
    const name = req.body.name !== undefined ? String(req.body.name || '').trim() : null;
    const category = req.body.category ? String(req.body.category) : null;
    if (category && !VALID_CATEGORIES.has(category)) {
      res.status(400).json({ ok: false, message: '预设类型不合法' });
      return;
    }

    const updates = [];
    const params = [];
    if (name !== null) {
      if (!name) {
        res.status(400).json({ ok: false, message: '预设名称不能为空' });
        return;
      }
      updates.push('name = ?');
      params.push(name);
    }
    if (category) {
      updates.push('category = ?');
      params.push(category);
    }
    if (req.body.scene !== undefined) {
      updates.push('scene_json = ?');
      params.push(req.body.scene ? JSON.stringify(req.body.scene) : null);
    }
    if (req.body.robot !== undefined) {
      updates.push('robot_json = ?');
      params.push(req.body.robot ? JSON.stringify(req.body.robot) : null);
    }
    if (req.body.sensors !== undefined) {
      updates.push('sensors_json = ?');
      params.push(req.body.sensors ? JSON.stringify(req.body.sensors) : null);
    }

    if (!updates.length) {
      res.status(400).json({ ok: false, message: '没有可更新的字段' });
      return;
    }

    params.push(req.user.id, id);
    const result = await execute(`UPDATE presets SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`, params);
    if (result.affectedRows === 0) {
      res.status(404).json({ ok: false, message: '未找到该预设' });
      return;
    }
    const row = await fetchOne(
      'SELECT id, name, category, scene_json, robot_json, sensors_json, created_at, updated_at FROM presets WHERE id = ?',
      [id]
    );
    res.json({ ok: true, data: { preset: normalizePreset(row) } });
  }));

  router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ ok: false, message: '预设 ID 不合法' });
      return;
    }
    const result = await execute('DELETE FROM presets WHERE user_id = ? AND id = ?', [req.user.id, id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ ok: false, message: '未找到该预设' });
      return;
    }
    res.json({ ok: true });
  }));

  return router;
}
