/**
 * 射线与轴对齐矩形求交。返回最小的 t（t >= 0），否则返回 null。
 * 射线：起点 (ox,oy)，方向 (dx,dy)（已归一化）
 * 矩形：中心 (cx,cy)，半宽 hw，半高 hh
 */
export function rayRectIntersect(ox, oy, dx, dy, cx, cy, hw, hh) {
  const minX = cx - hw;
  const maxX = cx + hw;
  const minY = cy - hh;
  const maxY = cy + hh;

  // slab 法：求射线在 x/y 两个区间的重叠部分
  let tMin = -Infinity;
  let tMax = Infinity;

  if (Math.abs(dx) < 1e-12) {
    // 射线近似竖直，必须落在 x 区间内
    if (ox < minX || ox > maxX) return null;
  } else {
    const tx1 = (minX - ox) / dx;
    const tx2 = (maxX - ox) / dx;
    const t1 = Math.min(tx1, tx2);
    const t2 = Math.max(tx1, tx2);
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
  }

  if (Math.abs(dy) < 1e-12) {
    // 射线近似水平，必须落在 y 区间内
    if (oy < minY || oy > maxY) return null;
  } else {
    const ty1 = (minY - oy) / dy;
    const ty2 = (maxY - oy) / dy;
    const t1 = Math.min(ty1, ty2);
    const t2 = Math.max(ty1, ty2);
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
  }

  if (tMax < tMin) return null; // 无重叠，未命中
  const t = tMin >= 0 ? tMin : tMax >= 0 ? tMax : null;
  if (t === null || t < 0) return null; // 交点都在射线起点后方
  return t;
}

export function rotateLocal(px, py, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // 局部坐标绕原点旋转到世界坐标
  return { x: px * c - py * s, y: px * s + py * c };
}
