<script setup>
import { computed, ref, watch } from 'vue';
import { translateSensorType } from '../lib/analytics.js';
import { scenarioPresets } from '../lib/presetLibrary.js';

defineProps({
  activePresetId: { type: String, default: '' },
});

defineEmits(['applyPreset']);

const search = ref('');
const difficulty = ref('all');
const category = ref('all');

const categories = computed(() => ['all', ...new Set(scenarioPresets.map((item) => item.category))]);
const difficulties = computed(() => ['all', ...new Set(scenarioPresets.map((item) => item.difficulty))]);

const filteredPresets = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return scenarioPresets.filter((preset) => {
    if (difficulty.value !== 'all' && preset.difficulty !== difficulty.value) return false;
    if (category.value !== 'all' && preset.category !== category.value) return false;
    if (!keyword) return true;
    return JSON.stringify(preset).toLowerCase().includes(keyword);
  });
});

const selectedPreset = ref(filteredPresets.value[0] ?? null);

watch(
  filteredPresets,
  (items) => {
    if (!items.length) {
      selectedPreset.value = null;
      return;
    }
    if (!selectedPreset.value || !items.some((item) => item.id === selectedPreset.value.id)) {
      selectedPreset.value = items[0];
    }
  },
  { immediate: true }
);

function sensorNote(sensor) {
  if (sensor.beamDeg) return `波束角 ${sensor.beamDeg}°`;
  if (sensor.outputMode === 'binary') return '二值输出模式';
  if (sensor.outputMode === 'analog') return '模拟量输出模式';
  return '用于姿态与惯性测量';
}

const usageTips = [
  '优先从低复杂度场景开始，确认采样、曲线和日志都正常后，再切换到高复杂度场景。',
  '如果需要观察单一变量影响，建议每次仅调整一种传感器参数，其余参数保持不变。',
  '长时运行场景更适合观察漂移、告警密度和数据导出完整性。',
];
</script>

<template>
  <section class="scenario-page">
    <div class="page-hero panel">
      <div>
        <p class="eyebrow">场景库</p>
        <h2>通过可复现实验预设，快速切换不同复杂度的验证环境。</h2>
        <p class="muted">每个预设都包含场景布局、传感器布置、实验目标与建议指标，适合用于参数调试、稳定性观察和长时运行验证。</p>
      </div>
    </div>

    <div class="filter-bar panel">
      <input v-model="search" class="search" type="search" placeholder="搜索场景、材质、指标或实验说明…" />
      <select v-model="category" class="sel">
        <option v-for="item in categories" :key="item" :value="item">{{ item === 'all' ? '全部分类' : item }}</option>
      </select>
      <select v-model="difficulty" class="sel">
        <option v-for="item in difficulties" :key="item" :value="item">{{ item === 'all' ? '全部难度' : item }}</option>
      </select>
    </div>

    <div class="scenario-layout">
      <div class="preset-list">
        <article v-for="preset in filteredPresets" :key="preset.id" class="preset-card panel" :class="{ active: preset.id === selectedPreset?.id }" @click="selectedPreset = preset">
          <div class="preset-row">
            <div>
              <p class="eyebrow small">{{ preset.category }}</p>
              <h3>{{ preset.title }}</h3>
            </div>
            <span class="badge">{{ preset.difficulty }}</span>
          </div>
          <p class="summary">{{ preset.summary }}</p>
          <div class="meta-row">
            <span>{{ preset.scene.obstacles.length }} 个障碍物</span>
            <span>{{ preset.sensors.length }} 个传感器</span>
          </div>
          <button type="button" class="btn btn-primary" @click.stop="$emit('applyPreset', preset)">应用预设</button>
        </article>
      </div>

      <div v-if="selectedPreset" class="preset-detail panel">
        <div class="preset-row">
          <div>
            <p class="eyebrow">当前选中</p>
            <h3>{{ selectedPreset.title }}</h3>
          </div>
          <span class="active-tag">{{ activePresetId === selectedPreset.id ? '已应用到工作台' : '可应用' }}</span>
        </div>

        <p class="muted">{{ selectedPreset.summary }}</p>

        <section class="detail-block">
          <h4>实验目标</h4>
          <ul>
            <li v-for="item in selectedPreset.objectives" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section class="detail-block">
          <h4>建议指标</h4>
          <div class="chips">
            <span v-for="item in selectedPreset.metrics" :key="item" class="chip">{{ item }}</span>
          </div>
        </section>

        <section class="detail-block">
          <h4>场景快照</h4>
          <div class="scene-grid">
            <div class="scene-item"><span>场景编号</span><strong>{{ selectedPreset.scene.sceneId }}</strong></div>
            <div class="scene-item"><span>环境光强</span><strong>{{ selectedPreset.scene.ambientLight }}</strong></div>
            <div class="scene-item"><span>机器人位姿</span><strong>{{ selectedPreset.scene.robot.x }}, {{ selectedPreset.scene.robot.y }}, {{ selectedPreset.scene.robot.theta }}</strong></div>
            <div class="scene-item"><span>障碍物数量</span><strong>{{ selectedPreset.scene.obstacles.length }}</strong></div>
          </div>
        </section>

        <section class="detail-block">
          <h4>传感器布局</h4>
          <div class="sensor-table">
            <div class="sensor-head"><span>名称</span><span>类型</span><span>频率</span><span>说明</span></div>
            <div v-for="sensor in selectedPreset.sensors" :key="sensor.sensorId || sensor.name" class="sensor-row">
              <span>{{ sensor.name }}</span>
              <span>{{ translateSensorType(sensor.sensorType) }}</span>
              <span>{{ sensor.frequency || '-' }} Hz</span>
              <span>{{ sensorNote(sensor) }}</span>
            </div>
          </div>
        </section>

        <div class="actions">
          <button type="button" class="btn btn-primary" @click="$emit('applyPreset', selectedPreset)">将该预设应用到工作台</button>
        </div>
      </div>
    </div>

    <section class="template-section panel">
      <div class="preset-row">
        <div>
          <p class="eyebrow">使用建议</p>
          <h3>如何更高效地使用预设场景</h3>
        </div>
      </div>
      <div class="template-grid">
        <article v-for="(tip, index) in usageTips" :key="tip" class="template-card">
          <div class="preset-row">
            <h4>建议 {{ index + 1 }}</h4>
            <span class="badge">场景切换</span>
          </div>
          <p class="muted">{{ tip }}</p>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.scenario-page { display: flex; flex-direction: column; gap: 16px; }
