<script setup>
// 中文版本主页面
import { computed, ref, watch } from 'vue';
import { useSimulationWorkspace } from './composables/useSimulationWorkspace.js';
import { useAccount } from './composables/useAccount.js';
import WorkspacePageZh from './components/WorkspacePageZh.vue';
import ScenarioLibraryPageZh from './components/ScenarioLibraryPageZh.vue';
import AnalysisPageZh from './components/AnalysisPageZh.vue';
import SystemGuidePageZh from './components/SystemGuidePageZh.vue';
import AccountCenterPageZh from './components/AccountCenterPageZh.vue';
import { getPresetById } from './lib/presetLibrary.js';

const SHELL_STORAGE_KEY = 'rssim-shell-v2';

const pages = [
  { id: 'workspace', label: '工作台' },
  { id: 'scenarios', label: '场景库' },
  { id: 'analysis', label: '数据分析' },
  { id: 'account', label: '账号中心' },
  { id: 'guide', label: '使用说明' },
];

const workspace = useSimulationWorkspace();
const account = useAccount();
const activePage = ref('workspace');

try {
  const raw = localStorage.getItem(SHELL_STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (typeof parsed.activePage === 'string') {
      activePage.value = parsed.activePage === 'reports' ? 'guide' : parsed.activePage;
    }
  }
} catch {
  /* ignore */
}

watch(activePage, (value) => {
  try {
    localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify({ activePage: value }));
  } catch {
    /* ignore */
  }
});

const selectedPreset = computed(() => getPresetById(workspace.activePresetId.value));
const activePresetTitle = computed(() => selectedPreset.value?.title || '自定义工作区');

const topStats = computed(() => [
  { label: '连接状态', value: workspace.statusText.value },
  { label: '当前预设', value: activePresetTitle.value },
  { label: '传感器数量', value: workspace.sensors.value.length },
  { label: '采样记录数', value: workspace.recordTotal.value },
]);

function goTo(pageId) {
  activePage.value = pageId;
}
</script>

