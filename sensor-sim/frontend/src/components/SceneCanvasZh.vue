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

function normalizeAngle(theta) {
  const twoPi = Math.PI * 2;
  let t = theta % twoPi;
  if (t < 0) t += twoPi;
  return t;
}

// 视图坐标系：世界坐标（米）转换到画布坐标（像素）
function worldToScreen(x, y) {
  const { ox, oy, scale } = view.value;
  return { x: ox + x * scale, y: oy - y * scale };
}

function screenToWorld(sx, sy) {
  const { ox, oy, scale } = view.value;
  return { x: (sx - ox) / scale, y: -(sy - oy) / scale };
}

function drawRobotInfo(ctx, robot, point) {
  // IMU 传感器存在时在机器人旁边叠加惯性数据
  const imuSensor = props.sensors.find((sensor) => sensor.sensorType === 'imu' && sensor.enabled);
  if (imuSensor) {
    const data = props.latestBySensor[imuSensor.sensorId];
    if (data?.gyroZ !== undefined) {
      ctx.fillStyle = '#b8f5ee';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`角速度 Z ${data.gyroZ.toFixed(3)} rad/s`, point.x + 18, point.y - 14);
      ctx.fillText(`加速度 ${data.accelX.toFixed(2)}, ${data.accelY.toFixed(2)} m/s²`, point.x + 18, point.y - 2);
    }
  }

  ctx.fillStyle = '#8b9bb0';
  ctx.font = '11px JetBrains Mono, monospace';
  const thetaDeg = (normalizeAngle(robot.theta) * 180) / Math.PI;
  ctx.fillText(
    `x:${robot.x.toFixed(2)}  y:${robot.y.toFixed(2)}  θ:${thetaDeg.toFixed(1)}°`,
    12,
    22
  );
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#0a0d12';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#1e2630';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 12; x += 1) {
    const a = worldToScreen(x, 0);
    const b = worldToScreen(x, 10);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = 0; y <= 10; y += 1) {
    const a = worldToScreen(0, y);
    const b = worldToScreen(12, y);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const obstacles = props.scene.obstacles || [];
  for (const obstacle of obstacles) {
    const halfWidth = obstacle.width / 2;
    const halfHeight = obstacle.height / 2;
    const p1 = worldToScreen(obstacle.x - halfWidth, obstacle.y + halfHeight);
    const p2 = worldToScreen(obstacle.x + halfWidth, obstacle.y - halfHeight);
    const selected = props.selectedObstacleId === obstacle.id;
    ctx.fillStyle = selected ? 'rgba(244, 162, 97, 0.14)' : 'rgba(61, 214, 198, 0.12)';
    ctx.strokeStyle = selected ? 'rgba(244, 162, 97, 0.95)' : 'rgba(61, 214, 198, 0.45)';
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.fillRect(p1.x, p2.y, p2.x - p1.x, p1.y - p2.y);
    ctx.strokeRect(p1.x, p2.y, p2.x - p1.x, p1.y - p2.y);
    if (selected) {
      ctx.fillStyle = 'rgba(244, 162, 97, 0.9)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(obstacle.id, p1.x + 4, p2.y + 14);
    }
  }

  const robot = props.scene.robot;
  const robotPoint = worldToScreen(robot.x, robot.y);
  const theta = normalizeAngle(robot.theta);

  for (const sensor of props.sensors) {
    if (!sensor.enabled) continue;
    const mountX = sensor.mountX ?? 0;
    const mountY = sensor.mountY ?? 0;
    const mountAngle = sensor.mountAngle ?? 0;
    const local = rotateLocal(mountX, mountY, theta);
    const sx = robot.x + local.x;
    const sy = robot.y + local.y;
    const sensorPoint = worldToScreen(sx, sy);
    const dir = theta + mountAngle;

    // 超声波：扇形波束
    if (sensor.sensorType === 'ultrasonic') {
      const rangeM = (sensor.rangeCm ?? 300) / 100;
      const beam = ((sensor.beamDeg ?? 55) * Math.PI) / 180;
      const hit = props.latestBySensor[sensor.sensorId]?.hit;
      ctx.fillStyle = hit ? 'rgba(61, 214, 198, 0.18)' : 'rgba(100, 140, 180, 0.1)';
      ctx.strokeStyle = hit ? 'rgba(61, 214, 198, 0.55)' : 'rgba(120, 150, 180, 0.35)';
      ctx.beginPath();
      ctx.moveTo(sensorPoint.x, sensorPoint.y);
      const a1 = dir - beam / 2;
      const a2 = dir + beam / 2;
      ctx.arc(sensorPoint.x, sensorPoint.y, rangeM * view.value.scale, -a2, -a1, false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    // 红外：单束射线
    } else if (sensor.sensorType === 'infrared') {
      // 红外示意线固定在机器人正前方，便于直观观察
      const frontPoint = worldToScreen(robot.x, robot.y);
      const rangeM = (sensor.rangeCm ?? 60) / 100;
      const dx = Math.cos(theta);
      const dy = Math.sin(theta);
      let best = rangeM;
      for (const obstacle of obstacles) {
        const halfWidth = obstacle.width / 2;
        const halfHeight = obstacle.height / 2;
        const t = rayRectIntersect(robot.x, robot.y, dx, dy, obstacle.x, obstacle.y, halfWidth, halfHeight);
        if (t !== null && t > 0 && t < best) best = t;
      }
      const end = worldToScreen(robot.x + dx * best, robot.y + dy * best);
      ctx.strokeStyle = 'rgba(244, 162, 97, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(frontPoint.x, frontPoint.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.translate(robotPoint.x, robotPoint.y);
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

  drawRobotInfo(ctx, robot, robotPoint);
}

function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.parentElement?.getBoundingClientRect();
  if (!rect) return;
  // 画布尺寸跟随容器，并刷新视图基准
  canvas.width = rect.width;
  canvas.height = Math.max(420, rect.height);
  view.value.w = canvas.width;
  view.value.h = canvas.height;
  view.value.ox = canvas.width * 0.08;
  view.value.oy = canvas.height * 0.88;
  draw();
}

let observer;

onMounted(() => {
  resize();
  observer = new ResizeObserver(resize);
  if (canvasRef.value?.parentElement) observer.observe(canvasRef.value.parentElement);
});

onUnmounted(() => observer?.disconnect());

watch(
  () => [props.scene, props.sensors, props.latestBySensor, props.running, props.selectedObstacleId],
  () => draw(),
  { deep: true }
);

function hitTestRobot(mx, my) {
  const point = worldToScreen(props.scene.robot.x, props.scene.robot.y);
  const dx = mx - point.x;
  const dy = my - point.y;
  return dx * dx + dy * dy < 28 * 28;
}

function hitTestObstacle(mx, my) {
  const point = screenToWorld(mx, my);
  for (const obstacle of props.scene.obstacles || []) {
    const halfWidth = obstacle.width / 2;
    const halfHeight = obstacle.height / 2;
    if (
      point.x >= obstacle.x - halfWidth &&
      point.x <= obstacle.x + halfWidth &&
      point.y >= obstacle.y - halfHeight &&
      point.y <= obstacle.y + halfHeight
    ) {
      return obstacle;
    }
  }
  return null;
}

function onWheel(event) {
  event.preventDefault();
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;
  // Shift + 滚轮：调整机器人朝向
  if (event.shiftKey && hitTestRobot(mx, my)) {
    const robot = props.scene.robot;
    const delta = event.deltaY > 0 ? -0.05 : 0.05;
    emit('updateRobot', { ...robot, theta: robot.theta + delta });
    return;
  }
  // 普通滚轮：缩放视图
  const factor = event.deltaY > 0 ? 0.92 : 1.08;
  view.value.scale = Math.min(200, Math.max(24, view.value.scale * factor));
  draw();
}

function onPointerDown(event) {
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;

  if (event.button === 1 || (event.button === 0 && event.altKey)) {
    // 中键或 Alt + 左键：平移视图
    drag.value = { type: 'pan', sx: mx, sy: my, ox: view.value.ox, oy: view.value.oy };
    return;
  }

  if (hitTestRobot(mx, my)) {
    drag.value = { type: 'robot', start: screenToWorld(mx, my), robot: { ...props.scene.robot } };
    return;
  }

  const obstacle = hitTestObstacle(mx, my);
  if (obstacle) {
    emit('selectObstacle', obstacle.id);
    drag.value = {
      type: 'obstacle',
      id: obstacle.id,
      start: screenToWorld(mx, my),
      origin: { x: obstacle.x, y: obstacle.y },
    };
    return;
  }

  emit('selectObstacle', null);
}

function onPointerMove(event) {
  if (!drag.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;

  if (drag.value.type === 'pan') {
    view.value.ox = drag.value.ox + (mx - drag.value.sx);
    view.value.oy = drag.value.oy + (my - drag.value.sy);
    draw();
    return;
  }

  const point = screenToWorld(mx, my);
  if (drag.value.type === 'robot') {
    emit('updateRobot', {
      x: drag.value.robot.x + (point.x - drag.value.start.x),
      y: drag.value.robot.y + (point.y - drag.value.start.y),
      theta: drag.value.robot.theta,
    });
  } else if (drag.value.type === 'obstacle') {
    emit('updateObstacle', {
      id: drag.value.id,
      x: drag.value.origin.x + (point.x - drag.value.start.x),
      y: drag.value.origin.y + (point.y - drag.value.start.y),
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
      单击障碍物可选中，拖拽机器人或障碍物可移动；`Alt + 拖拽` 平移视图，滚轮缩放，机器人上 `Shift + 滚轮`
      可旋转朝向。键盘 `W/S` 前进后退，`A/D` 或方向键左右转向。
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 440px;
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
  right: 12px;
  font-size: 11px;
  color: var(--muted);
  pointer-events: none;
}
</style>
