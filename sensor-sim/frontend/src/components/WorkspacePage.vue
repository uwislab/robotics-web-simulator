<!-- 工作台页面 -->
<script setup>
import { computed } from 'vue';
import SceneCanvas from './SceneCanvas.vue';
import SensorPanel from './SensorPanel.vue';
import ChartPanel from './ChartPanel.vue';
import LogPanel from './LogPanel.vue';

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
  statusText: { type: String, default: 'Ready' },
  activePresetTitle: { type: String, default: 'Custom workspace' },
});

const emit = defineEmits([
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
    { label: 'Preset', value: props.activePresetTitle },
    { label: 'Obstacles', value: obstacleCount },
    { label: 'Enabled sensors', value: enabledSensors },
    { label: 'Chart channels', value: seriesCount },
  ];
});
</script>

<template>
  <section class="workspace-page">
    <div class="workspace-hero panel">
      <div class="hero-copy">
        <p class="eyebrow">Simulation Workspace</p>
        <h2>Operate the scene, adjust sensors, and collect live data in one place.</h2>
        <p class="hero-text">
          The workspace keeps the original real-time simulation flow, while the new project pages extend analysis,
          scenario management, and reporting around the same data stream.
        </p>
      </div>
      <div class="hero-side">
        <div class="status-chip" :class="{ live: connected }">
          <span class="status-dot" />
          <span>{{ statusText }}</span>
        </div>
        <button type="button" class="btn btn-primary" @click="$emit('jumpToPresets')">Open Scenario Library</button>
      </div>
    </div>

    <div class="quick-grid">
      <article v-for="card in quickStats" :key="card.label" class="quick-card panel">
        <span class="quick-label">{{ card.label }}</span>
        <strong class="quick-value">{{ card.value }}</strong>
      </article>
    </div>

    <div class="toolbar panel">
      <button type="button" class="btn btn-primary" :disabled="!connected || running" @click="$emit('start')">Start</button>
      <button type="button" class="btn" :disabled="!connected || !running || paused" @click="$emit('pause')">Pause</button>
      <button type="button" class="btn" :disabled="!connected || !running || !paused" @click="$emit('resume')">Resume</button>
      <button type="button" class="btn" :disabled="!connected || !running" @click="$emit('stop')">Stop</button>
      <label class="toolbar-field">
        Simulation speed
        <input :value="speed" type="range" min="0.25" max="3" step="0.25" :disabled="!connected" @input="$emit('speedChange', $event)" />
        <span>{{ speed }}x</span>
      </label>
      <label class="toolbar-field">
        Ambient light
        <input type="range" min="0" max="1" step="0.01" :value="scene.ambientLight" @input="$emit('setAmbient', $event)" />
      </label>
      <button type="button" class="btn" @click="$emit('addObstacle')">Add obstacle</button>
      <button type="button" class="btn" :disabled="!selectedObstacleId" @click="$emit('removeSelectedObstacle')">
        Remove selected obstacle
      </button>
      <button type="button" class="btn" @click="$emit('resetSensors')">Reset sensor states</button>
      <button type="button" class="btn" @click="$emit('resetScene')">Reset scene</button>
      <label class="toolbar-field compact">
        <input :checked="recordEnabled" type="checkbox" @change="$emit('toggleRecord', $event.target.checked)" />
        Record data
      </label>
      <button type="button" class="btn btn-ghost" @click="$emit('exportData', 'csv')">Export CSV</button>
      <button type="button" class="btn btn-ghost" @click="$emit('exportData', 'xlsx')">Export Excel</button>
      <button type="button" class="btn btn-ghost" @click="$emit('clearCharts')">Clear charts</button>
      <div class="toggles">
        <label><input :checked="hideSensors" type="checkbox" @change="$emit('toggleSensors', $event.target.checked)" /> Hide sensor panel</label>
        <label><input :checked="hideCharts" type="checkbox" @change="$emit('toggleCharts', $event.target.checked)" /> Hide charts</label>
        <label><input :checked="hideLogs" type="checkbox" @change="$emit('toggleLogs', $event.target.checked)" /> Hide logs</label>
      </div>
    </div>

    <main class="main-grid">
      <aside class="side-column">
        <SensorPanel
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
              <p class="eyebrow">2D Scene</p>
              <h3>Robot, obstacle, and sensing range editor</h3>
            </div>
            <div class="mini-note">Shift + wheel on robot rotates heading. Alt + drag pans the viewport.</div>
          </div>

          <div v-if="selectedObstacle" class="obstacle-bar">
            <span class="obstacle-title">Selected obstacle: {{ selectedObstacle.id }}</span>
            <label>
              Width
              <input
                type="number"
                step="0.1"
                min="0.2"
                :value="selectedObstacle.width"
                @change="$emit('patchSelectedObstacle', { width: +$event.target.value })"
              />
            </label>
            <label>
              Height
              <input
                type="number"
                step="0.1"
                min="0.2"
                :value="selectedObstacle.height"
                @change="$emit('patchSelectedObstacle', { height: +$event.target.value })"
              />
            </label>
            <label>
              Reflectivity
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                :value="selectedObstacle.reflectivity"
                @change="$emit('patchSelectedObstacle', { reflectivity: +$event.target.value })"
              />
            </label>
          </div>

          <SceneCanvas
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

        <ChartPanel :series="chartSeries" :hidden="hideCharts" @clear="$emit('clearCharts')" />
      </section>
    </main>

    <LogPanel :logs="logs" :hidden="hideLogs" @export="$emit('exportLogs', $event)" @export-filtered="$emit('exportFilteredLogs', $event)" />
  </section>
</template>

<style scoped>
.workspace-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-hero {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
}

.hero-copy {
  max-width: 820px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.workspace-hero h2,
.canvas-head h3 {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: -0.02em;
}

.hero-text {
  margin: 10px 0 0;
  color: var(--muted);
  max-width: 64ch;
  line-height: 1.6;
}

.hero-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  color: var(--muted);
}

.status-chip.live {
  color: var(--text);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--danger);
}

.status-chip.live .status-dot {
  background: var(--accent);
  box-shadow: 0 0 16px rgba(61, 214, 198, 0.55);
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.quick-card {
  padding: 14px 16px;
}

.quick-label {
  display: block;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.quick-value {
  display: block;
  font-size: 1.2rem;
  word-break: break-word;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
}

.toolbar-field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.86rem;
  color: var(--muted);
}

.toolbar-field.compact {
  gap: 6px;
}

.toolbar-field input[type='range'] {
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

.main-grid {
  display: grid;
  grid-template-columns: minmax(320px, 380px) 1fr;
  gap: 16px;
  align-items: start;
}

.side-column,
.center-column {
  min-width: 0;
}

.center-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.canvas-card {
  padding: 14px;
}

.canvas-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
}

.mini-note {
  max-width: 260px;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.5;
  text-align: right;
}

.obstacle-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  padding: 10px;
  margin-bottom: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.obstacle-title {
  color: var(--warn);
  font-weight: 600;
}

.obstacle-bar label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: var(--muted);
}

.obstacle-bar input {
  width: 5.2rem;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--text);
}

@media (max-width: 1180px) {
  .quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .main-grid {
    grid-template-columns: 1fr;
  }

  .workspace-hero,
  .canvas-head {
    flex-direction: column;
  }

  .hero-side {
    align-items: flex-start;
  }

  .mini-note {
    text-align: left;
  }
}

@media (max-width: 720px) {
  .quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
