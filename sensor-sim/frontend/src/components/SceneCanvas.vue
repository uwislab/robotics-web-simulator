<!-- 场景画布 -->
<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { rayRectIntersect, rotateLocal } from '../lib/geometry.js';

const props = defineProps({
  scene: { type: Object, required: true },
  sensors: { type: Array, default: () => [] },
  latestBySensor: { type: Object, default: () => ({}) },
  running: { type: Boolean, default: false },
  selectedObstacleId: { type: String, default: null },
});

const emit = defineEmits(['updateRobot', 'updateObstacle', 'selectObstacle']);

const canvasRef = ref(null);
const view = ref({ ox: 0, oy: 0, scale: 64, w: 800, h: 560 });
const drag = ref(null);

function worldToScreen(x, y) {
  const { ox, oy, scale } = view.value;
  return {
    x: ox + x * scale,
    y: oy - y * scale,
  };
}

function screenToWorld(sx, sy) {
  const { ox, oy, scale } = view.value;
  return {
    x: (sx - ox) / scale,
    y: -(sy - oy) / scale,
  };
}

function draw() {
  const c = canvasRef.value;
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width;
  const h = c.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(0, 0, w, h);

  const grid = 1;
  ctx.strokeStyle = '#1e2630';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 12; x += grid) {
    const a = worldToScreen(x, 0);
    const b = worldToScreen(x, 10);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = 0; y <= 10; y += grid) {
    const a = worldToScreen(0, y);
    const b = worldToScreen(12, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const obs = props.scene.obstacles || [];
  for (const o of obs) {
    const hw = o.width / 2;
    const hh = o.height / 2;
    const p1 = worldToScreen(o.x - hw, o.y + hh);
    const p2 = worldToScreen(o.x + hw, o.y - hh);
    const sel = props.selectedObstacleId === o.id;
    ctx.fillStyle = sel ? 'rgba(244, 162, 97, 0.14)' : 'rgba(61, 214, 198, 0.12)';
    ctx.strokeStyle = sel ? 'rgba(244, 162, 97, 0.95)' : 'rgba(61, 214, 198, 0.45)';
    ctx.lineWidth = sel ? 2.5 : 1.5;
    ctx.fillRect(p1.x, p2.y, p2.x - p1.x, p1.y - p2.y);
    ctx.strokeRect(p1.x, p2.y, p2.x - p1.x, p1.y - p2.y);
    if (sel) {
      ctx.fillStyle = 'rgba(244, 162, 97, 0.9)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(o.id, p1.x + 4, p2.y + 14);
    }
  }

  const robot = props.scene.robot;
  const R = worldToScreen(robot.x, robot.y);
  const theta = robot.theta;

  for (const s of props.sensors) {
    if (!s.enabled) continue;
    const mx = s.mountX ?? 0;
    const my = s.mountY ?? 0;
    const ma = s.mountAngle ?? 0;
    const local = rotateLocal(mx, my, theta);
    const sx = robot.x + local.x;
    const sy = robot.y + local.y;
    const S = worldToScreen(sx, sy);
    const dir = theta + ma;

    if (s.sensorType === 'ultrasonic') {
      const rangeM = (s.rangeCm ?? 300) / 100;
      const beam = ((s.beamDeg ?? 55) * Math.PI) / 180;
      const hit = props.latestBySensor[s.sensorId]?.hit;
      ctx.fillStyle = hit ? 'rgba(61, 214, 198, 0.18)' : 'rgba(100, 140, 180, 0.1)';
      ctx.strokeStyle = hit ? 'rgba(61, 214, 198, 0.55)' : 'rgba(120, 150, 180, 0.35)';
      ctx.beginPath();
      ctx.moveTo(S.x, S.y);
      const a1 = dir - beam / 2;
      const a2 = dir + beam / 2;
      const arcR = rangeM * view.value.scale;
      ctx.arc(S.x, S.y, arcR, -a2, -a1, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (s.sensorType === 'infrared') {
      const rangeM = (s.rangeCm ?? 60) / 100;
      const dx = Math.cos(dir);
      const dy = Math.sin(dir);
      let best = rangeM;
      for (const o of obs) {
        const hw = o.width / 2;
        const hh = o.height / 2;
        const t = rayRectIntersect(sx, sy, dx, dy, o.x, o.y, hw, hh);
        if (t !== null && t > 0 && t < best) best = t;
      }
      const end = worldToScreen(sx + dx * best, sy + dy * best);
      ctx.strokeStyle = 'rgba(244, 162, 97, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(S.x, S.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(R.x, R.y);
  ctx.rotate(-theta);
  ctx.fillStyle = '#3dd6c6';
  ctx.strokeStyle = '#b8f5ee';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, 9);
  ctx.lineTo(-10, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const imuS = props.sensors.find((s) => s.sensorType === 'imu' && s.enabled);
  if (imuS) {
    const d = props.latestBySensor[imuS.sensorId];
    if (d?.gyroZ !== undefined) {
      ctx.fillStyle = '#b8f5ee';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`ωz ${d.gyroZ.toFixed(3)} rad/s`, R.x + 18, R.y - 14);
      ctx.fillText(`a ${d.accelX.toFixed(2)}, ${d.accelY.toFixed(2)} m/s²`, R.x + 18, R.y - 2);
    }
  }

  ctx.fillStyle = '#8b9bb0';
  ctx.font = '11px JetBrains Mono, monospace';
  ctx.fillText(`x:${robot.x.toFixed(2)} y:${robot.y.toFixed(2)} θ:${((theta * 180) / Math.PI).toFixed(1)}°`, 12, 22);
}

function resize() {
  const c = canvasRef.value;
  if (!c) return;
  const rect = c.parentElement?.getBoundingClientRect();
  if (!rect) return;
  c.width = rect.width;
  c.height = Math.max(400, rect.height);
  view.value.w = c.width;
  view.value.h = c.height;
  view.value.ox = c.width * 0.08;
  view.value.oy = c.height * 0.88;
  draw();
}

let ro;
onMounted(() => {
  resize();
  ro = new ResizeObserver(resize);
  if (canvasRef.value?.parentElement) ro.observe(canvasRef.value.parentElement);
});

onUnmounted(() => ro?.disconnect());

watch(
  () => [props.scene, props.sensors, props.latestBySensor, props.running, props.selectedObstacleId],
  () => draw(),
  { deep: true }
);

function onWheel(e) {
  e.preventDefault();
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (e.shiftKey && hitTestRobot(mx, my)) {
    const robot = props.scene.robot;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    emit('updateRobot', { ...robot, theta: robot.theta + delta });
    return;
  }
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  view.value.scale = Math.min(200, Math.max(24, view.value.scale * factor));
  draw();
}

function hitTestRobot(mx, my) {
  const robot = props.scene.robot;
  const R = worldToScreen(robot.x, robot.y);
  const dx = mx - R.x;
  const dy = my - R.y;
  return dx * dx + dy * dy < 28 * 28;
}

function hitTestObstacle(mx, my) {
  const p = screenToWorld(mx, my);
  for (const o of props.scene.obstacles || []) {
    const hw = o.width / 2;
    const hh = o.height / 2;
    if (p.x >= o.x - hw && p.x <= o.x + hw && p.y >= o.y - hh && p.y <= o.y + hh) return o;
  }
  return null;
}

function onPointerDown(e) {
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    drag.value = { type: 'pan', sx: mx, sy: my, ox: view.value.ox, oy: view.value.oy };
    return;
  }
  if (hitTestRobot(mx, my)) {
    const w = screenToWorld(mx, my);
    drag.value = { type: 'robot', start: w, robot: { ...props.scene.robot } };
    return;
  }
  const ob = hitTestObstacle(mx, my);
  if (ob) {
    emit('selectObstacle', ob.id);
    const w = screenToWorld(mx, my);
    drag.value = { type: 'obstacle', id: ob.id, start: w, orig: { x: ob.x, y: ob.y } };
    return;
  }
  emit('selectObstacle', null);
}

function onPointerMove(e) {
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  if (!drag.value) return;
  if (drag.value.type === 'pan') {
    const dx = mx - drag.value.sx;
    const dy = my - drag.value.sy;
    view.value.ox = drag.value.ox + dx;
    view.value.oy = drag.value.oy + dy;
    draw();
    return;
  }
  const w = screenToWorld(mx, my);
  if (drag.value.type === 'robot') {
    const dx = w.x - drag.value.start.x;
    const dy = w.y - drag.value.start.y;
    emit('updateRobot', {
      x: drag.value.robot.x + dx,
      y: drag.value.robot.y + dy,
      theta: drag.value.robot.theta,
    });
  } else if (drag.value.type === 'obstacle') {
    const dx = w.x - drag.value.start.x;
    const dy = w.y - drag.value.start.y;
    emit('updateObstacle', {
      id: drag.value.id,
      x: drag.value.orig.x + dx,
      y: drag.value.orig.y + dy,
    });
  }
}

function onPointerUp() {
  drag.value = null;
}

</script>

<template>
  <div class="wrap" @wheel.passive="false">
    <canvas
      ref="canvasRef"
      class="cv"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    />
    <div class="hint">
      点击障碍物可选中 · Delete 删除选中 · 拖拽机器人/障碍物 · Alt+拖拽平移 · 滚轮缩放 · 机器人上 Shift+滚轮 调朝向
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
}
.cv {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 10px;
  cursor: crosshair;
}
.hint {
  position: absolute;
  bottom: 8px;
  left: 12px;
  font-size: 11px;
  color: var(--muted);
  pointer-events: none;
}
</style>
