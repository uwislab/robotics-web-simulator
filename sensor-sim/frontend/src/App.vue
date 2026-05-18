<script setup>
// 主页面逻辑（实时仿真工作台）
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue';
import * as XLSX from 'xlsx';
import { useWebSocket } from './composables/useWebSocket.js';
import { validateObstaclePatch, validateScenePatch, validateSensorPatch, validateSpeed } from './lib/validation.js';
import SceneCanvas from './components/SceneCanvas.vue';
import SensorPanel from './components/SensorPanel.vue';
import ChartPanel from './components/ChartPanel.vue';
import LogPanel from './components/LogPanel.vue';

const scene = shallowRef({
  sceneId: 'scene_001',
  ambientLight: 0.35,
  scale: 1,
  robot: { x: 2, y: 3, theta: 0, vx: 0, vy: 0 },
  obstacles: [],
});

const sensors = ref([]);
const running = ref(false);
const paused = ref(false);
const speed = ref(1);
const logs = ref([]);
const latestBySensor = shallowRef({});
const chartSeries = ref({});
const recordEnabled = ref(true);
const recordRows = ref([]);

const hideCharts = ref(false);
const hideLogs = ref(false);
const hideSensors = ref(false);

const selectedObstacleId = ref(null);
const toast = ref('');
let toastTimer = null;

const UI_STORAGE_KEY = 'rssim-ui-v1';

const selectedObstacle = computed(() => {
  const id = selectedObstacleId.value;
  if (!id) return null;
  return scene.value.obstacles?.find((o) => o.id === id) ?? null;
});

function showToast(msg) {
  toast.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 4200);
}

let sceneTimer = null;
let obstFlush = null;
let pendingObstacle = null;
function sendScene(partial) {
  clearTimeout(sceneTimer);
  sceneTimer = setTimeout(() => {
    send({ type: 'scene_update', payload: partial });
  }, 80);
}

function onUpdateRobot(robot) {
  const validation = validateScenePatch({ robot });
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }
  scene.value = {
    ...scene.value,
    robot: { ...scene.value.robot, ...robot },
  };
  sendScene({ robot: scene.value.robot });
}

function onUpdateObstacle({ id, x, y }) {
  const validation = validateObstaclePatch({ id, x, y });
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }
  pendingObstacle = { id, x, y };
  clearTimeout(obstFlush);
  obstFlush = setTimeout(() => {
    if (pendingObstacle) {
      send({ type: 'obstacle_update', payload: pendingObstacle });
      pendingObstacle = null;
    }
  }, 48);
}

function pushChartPoint(name, t, v) {
  if (!chartSeries.value[name]) chartSeries.value[name] = [];
  chartSeries.value[name].push({ t, v });
  if (chartSeries.value[name].length > 400) chartSeries.value[name].shift();
  chartSeries.value = { ...chartSeries.value };
}

/** 图例用中文；优先使用传感器面板中的名称 */
function sensorDisplayName(sensorId) {
  const s = sensors.value.find((x) => x.sensorId === sensorId);
  const n = s?.name != null && String(s.name).trim() !== '' ? String(s.name).trim() : null;
  return n || sensorId;
}

function chartLegendName(sensorId, sensorType, imuAxis) {
  const base = sensorDisplayName(sensorId);
  if (sensorType === 'ultrasonic') return `${base} · 超声波`;
  if (sensorType === 'infrared') return `${base} · 红外`;
  if (sensorType === 'imu') {
    if (imuAxis === 'gyroZ') return `${base} · 角速度 Z`;
    if (imuAxis === 'accelX') return `${base} · 加速度 X`;
    if (imuAxis === 'accelY') return `${base} · 加速度 Y`;
  }
  return `${base} · ${sensorType}`;
}

function handleSensorData(p, ts) {
  latestBySensor.value = { ...latestBySensor.value, [p.sensorId]: p };
  if (!recordEnabled.value) return;
  const row = { t: ts, sensorId: p.sensorId, sensorType: p.sensorType };
  if (p.sensorType === 'ultrasonic' || p.sensorType === 'infrared') {
    row.value = p.value;
    row.unit = p.unit;
    row.status = p.status;
    pushChartPoint(chartLegendName(p.sensorId, p.sensorType), ts, Number(p.value));
  } else if (p.sensorType === 'imu') {
    row.gyroZ = p.gyroZ;
    row.accelX = p.accelX;
    row.accelY = p.accelY;
    row.roll = p.roll;
    pushChartPoint(chartLegendName(p.sensorId, 'imu', 'gyroZ'), ts, p.gyroZ);
    pushChartPoint(chartLegendName(p.sensorId, 'imu', 'accelX'), ts, p.accelX);
    pushChartPoint(chartLegendName(p.sensorId, 'imu', 'accelY'), ts, p.accelY);
  }
  recordRows.value.push(row);
  if (recordRows.value.length > 20000) recordRows.value.shift();
}

