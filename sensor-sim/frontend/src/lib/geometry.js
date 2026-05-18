export function rayRectIntersect(ox, oy, dx, dy, cx, cy, hw, hh) {
  const minX = cx - hw;
  const maxX = cx + hw;
  const minY = cy - hh;
  const maxY = cy + hh;

  let tMin = -Infinity;
  let tMax = Infinity;

  if (Math.abs(dx) < 1e-12) {
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
    if (oy < minY || oy > maxY) return null;
  } else {
    const ty1 = (minY - oy) / dy;
    const ty2 = (maxY - oy) / dy;
    const t1 = Math.min(ty1, ty2);
    const t2 = Math.max(ty1, ty2);
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
  }

  if (tMax < tMin) return null;
  const t = tMin >= 0 ? tMin : tMax >= 0 ? tMax : null;
  if (t === null || t < 0) return null;
  return t;
}

export function rotateLocal(px, py, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: px * c - py * s, y: px * s + py * c };
}
