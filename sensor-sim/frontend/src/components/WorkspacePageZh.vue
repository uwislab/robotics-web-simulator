<script setup>
import { computed } from 'vue';
import SceneCanvasZh from './SceneCanvasZh.vue';
import SensorPanelZh from './SensorPanelZh.vue';
import ChartPanelZh from './ChartPanelZh.vue';
import LogPanelZh from './LogPanelZh.vue';

const props = defineProps({
  scene: { type: Object, required: true },
  sensors: { type: Array, default: () => [] },
  latestBySensor: { type: Object, default: () => ({}) },
  running: { type: Boolean, default: false },
  paused: { type: Boolean, default: false },
  speed: { type: Number, default: 1 },
  selectedObstacle: { type: Object, default: null },
  selectedObstacleId: { type: String, default: null },
  chartSeries: { type: Object, default: () => ({}) },
  logs: { type: Array, default: () => [] },
  hideCharts: { type: Boolean, default: false },
  hideLogs: { type: Boolean, default: false },
  hideSensors: { type: Boolean, default: false },
  recordEnabled: { type: Boolean, default: true },
  connected: { type: Boolean, default: false },
  statusText: { type: String, default: '就绪' },
  activePresetTitle: { type: String, default: '自定义工作区' },
});

defineEmits([
  'updateRobot',
  'updateObstacle',
  'selectObstacle',
  'patchSelectedObstacle',
  'removeSelectedObstacle',
  'start',
  'pause',
  'resume',
  'stop',
  'speedChange',
  'setAmbient',
  'addObstacle',
  'resetSensors',
  'resetScene',
  'toggleRecord',
  'exportData',
  'clearCharts',
  'toggleCharts',
  'toggleLogs',
  'toggleSensors',
  'updateSensor',
  'removeSensor',
  'addSensor',
  'resetSensorDefaults',
  'exportLogs',
  'exportFilteredLogs',
  'jumpToPresets',
]);

const quickStats = computed(() => {
  const obstacleCount = props.scene.obstacles?.length ?? 0;
  const enabledSensors = props.sensors.filter((sensor) => sensor.enabled).length;
  const seriesCount = Object.keys(props.chartSeries || {}).length;
  return [
    { label: '当前预设', value: props.activePresetTitle },
    { label: '障碍物数量', value: obstacleCount },
    { label: '启用传感器', value: enabledSensors },
    { label: '曲线通道数', value: seriesCount },
  ];
});

const infraredSeries = computed(() => {
  const entries = Object.entries(props.chartSeries || {});
  const filtered = entries.filter(([name]) => name.includes('红外') || name.includes('响应值'));
  return Object.fromEntries(filtered);
});

const workspaceNotes = [
  '工作台负责场景编辑、运行控制和实时观察，是平台的核心操作页面。',
  '建议先在“场景库”选择预设，再回到本页进行拖拽、启动和参数调整。',
  '开启数据记录后，采样结果会同步进入分析页，便于观察趋势与异常。',
];
</script>