function onMessage(msg) {
  const { type, payload, timestamp } = msg;
  const ts = timestamp || Date.now();
  switch (type) {
    case 'state_sync':
      if (payload.scene) {
        scene.value = payload.scene;
        syncSelectionAfterScene();
      }
      if (payload.sensors) sensors.value = payload.sensors;
      if (payload.running !== undefined) running.value = payload.running;
      if (payload.paused !== undefined) paused.value = payload.paused;
      if (payload.speed !== undefined) speed.value = payload.speed;
      if (payload.logs) logs.value = payload.logs;
      break;
    case 'scene_sync':
      scene.value = payload;
      syncSelectionAfterScene();
      break;
    case 'sensor_list':
      sensors.value = payload.sensors;
      break;
    case 'simulation_status':
      if (payload.running !== undefined) running.value = payload.running;
      if (payload.paused !== undefined) paused.value = payload.paused;
      if (payload.speed !== undefined) speed.value = payload.speed;
      break;
    case 'sensor_data':
      handleSensorData(payload, ts);
      break;
    case 'simulation_log':
      logs.value = [...logs.value, msg].slice(-500);
      break;
    case 'error':
      showToast(payload?.message || '服务器返回错误');
      logs.value = [
        ...logs.value,
        { type: 'simulation_log', timestamp: ts, payload: { level: 'error', message: payload?.message || '错误', sensorId: null } },
      ].slice(-500);
      break;
    default:
      break;
  }
}

const { connected, reconnecting, send } = useWebSocket({ onMessage });

function syncSelectionAfterScene() {
  const id = selectedObstacleId.value;
  if (id && !scene.value.obstacles?.some((o) => o.id === id)) selectedObstacleId.value = null;
}

function onSelectObstacle(id) {
  selectedObstacleId.value = id;
}

function removeSelectedObstacle() {
  const id = selectedObstacleId.value;
  if (!id) return;
  send({ type: 'obstacle_remove', payload: { id } });
  selectedObstacleId.value = null;
}

function patchSelectedObstacle(patch) {
  const id = selectedObstacleId.value;
  if (!id) return;
  const validation = validateObstaclePatch({ id, ...patch });
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }
  send({ type: 'obstacle_update', payload: { id, ...patch } });
}

function onSpeedChange() {
  if (!connected.value) return;
  const validation = validateSpeed(speed.value);
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }
  send({ type: 'simulation_set_speed', payload: { speed: speed.value } });
}

function start() {
  send({ type: 'simulation_start', payload: { sceneId: scene.value.sceneId, speed: speed.value } });
}
function pause() {
  send({ type: 'simulation_pause', payload: {} });
}
function resume() {
  send({ type: 'simulation_resume', payload: {} });
}
function stop() {
  send({ type: 'simulation_stop', payload: {} });
}

function setAmbient(e) {
  const v = +e.target.value;
  const validation = validateScenePatch({ ambientLight: v });
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }
  scene.value = { ...scene.value, ambientLight: v };
  sendScene({ ambientLight: v });
}

function addObstacle() {
  send({
    type: 'obstacle_add',
    payload: { x: 4 + Math.random(), y: 4 + Math.random(), width: 1, height: 1, reflectivity: 0.75 },
  });
}

function resetScene() {
  if (!confirm('确定重置场景与仿真？')) return;
  send({ type: 'reset_scene', payload: {} });
  chartSeries.value = {};
  recordRows.value = [];
  latestBySensor.value = {};
  selectedObstacleId.value = null;
}

function resetSensors() {
  send({ type: 'reset_sensors', payload: {} });
}

function updateSensor(patch) {
  const sensor = sensors.value.find((item) => item.sensorId === patch.sensorId);
  const validation = validateSensorPatch(sensor, patch);
  if (!validation.ok) {
    showToast(validation.message);
    return;
  }
  send({ type: 'sensor_update', payload: patch });
}

function removeSensor(id) {
  send({ type: 'sensor_remove', payload: { sensorId: id } });
}

function addSensor(type) {
  send({
    type: 'sensor_add',
    payload: { sensorType: type, name: `新传感器-${type}` },
  });
}

function resetSensorDefaults(sensorId) {
  send({ type: 'sensor_reset_defaults', payload: { sensorId } });
}

function clearCharts() {
  chartSeries.value = {};
}