<template>
  <div class="shell">
    <header class="shell-header panel">
      <div class="brand">
        <div class="brand-mark">RS</div>
        <div>
          <p class="eyebrow">机器人传感器仿真平台</p>
          <h1>机器人传感器仿真与实验分析系统</h1>
          <p class="sub">平台覆盖工作台控制、场景预设、数据分析与使用说明等页面，适合进行传感器调试、场景验证和运行复盘。</p>
        </div>
      </div>

      <div class="header-side">
        <div class="status-box">
          <span class="status-dot" :class="{ live: workspace.connected.value }" />
          <span>{{ workspace.statusText.value }}</span>
        </div>
        <nav class="nav">
          <button v-for="page in pages" :key="page.id" type="button" class="nav-btn" :class="{ active: activePage === page.id }" @click="goTo(page.id)">
            {{ page.label }}
          </button>
        </nav>
      </div>
    </header>

    <div class="top-grid">
      <article v-for="card in topStats" :key="card.label" class="top-card panel">
        <span class="top-label">{{ card.label }}</span>
        <strong class="top-value">{{ card.value }}</strong>
      </article>
    </div>

    <WorkspacePageZh
      v-if="activePage === 'workspace'"
      :scene="workspace.scene.value"
      :sensors="workspace.sensors.value"
      :latest-by-sensor="workspace.latestBySensor.value"
      :running="workspace.running.value"
      :paused="workspace.paused.value"
      :speed="workspace.speed.value"
      :selected-obstacle="workspace.selectedObstacle.value"
      :selected-obstacle-id="workspace.selectedObstacleId.value"
      :chart-series="workspace.chartSeries.value"
      :logs="workspace.logs.value"
      :hide-charts="workspace.hideCharts.value"
      :hide-logs="workspace.hideLogs.value"
      :hide-sensors="workspace.hideSensors.value"
      :record-enabled="workspace.recordEnabled.value"
      :connected="workspace.connected.value"
      :status-text="workspace.statusText.value"
      :active-preset-title="activePresetTitle"
      @update-robot="workspace.onUpdateRobot($event)"
      @update-obstacle="workspace.onUpdateObstacle($event)"
      @select-obstacle="workspace.onSelectObstacle($event)"
      @patch-selected-obstacle="workspace.patchSelectedObstacle($event)"
      @remove-selected-obstacle="workspace.removeSelectedObstacle()"
      @start="workspace.start()"
      @pause="workspace.pause()"
      @resume="workspace.resume()"
      @stop="workspace.stop()"
      @speed-change="workspace.onSpeedChange($event)"
      @set-ambient="workspace.setAmbient($event)"
      @add-obstacle="workspace.addObstacle()"
      @reset-sensors="workspace.resetSensors()"
      @reset-scene="workspace.resetScene()"
      @toggle-record="workspace.recordEnabled.value = $event"
      @export-data="workspace.exportData($event)"
      @clear-charts="workspace.clearCharts()"
      @toggle-charts="workspace.hideCharts.value = $event"
      @toggle-logs="workspace.hideLogs.value = $event"
      @toggle-sensors="workspace.hideSensors.value = $event"
      @update-sensor="workspace.updateSensor($event)"
      @remove-sensor="workspace.removeSensor($event)"
      @add-sensor="workspace.addSensor($event)"
      @reset-sensor-defaults="workspace.resetSensorDefaults($event)"
      @export-logs="workspace.exportLogs($event)"
      @export-filtered-logs="workspace.exportFilteredLogs($event)"
      @jump-to-presets="goTo('scenarios')"
    />

    <ScenarioLibraryPageZh v-else-if="activePage === 'scenarios'" :active-preset-id="workspace.activePresetId.value" @apply-preset="workspace.applyPreset($event)" />

    <AnalysisPageZh v-else-if="activePage === 'analysis'" :scene="workspace.scene.value" :sensors="workspace.sensors.value" :logs="workspace.logs.value" :record-rows="workspace.recordRows.value" :latest-by-sensor="workspace.latestBySensor.value" />

    <AccountCenterPageZh
      v-else-if="activePage === 'account'"
      :account="account"
      :scene="workspace.scene.value"
      :sensors="workspace.sensors.value"
      :record-rows="workspace.recordRows.value"
      :record-total="workspace.recordTotal.value"
      :active-preset-title="activePresetTitle"
      :on-apply-scene="workspace.applyScenePreset"
      :on-apply-robot="workspace.applyRobotPreset"
      :on-apply-full="workspace.applyPreset"
      :on-toast="workspace.showToast"
    />

    <SystemGuidePageZh v-else />

    <Transition name="toast-fade">
      <div v-if="workspace.toast.value" class="toast" role="status" @click="workspace.dismissToast()">{{ workspace.toast.value }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.shell { max-width: 1560px; margin: 0 auto; padding: 20px 22px 32px; }
.shell-header { display: flex; justify-content: space-between; gap: 20px; padding: 18px 20px; margin-bottom: 16px; }
.brand { display: flex; gap: 16px; align-items: flex-start; }
.brand-mark { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: linear-gradient(135deg, var(--accent), #1f7a72); color: #041013; font-weight: 800; letter-spacing: 0.08em; }
.eyebrow { margin: 0 0 8px; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
h1 { margin: 0; font-size: 1.65rem; letter-spacing: -0.03em; }
.sub { margin: 10px 0 0; color: var(--muted); max-width: 70ch; line-height: 1.6; }
.header-side { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
.status-box { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 999px; border: 1px solid var(--border); color: var(--muted); background: rgba(255,255,255,0.04); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }
.status-dot.live { background: var(--accent); box-shadow: 0 0 14px rgba(61,214,198,0.55); }
.nav { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.nav-btn { border: 1px solid var(--border); background: rgba(255,255,255,0.04); color: var(--muted); border-radius: 999px; padding: 0.55rem 0.95rem; font-size: 0.88rem; }
.nav-btn.active { color: var(--text); border-color: var(--accent); background: rgba(61,214,198,0.12); }
.top-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.top-card { padding: 14px 16px; }
.top-label { display: block; color: var(--muted); font-size: 0.76rem; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.06em; }
.top-value { font-size: 1.2rem; word-break: break-word; }
.toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 9999; padding: 10px 18px; border-radius: 10px; background: var(--surface2); border: 1px solid var(--border); color: var(--text); font-size: 0.9rem; box-shadow: 0 12px 40px rgba(0,0,0,0.45); max-width: min(520px, 92vw); }
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
@media (max-width: 1180px) {
  .shell-header, .brand { flex-direction: column; }
  .header-side { align-items: flex-start; }
  .nav { justify-content: flex-start; }
  .top-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .shell { padding: 16px; }
  .top-grid { grid-template-columns: 1fr; }
}
</style>
