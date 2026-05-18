import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import * as XLSX from 'xlsx';
import { useWebSocket } from './useWebSocket.js';
import { translateSensorType } from '../lib/analytics.js';
import { validateObstaclePatch, validateScenePatch, validateSensorPatch, validateSpeed } from '../lib/validation.js';

const UI_STORAGE_KEY = 'rssim-ui-v2';

const DEFAULT_SCENE = {
  sceneId: 'scene_001',
  ambientLight: 0.35,
  scale: 1,
  robot: { x: 2, y: 3, theta: 0, vx: 0, vy: 0 },
  obstacles: [],
};

const DEFAULT_PRESET_SENSOR_IDS = {
  ultrasonic: 'ultrasonic_01',
  infrared: 'infrared_01',
  imu: 'imu_01',
};

export function useSimulationWorkspace() {
  const scene = shallowRef({ ...DEFAULT_SCENE });
  const sensors = ref([]);
  const running = ref(false);
  const paused = ref(false);
  const speed = ref(1);
  const logs = ref([]);
  const latestBySensor = shallowRef({});
  const chartSeries = ref({});
  const recordEnabled = ref(true);
  const recordRows = ref([]);
  const recordTotal = ref(0);
  const hideCharts = ref(false);
  const hideLogs = ref(false);
  const hideSensors = ref(false);
  const selectedObstacleId = ref(null);
  const toast = ref('');
  const activePresetId = ref('');
  let toastTimer = null;
  let sceneTimer = null;
  let obstacleFlushTimer = null;
  let pendingObstacle = null;
  let recordFlushTimer = null;
  const recordBuffer = [];
  let lastMoveAt = 0;
  const MOVE_STEP = 0.08;
  const TURN_STEP = 0.08;

  const selectedObstacle = computed(() => {
    const id = selectedObstacleId.value;
    if (!id) return null;
    return scene.value.obstacles?.find((item) => item.id === id) ?? null;
  });

  function showToast(message) {
    toast.value = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = '';
    }, 3600);
  }

  function dismissToast() {
    clearTimeout(toastTimer);
    toast.value = '';
  }

  function syncSelectionAfterScene() {
    const id = selectedObstacleId.value;
    if (id && !scene.value.obstacles?.some((item) => item.id === id)) {
      selectedObstacleId.value = null;
    }
  }

  function pushChartPoint(name, timestamp, value) {
    // 控制单条曲线长度，避免内存无限增长
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    if (!chartSeries.value[name]) chartSeries.value[name] = [];
    chartSeries.value[name].push({ t: timestamp, v: value });
    if (chartSeries.value[name].length > 400) chartSeries.value[name].shift();
    chartSeries.value = { ...chartSeries.value };
  }

  function sensorDisplayName(sensorId) {
    const sensor = sensors.value.find((item) => item.sensorId === sensorId);
    const label = sensor?.name != null && String(sensor.name).trim() !== '' ? String(sensor.name).trim() : null;
    return label || sensorId;
  }

  function chartLegendName(sensorId, sensorType, axis = '') {
    const base = sensorDisplayName(sensorId);
    if (sensorType === 'ultrasonic') return `${base} 测距`;
    if (sensorType === 'infrared') return `${base} 响应值`;
    if (sensorType === 'imu') {
      const axisMap = {
        gyroZ: '角速度 Z',
        accelX: '加速度 X',
        accelY: '加速度 Y',
      };
      return `${base} ${axisMap[axis] || '惯性数据'}`;
    }
    return `${base} ${translateSensorType(sensorType)}`;
  }

  function handleSensorData(payload, timestamp) {
    // 最新值用于 UI 实时显示；recordRows 用于分析与导出
    latestBySensor.value = { ...latestBySensor.value, [payload.sensorId]: payload };
    if (payload.sensorType === 'ultrasonic' || payload.sensorType === 'infrared') {
      pushChartPoint(chartLegendName(payload.sensorId, payload.sensorType), timestamp, Number(payload.value));
    } else if (payload.sensorType === 'imu') {
      pushChartPoint(chartLegendName(payload.sensorId, 'imu', 'gyroZ'), timestamp, payload.gyroZ);
      pushChartPoint(chartLegendName(payload.sensorId, 'imu', 'accelX'), timestamp, payload.accelX);
      pushChartPoint(chartLegendName(payload.sensorId, 'imu', 'accelY'), timestamp, payload.accelY);
    }

    if (!recordEnabled.value) return;

    const row = { t: timestamp, sensorId: payload.sensorId, sensorType: payload.sensorType };
    if (payload.sensorType === 'ultrasonic' || payload.sensorType === 'infrared') {
      row.value = payload.value;
      row.unit = payload.unit;
      row.status = payload.status;
    } else if (payload.sensorType === 'imu') {
      row.gyroZ = payload.gyroZ;
      row.accelX = payload.accelX;
      row.accelY = payload.accelY;
      row.roll = payload.roll;
      row.status = payload.status;
    }

    recordTotal.value += 1;
    recordBuffer.push(row);
    if (!recordFlushTimer) {
      recordFlushTimer = setTimeout(() => {
        const next = recordRows.value.concat(recordBuffer);
        recordBuffer.length = 0;
        if (next.length > 20000) next.splice(0, next.length - 20000);
        recordRows.value = next;
        recordFlushTimer = null;
      }, 120);
    }
  }

  function onMessage(message) {
    const { type, payload, timestamp } = message;
    const currentTimestamp = timestamp || Date.now();

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
        handleSensorData(payload, currentTimestamp);
        break;
      case 'simulation_log':
        logs.value = [...logs.value, message].slice(-500);
        break;
      case 'error':
        showToast(payload?.message || '服务端返回错误信息');
        logs.value = [
          ...logs.value,
          {
            type: 'simulation_log',
            timestamp: currentTimestamp,
            payload: { level: 'error', message: payload?.message || '错误', sensorId: null },
          },
        ].slice(-500);
        break;
      default:
        break;
    }
  }

  const { connected, reconnecting, lastError, send } = useWebSocket({ onMessage });

  function sendScene(partial) {
    // 场景更新做轻量节流，避免拖拽时高频刷写
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

  function nudgeRobot({ forward = 0, turn = 0, boost = false }) {
    const step = boost ? MOVE_STEP * 2 : MOVE_STEP;
    const turnStep = boost ? TURN_STEP * 1.6 : TURN_STEP;
    const now = performance.now();
    if (now - lastMoveAt < 30) return;
    lastMoveAt = now;

    const robot = scene.value.robot;
    const dx = Math.cos(robot.theta) * forward * step;
    const dy = Math.sin(robot.theta) * forward * step;
    onUpdateRobot({
      x: robot.x + dx,
      y: robot.y + dy,
      theta: robot.theta + turnStep * turn,
    });
  }

  function onUpdateObstacle({ id, x, y }) {
    const validation = validateObstaclePatch({ id, x, y });
    if (!validation.ok) {
      showToast(validation.message);
      return;
    }
    // 位置更新合并后再发送，避免抖动
    pendingObstacle = { id, x, y };
    clearTimeout(obstacleFlushTimer);
    obstacleFlushTimer = setTimeout(() => {
      if (pendingObstacle) {
        send({ type: 'obstacle_update', payload: pendingObstacle });
        pendingObstacle = null;
      }
    }, 48);
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

  function onSpeedChange(event) {
    if (event?.target) {
      speed.value = Number(event.target.value);
    }
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

  function setAmbient(event) {
    const value = Number(event.target.value);
    const validation = validateScenePatch({ ambientLight: value });
    if (!validation.ok) {
      showToast(validation.message);
      return;
    }
    scene.value = { ...scene.value, ambientLight: value };
    sendScene({ ambientLight: value });
  }

  function addObstacle() {
    send({
      type: 'obstacle_add',
      payload: { x: 4 + Math.random(), y: 4 + Math.random(), width: 1, height: 1, reflectivity: 0.75 },
    });
  }

  function resetScene() {
    if (!window.confirm('确定要重置当前场景、日志与采样记录吗？')) return;
    send({ type: 'reset_scene', payload: {} });
    chartSeries.value = {};
    recordRows.value = [];
    recordTotal.value = 0;
    latestBySensor.value = {};
    selectedObstacleId.value = null;
    activePresetId.value = '';
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

  function removeSensor(sensorId) {
    send({ type: 'sensor_remove', payload: { sensorId } });
  }

  function addSensor(sensorType) {
    send({
      type: 'sensor_add',
      payload: { sensorType, name: `新建${translateSensorType(sensorType)}` },
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
      showToast('当前筛选条件下没有可导出的日志。');
      return;
    }
    if (kind === 'csv') {
      const csv =
        'timestamp,level,message,sensorId\n' +
        rows
          .map((row) => {
            const payload = row.payload || {};
            const message = String(payload.message || '').replace(/"/g, '""');
            return `${row.timestamp},"${payload.level}","${message}","${payload.sensorId || ''}"`;
          })
          .join('\n');
      downloadBlob('logs-filtered.csv', csv, 'text/csv;charset=utf-8');
      return;
    }

    const text = rows
      .map((row) => {
        const payload = row.payload || {};
        return `${row.timestamp}\t${payload.level}\t${payload.message}\t${payload.sensorId || ''}`;
      })
      .join('\n');
    downloadBlob('logs-filtered.txt', text, 'text/plain;charset=utf-8');
  }

  function exportLogs(kind) {
    if (kind === 'csv') {
      const csv =
        'timestamp,level,message,sensorId\n' +
        logs.value
          .map((row) => {
            const payload = row.payload || {};
            const message = String(payload.message || '').replace(/"/g, '""');
            return `${row.timestamp},"${payload.level}","${message}","${payload.sensorId || ''}"`;
          })
          .join('\n');
      downloadBlob('logs.csv', csv, 'text/csv;charset=utf-8');
      return;
    }

    const text = logs.value
      .map((row) => {
        const payload = row.payload || {};
        return `${row.timestamp}\t${payload.level}\t${payload.message}\t${payload.sensorId || ''}`;
      })
      .join('\n');
    downloadBlob('logs.txt', text, 'text/plain;charset=utf-8');
  }

  function exportData(kind) {
    if (recordRows.value.length === 0) {
      showToast('当前还没有可导出的传感器记录数据。');
      return;
    }
    if (kind === 'csv') {
      const headers = ['t', 'sensorId', 'sensorType', 'value', 'unit', 'status', 'gyroZ', 'accelX', 'accelY', 'roll'];
      const csv =
        headers.join(',') +
        '\n' +
        recordRows.value
          .map((row) =>
            headers
              .map((header) => {
                const value = row[header];
                if (value === undefined || value === null) return '';
                return `"${String(value).replace(/"/g, '""')}"`;
              })
              .join(',')
          )
          .join('\n');
      downloadBlob('sensor_data.csv', csv, 'text/csv;charset=utf-8');
      return;
    }

    const sheet = XLSX.utils.json_to_sheet(recordRows.value);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'data');
    XLSX.writeFile(workbook, 'sensor_data.xlsx');
  }

  function downloadBlob(name, content, mime) {
    const blob = new Blob([content], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function buildPresetSensorPlan(presetSensors) {
    // 预设应用：默认传感器复用 ID，超出部分按需新增
    const plan = {
      updates: [],
      additions: [],
      removals: [],
    };

    const grouped = new Map();
    for (const sensor of presetSensors) {
      const list = grouped.get(sensor.sensorType) ?? [];
      list.push(sensor);
      grouped.set(sensor.sensorType, list);
    }

    for (const [sensorType, defaultId] of Object.entries(DEFAULT_PRESET_SENSOR_IDS)) {
      const targets = grouped.get(sensorType) ?? [];
      if (!targets.length) {
        plan.removals.push(defaultId);
        continue;
      }

      const [primary, ...rest] = targets;
      plan.updates.push({
        ...primary,
        sensorId: defaultId,
      });
      for (const sensor of rest) {
        plan.additions.push({
          ...sensor,
          sensorId: sensor.sensorId || `${sensorType}_${Math.random().toString(36).slice(2, 8)}`,
        });
      }
    }

    return plan;
  }

  function applyPreset(preset) {
    if (!preset) return;

    // 切换预设时清理本地状态，保持一致性
    activePresetId.value = preset.id;
    chartSeries.value = {};
    recordRows.value = [];
    recordTotal.value = 0;
    latestBySensor.value = {};
    selectedObstacleId.value = null;

    send({ type: 'reset_scene', payload: {} });
    send({ type: 'scene_update', payload: preset.scene });

    const plan = buildPresetSensorPlan(preset.sensors || []);
    for (const sensorId of plan.removals) {
      send({ type: 'sensor_remove', payload: { sensorId } });
    }
    for (const patch of plan.updates) {
      send({ type: 'sensor_update', payload: patch });
    }
    for (const sensor of plan.additions) {
      send({ type: 'sensor_add', payload: sensor });
    }

    showToast(`已应用预设场景：${preset.name || preset.title || '未命名预设'}`);
  }

  function applyScenePreset(preset) {
    if (!preset?.scene) return;
    activePresetId.value = preset.id || '';
    chartSeries.value = {};
    recordRows.value = [];
    recordTotal.value = 0;
    latestBySensor.value = {};
    selectedObstacleId.value = null;
    send({ type: 'scene_update', payload: preset.scene });
    showToast(`已应用场景预设：${preset.name || preset.title || '未命名场景'}`);
  }

  function applyRobotPreset(preset) {
    if (!preset) return;
    activePresetId.value = preset.id || '';
    if (preset.robot) {
      send({ type: 'scene_update', payload: { robot: preset.robot } });
    }
    if (Array.isArray(preset.sensors)) {
      for (const sensor of sensors.value) {
        send({ type: 'sensor_remove', payload: { sensorId: sensor.sensorId } });
      }
      for (const sensor of preset.sensors) {
        send({ type: 'sensor_add', payload: sensor });
      }
    }
    showToast(`已应用机器人预设：${preset.name || preset.title || '未命名机器人'}`);
  }

  const statusText = computed(() => {
    if (!connected.value) return reconnecting.value ? '重连中' : '未连接';
    if (!running.value) return '就绪';
    return paused.value ? '已暂停' : '运行中';
  });

  function onGlobalKeydown(event) {
    if (event.target.matches('input, textarea, select')) return;
    const key = event.key;
    const boost = event.shiftKey;
    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      event.preventDefault();
      nudgeRobot({ forward: 1, boost });
      return;
    }
    if (key === 'ArrowDown' || key === 's' || key === 'S') {
      event.preventDefault();
      nudgeRobot({ forward: -1, boost });
      return;
    }
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      event.preventDefault();
      nudgeRobot({ turn: 1, boost });
      return;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      event.preventDefault();
      nudgeRobot({ turn: -1, boost });
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectedObstacleId.value) {
        event.preventDefault();
        removeSelectedObstacle();
      }
    }
  }

  onMounted(() => {
    try {
      const raw = localStorage.getItem(UI_STORAGE_KEY);
      if (raw) {
        const state = JSON.parse(raw);
        if (typeof state.hideCharts === 'boolean') hideCharts.value = state.hideCharts;
        if (typeof state.hideLogs === 'boolean') hideLogs.value = state.hideLogs;
        if (typeof state.hideSensors === 'boolean') hideSensors.value = state.hideSensors;
      }
    } catch {
      /* ignore restore failure */
    }
    window.addEventListener('keydown', onGlobalKeydown);
  });

  onUnmounted(() => {
    clearTimeout(sceneTimer);
    clearTimeout(obstacleFlushTimer);
    clearTimeout(recordFlushTimer);
    clearTimeout(toastTimer);
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
      /* ignore persist failure */
    }
  });

  return {
    activePresetId,
    addObstacle,
    addSensor,
    applyPreset,
    applyRobotPreset,
    applyScenePreset,
    chartSeries,
    clearCharts,
    connected,
    dismissToast,
    exportData,
    exportFilteredLogs,
    exportLogs,
    hideCharts,
    hideLogs,
    hideSensors,
    lastError,
    latestBySensor,
    logs,
    onSelectObstacle,
    onSpeedChange,
    onUpdateObstacle,
    onUpdateRobot,
    patchSelectedObstacle,
    pause,
    paused,
    recordEnabled,
    recordRows,
    recordTotal,
    reconnecting,
    removeSelectedObstacle,
    removeSensor,
    resetScene,
    resetSensorDefaults,
    resetSensors,
    resume,
    running,
    scene,
    selectedObstacle,
    selectedObstacleId,
    sensors,
    setAmbient,
    showToast,
    speed,
    start,
    statusText,
    stop,
    toast,
    updateSensor,
  };
}