function exportFilteredLogs({ kind, rows }) {
  if (!rows.length) {
    showToast('当前筛选下没有日志');
    return;
  }
  if (kind === 'csv') {
    const csv =
      'timestamp,level,message,sensorId\n' +
      rows
        .map((l) => {
          const p = l.payload || {};
          const msg = String(p.message || '').replace(/"/g, '""');
          return `${l.timestamp},"${p.level}","${msg}","${p.sensorId || ''}"`;
        })
        .join('\n');
    downloadBlob('logs-filtered.csv', csv, 'text/csv;charset=utf-8');
  } else {
    const lines = rows.map((l) => {
      const p = l.payload || {};
      return `${l.timestamp}\t${p.level}\t${p.message}\t${p.sensorId || ''}`;
    });
    downloadBlob('logs-filtered.txt', lines.join('\n'), 'text/plain;charset=utf-8');
  }
}

function exportLogs(kind) {
  const lines = logs.value.map((l) => {
    const p = l.payload || {};
    return `${l.timestamp}\t${p.level}\t${p.message}\t${p.sensorId || ''}`;
  });
  if (kind === 'csv') {
    const csv = 'timestamp,level,message,sensorId\n' + logs.value.map((l) => {
      const p = l.payload || {};
      const msg = String(p.message || '').replace(/"/g, '""');
      return `${l.timestamp},"${p.level}","${msg}","${p.sensorId || ''}"`;
    }).join('\n');
    downloadBlob('logs.csv', csv, 'text/csv;charset=utf-8');
  } else {
    downloadBlob('logs.txt', lines.join('\n'), 'text/plain;charset=utf-8');
  }
}

function exportData(kind) {
  if (recordRows.value.length === 0) {
    alert('暂无记录数据');
    return;
  }
  if (kind === 'csv') {
    const headers = ['t', 'sensorId', 'sensorType', 'value', 'unit', 'status', 'gyroZ', 'accelX', 'accelY'];
    const csv =
      headers.join(',') +
      '\n' +
      recordRows.value
        .map((r) =>
          headers
            .map((h) => {
              const v = r[h];
              if (v === undefined || v === null) return '';
              const s = String(v).replace(/"/g, '""');
              return `"${s}"`;
            })
            .join(',')
        )
        .join('\n');
    downloadBlob('sensor_data.csv', csv, 'text/csv;charset=utf-8');
  } else {
    const ws = XLSX.utils.json_to_sheet(recordRows.value);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'data');
    XLSX.writeFile(wb, 'sensor_data.xlsx');
  }
}

function downloadBlob(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const statusText = computed(() => {
  if (!connected.value) return reconnecting.value ? '重连中…' : '未连接';
  if (!running.value) return '就绪';
  return paused.value ? '已暂停' : '运行中';
});

function onGlobalKeydown(e) {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedObstacleId.value) {
      e.preventDefault();
      removeSelectedObstacle();
    }
  }
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (raw) {
      const u = JSON.parse(raw);
      if (typeof u.hideCharts === 'boolean') hideCharts.value = u.hideCharts;
      if (typeof u.hideLogs === 'boolean') hideLogs.value = u.hideLogs;
      if (typeof u.hideSensors === 'boolean') hideSensors.value = u.hideSensors;
    }
  } catch {
    /* ignore */
  }
  window.addEventListener('keydown', onGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
});

watch([hideCharts, hideLogs, hideSensors], () => {
  try {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        hideCharts: hideCharts.value,
        hideLogs: hideLogs.value,
        hideSensors: hideSensors.value,
      })
    );
  } catch {
    /* ignore */
  }
});
</script>