.page-hero, .filter-bar, .template-section { padding: 18px 20px; }
.eyebrow { margin: 0 0 8px; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.eyebrow.small { font-size: 0.68rem; margin-bottom: 6px; }
.page-hero h2, .preset-card h3, .preset-detail h3 { margin: 0; }
.muted { color: var(--muted); line-height: 1.6; }
.filter-bar { display: flex; gap: 12px; }
.search, .sel { background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.search { flex: 1; }
.scenario-layout { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 16px; align-items: start; }
.preset-list { display: flex; flex-direction: column; gap: 12px; }
.preset-card, .preset-detail { padding: 16px 18px; }
.preset-card { cursor: pointer; transition: transform 0.15s ease, border-color 0.15s ease; }
.preset-card:hover, .preset-card.active { transform: translateY(-2px); border-color: var(--accent); }
.preset-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.badge, .active-tag { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); font-size: 0.74rem; color: var(--muted); }
.active-tag { color: var(--accent); }
.summary { color: var(--muted); line-height: 1.5; }
.meta-row { display: flex; gap: 10px; margin-bottom: 12px; font-size: 0.82rem; color: var(--muted); }
.detail-block { margin-top: 18px; }
.detail-block h4, .detail-block h5 { margin: 0 0 10px; }
.detail-block ul, .detail-block ol { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.7; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text); font-size: 0.82rem; }
.scene-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.scene-item { padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: rgba(255,255,255,0.03); }
.scene-item span { display: block; font-size: 0.78rem; color: var(--muted); margin-bottom: 6px; }
.sensor-table { display: flex; flex-direction: column; gap: 8px; }
.sensor-head, .sensor-row { display: grid; grid-template-columns: 1.5fr 0.8fr 0.8fr 1.2fr; gap: 10px; }
.sensor-head { color: var(--muted); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.06em; }
.sensor-row { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: rgba(255,255,255,0.03); font-size: 0.86rem; }
.actions { margin-top: 18px; }
.template-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.template-card { border: 1px solid var(--border); border-radius: 14px; padding: 14px; background: rgba(255,255,255,0.03); }
@media (max-width: 1180px) {
  .scenario-layout, .template-grid, .scene-grid { grid-template-columns: 1fr; }
  .sensor-head, .sensor-row { grid-template-columns: 1fr 1fr; }
}
</style>