<template>
  <section class="workspace-page">
    <div class="workspace-hero panel">
      <div class="hero-copy">
        <p class="eyebrow">仿真实验工作台</p>
        <h2>在同一页面完成场景编辑、传感器调参、运行控制与实时观测。</h2>
        <p class="hero-text">
          该页面保留完整的实时仿真操作流程，并通过图表、日志和场景编辑器将实验过程串联起来，便于持续调试和结果复盘。
        </p>
      </div>
      <div class="hero-side">
        <div class="status-chip" :class="{ live: connected }">
          <span class="status-dot" />
          <span>{{ statusText }}</span>
        </div>
        <button type="button" class="btn btn-primary" @click="$emit('jumpToPresets')">打开场景库</button>
      </div>
    </div>

    <div class="quick-grid">
      <article v-for="card in quickStats" :key="card.label" class="quick-card panel">
        <span class="quick-label">{{ card.label }}</span>
        <strong class="quick-value">{{ card.value }}</strong>
      </article>
    </div>

    <div class="note-panel panel">
      <p class="panel-title" style="margin: 0 0 10px">页面说明</p>
      <div class="note-list">
        <span v-for="item in workspaceNotes" :key="item">{{ item }}</span>
      </div>
    </div>

    <div class="toolbar panel">
      <button type="button" class="btn btn-primary" :disabled="!connected || running" @click="$emit('start')">启动仿真</button>
      <button type="button" class="btn" :disabled="!connected || !running || paused" @click="$emit('pause')">暂停</button>
      <button type="button" class="btn" :disabled="!connected || !running || !paused" @click="$emit('resume')">继续</button>
      <button type="button" class="btn" :disabled="!connected || !running" @click="$emit('stop')">停止</button>
      <label class="toolbar-field">
        仿真速度
        <input :value="speed" type="range" min="0.25" max="3" step="0.25" :disabled="!connected" @input="$emit('speedChange', $event)" />
        <span>{{ speed }} 倍</span>
      </label>
      <label class="toolbar-field">
        环境光强
        <input type="range" min="0" max="1" step="0.01" :value="scene.ambientLight" @input="$emit('setAmbient', $event)" />
      </label>
      <button type="button" class="btn" @click="$emit('addObstacle')">新增障碍物</button>
      <button type="button" class="btn" :disabled="!selectedObstacleId" @click="$emit('removeSelectedObstacle')">删除选中障碍物</button>
      <button type="button" class="btn" @click="$emit('resetSensors')">重置传感器状态</button>
      <button type="button" class="btn" @click="$emit('resetScene')">重置场景</button>
      <label class="toolbar-field compact">
        <input :checked="recordEnabled" type="checkbox" @change="$emit('toggleRecord', $event.target.checked)" />
        开启数据记录
      </label>
      <button type="button" class="btn btn-ghost" @click="$emit('exportData', 'csv')">导出 CSV</button>
      <button type="button" class="btn btn-ghost" @click="$emit('exportData', 'xlsx')">导出 Excel</button>
      <button type="button" class="btn btn-ghost" @click="$emit('clearCharts')">清空曲线</button>
      <div class="toggles">
        <label><input :checked="hideSensors" type="checkbox" @change="$emit('toggleSensors', $event.target.checked)" /> 隐藏传感器面板</label>
        <label><input :checked="hideCharts" type="checkbox" @change="$emit('toggleCharts', $event.target.checked)" /> 隐藏曲线</label>
        <label><input :checked="hideLogs" type="checkbox" @change="$emit('toggleLogs', $event.target.checked)" /> 隐藏日志</label>
      </div>
    </div>

    <main class="main-grid">
      <aside class="side-column">
        <SensorPanelZh
          :sensors="sensors"
          :hidden="hideSensors"
          @update="$emit('updateSensor', $event)"
          @remove="$emit('removeSensor', $event)"
          @add="$emit('addSensor', $event)"
          @reset-defaults="$emit('resetSensorDefaults', $event)"
        />
      </aside>

      <section class="center-column">
        <div class="canvas-card panel">
          <div class="canvas-head">
            <div>
              <p class="eyebrow">二维场景编辑器</p>
              <h3>拖拽机器人与障碍物，直观调整实验布局。</h3>
            </div>
            <div class="mini-note">
              左键拖拽对象即可移动；滚轮缩放画布，`Alt + 拖拽` 平移视图，机器人上 `Shift + 滚轮` 可旋转朝向。
            </div>
          </div>

          <div v-if="selectedObstacle" class="obstacle-bar">
            <span class="obstacle-title">当前选中：{{ selectedObstacle.id }}</span>
            <label>宽度<input type="number" step="0.1" min="0.2" :value="selectedObstacle.width" @change="$emit('patchSelectedObstacle', { width: +$event.target.value })" /></label>
            <label>高度<input type="number" step="0.1" min="0.2" :value="selectedObstacle.height" @change="$emit('patchSelectedObstacle', { height: +$event.target.value })" /></label>
            <label>反射率<input type="number" step="0.05" min="0" max="1" :value="selectedObstacle.reflectivity" @change="$emit('patchSelectedObstacle', { reflectivity: +$event.target.value })" /></label>
          </div>

          <SceneCanvasZh
            :scene="scene"
            :sensors="sensors"
            :latest-by-sensor="latestBySensor"
            :running="running && !paused"
            :selected-obstacle-id="selectedObstacleId"
            @update-robot="$emit('updateRobot', $event)"
            @update-obstacle="$emit('updateObstacle', $event)"
            @select-obstacle="$emit('selectObstacle', $event)"
          />
        </div>

        <ChartPanelZh
          :series="chartSeries"
          :hidden="hideCharts"
          title="全量传感器曲线"
          description="多传感器同图对比，适合观察趋势与联动关系。"
          @clear="$emit('clearCharts')"
        />

        <ChartPanelZh
          :series="infraredSeries"
          :hidden="hideCharts"
          title="红外专用曲线"
          description="红外数据单独展示，避免与其他量纲混叠。"
          @clear="$emit('clearCharts')"
        />
      </section>
    </main>

    <LogPanelZh :logs="logs" :hidden="hideLogs" @export="$emit('exportLogs', $event)" @export-filtered="$emit('exportFilteredLogs', $event)" />
  </section>