<template>
  <div class="app">
    <header class="top">
      <div class="brand">
        <span class="logo">◇</span>
        <div>
          <h1>机器人传感器仿真子系统</h1>
          <p class="sub">超声波 · 红外 · 陀螺仪/加速度计 · WebSocket 实时仿真</p>
        </div>
      </div>
      <div class="status">
        <span class="dot" :class="{ on: connected }" />
        <span>{{ statusText }}</span>
      </div>
    </header>

    <div class="toolbar panel">
      <button type="button" class="btn btn-primary" :disabled="!connected || running" @click="start">开始</button>
      <button type="button" class="btn" :disabled="!connected || !running || paused" @click="pause">暂停</button>
      <button type="button" class="btn" :disabled="!connected || !running || !paused" @click="resume">继续</button>
      <button type="button" class="btn" :disabled="!connected || !running" @click="stop">停止</button>
      <label class="lbl">
        仿真速度
        <input
          v-model.number="speed"
          type="range"
          min="0.25"
          max="3"
          step="0.25"
          :disabled="!connected || !running"
          @input="onSpeedChange"
        />
        <span>{{ speed }}×</span>
      </label>
      <label class="lbl">
        环境光
        <input type="range" min="0" max="1" step="0.01" :value="scene.ambientLight" @input="setAmbient" />
      </label>
      <button type="button" class="btn" @click="addObstacle">添加障碍物</button>
      <button type="button" class="btn" :disabled="!selectedObstacleId" @click="removeSelectedObstacle">删除选中障碍物</button>
      <button type="button" class="btn" @click="resetSensors">重置传感器状态</button>
      <button type="button" class="btn" @click="resetScene">重置场景</button>
      <label class="lbl"><input v-model="recordEnabled" type="checkbox" /> 记录数据</label>
      <button type="button" class="btn btn-ghost" @click="exportData('csv')">导出 CSV</button>
      <button type="button" class="btn btn-ghost" @click="exportData('xlsx')">导出 Excel</button>
      <button type="button" class="btn btn-ghost" @click="clearCharts">清空曲线</button>
      <div class="toggles">
        <label><input v-model="hideSensors" type="checkbox" /> 隐藏传感器面板</label>
        <label><input v-model="hideCharts" type="checkbox" /> 隐藏图表</label>
        <label><input v-model="hideLogs" type="checkbox" /> 隐藏日志</label>
      </div>
    </div>

    <main class="main">
      <aside class="side">
        <SensorPanel
          :sensors="sensors"
          :hidden="hideSensors"
          @update="updateSensor"
          @remove="removeSensor"
          @add="addSensor"
          @reset-defaults="resetSensorDefaults"
        />
      </aside>
      <section class="center">
        <div class="canvas-wrap panel">
          <div class="canvas-title">2D 场景 · 感知范围</div>
          <div v-if="selectedObstacle" class="ob-bar">
            <span class="ob-label">选中 {{ selectedObstacle.id }}</span>
            <label>宽 <input type="number" step="0.1" min="0.2" :value="selectedObstacle.width" @change="patchSelectedObstacle({ width: +$event.target.value })" /></label>
            <label>高 <input type="number" step="0.1" min="0.2" :value="selectedObstacle.height" @change="patchSelectedObstacle({ height: +$event.target.value })" /></label>
            <label>反射率 <input type="number" step="0.05" min="0" max="1" :value="selectedObstacle.reflectivity" @change="patchSelectedObstacle({ reflectivity: +$event.target.value })" /></label>
          </div>
          <SceneCanvas
            :scene="scene"
            :sensors="sensors"
            :latest-by-sensor="latestBySensor"
            :running="running && !paused"
            :selected-obstacle-id="selectedObstacleId"
            @update-robot="onUpdateRobot"
            @update-obstacle="onUpdateObstacle"
            @select-obstacle="onSelectObstacle"
          />
        </div>
        <ChartPanel :series="chartSeries" :hidden="hideCharts" @clear="clearCharts" />
      </section>
    </main>

    <LogPanel :logs="logs" :hidden="hideLogs" @export="exportLogs" @export-filtered="exportFilteredLogs" />

    <Transition name="toast-fade">
      <div v-if="toast" class="toast" role="status">{{ toast }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.app {
  max-width: 1480px;
  margin: 0 auto;
  padding: 20px 22px 32px;
}

.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 16px;
}

.brand {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.logo {
  font-size: 28px;
  color: var(--accent);
  line-height: 1;
  margin-top: 4px;
}

h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sub {
  margin: 6px 0 0;
  font-size: 0.9rem;
  color: var(--muted);
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  color: var(--muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}
.dot.on {
  background: var(--accent);
  box-shadow: 0 0 10px rgba(61, 214, 198, 0.6);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  margin-bottom: 14px;
}

.lbl {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--muted);
}

.lbl input[type='range'] {
  width: 100px;
}

.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--muted);
}

.main {
  display: grid;
  grid-template-columns: minmax(300px, 380px) 1fr;
  gap: 14px;
  align-items: start;
}

.side {
  min-width: 0;
}

.center {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.canvas-wrap {
  padding: 12px 14px 14px;
}

.canvas-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-bottom: 8px;
}

@media (max-width: 1100px) {
  .main {
    grid-template-columns: 1fr;
  }
}

.ob-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border: 1px solid var(--border);
  font-size: 0.8rem;
  color: var(--muted);
}
.ob-bar label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ob-bar input {
  width: 4.5rem;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 6px;
  color: var(--text);
  font-size: 12px;
}
.ob-label {
  color: var(--warn);
  font-weight: 600;
}

.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 10px 18px;
  border-radius: 10px;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 0.9rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  max-width: min(520px, 92vw);
}
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