</template>

<style scoped>
.workspace-page { display: flex; flex-direction: column; gap: 16px; }
.workspace-hero { display: flex; justify-content: space-between; gap: 20px; padding: 18px 20px; }
.hero-copy { max-width: 820px; }
.eyebrow { margin: 0 0 8px; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.workspace-hero h2, .canvas-head h3 { margin: 0; font-size: 1.4rem; letter-spacing: -0.02em; }
.hero-text { margin: 10px 0 0; color: var(--muted); max-width: 64ch; line-height: 1.6; }
.hero-side { display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; gap: 12px; }
.status-chip { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 999px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); color: var(--muted); }
.status-chip.live { color: var(--text); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }
.status-chip.live .status-dot { background: var(--accent); box-shadow: 0 0 16px rgba(61,214,198,0.55); }
.quick-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.quick-card, .note-panel { padding: 14px 16px; }
.quick-label { display: block; font-size: 0.74rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
.quick-value { display: block; font-size: 1.2rem; word-break: break-word; }
.note-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; color: var(--muted); font-size: 0.86rem; line-height: 1.6; }
.note-list span { padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: rgba(255,255,255,0.03); }
.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 12px 14px; }
.toolbar-field { display: flex; align-items: center; gap: 8px; font-size: 0.86rem; color: var(--muted); }
.toolbar-field.compact { gap: 6px; }
.toolbar-field input[type='range'] { width: 100px; }
.toggles { display: flex; flex-wrap: wrap; gap: 12px; margin-left: auto; font-size: 0.8rem; color: var(--muted); }
.main-grid { display: grid; grid-template-columns: minmax(320px, 380px) 1fr; gap: 16px; align-items: start; }
.side-column, .center-column { min-width: 0; }
.center-column { display: flex; flex-direction: column; gap: 12px; }
.canvas-card { padding: 14px; }
.canvas-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
.mini-note { max-width: 280px; font-size: 0.82rem; color: var(--muted); line-height: 1.5; text-align: right; }
.obstacle-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 10px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; }
.obstacle-title { color: var(--warn); font-weight: 600; }
.obstacle-bar label { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: var(--muted); }
.obstacle-bar input { width: 5.2rem; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; color: var(--text); }
@media (max-width: 1180px) {
  .quick-grid, .note-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .main-grid { grid-template-columns: 1fr; }
  .workspace-hero, .canvas-head { flex-direction: column; }
  .hero-side { align-items: flex-start; }
  .mini-note { text-align: left; }
}
@media (max-width: 720px) {
  .quick-grid, .note-list { grid-template-columns: 1fr; }
}
</style>
