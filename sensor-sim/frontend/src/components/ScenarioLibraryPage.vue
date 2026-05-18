<script setup>
// 场景库页面
import { computed, ref, watch } from 'vue';
import { experimentTemplates, scenarioPresets } from '../lib/presetLibrary.js';

const props = defineProps({
  activePresetId: { type: String, default: '' },
});

const emit = defineEmits(['applyPreset', 'useTemplate']);

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
</script>

<template>
  <section class="scenario-page">
    <div class="page-hero panel">
      <div>
        <p class="eyebrow">Scenario Library</p>
        <h2>Apply repeatable experiment presets for demos, testing, and report screenshots.</h2>
        <p class="muted">
          Each preset bundles a scene layout, sensor placement strategy, experiment goal, and suggested metrics so the
          project looks more like a complete graduation design platform rather than a single runtime page.
        </p>
      </div>
    </div>

    <div class="filter-bar panel">
      <input v-model="search" class="search" type="search" placeholder="Search presets, materials, metrics..." />
      <select v-model="category" class="sel">
        <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
      </select>
      <select v-model="difficulty" class="sel">
        <option v-for="item in difficulties" :key="item" :value="item">{{ item }}</option>
      </select>
    </div>

    <div class="scenario-layout">
      <div class="preset-list">
        <article
          v-for="preset in filteredPresets"
          :key="preset.id"
          class="preset-card panel"
          :class="{ active: preset.id === selectedPreset?.id }"
          @click="selectedPreset = preset"
        >
          <div class="preset-row">
            <div>
              <p class="eyebrow small">{{ preset.category }}</p>
              <h3>{{ preset.title }}</h3>
            </div>
            <span class="badge">{{ preset.difficulty }}</span>
          </div>
          <p class="summary">{{ preset.summary }}</p>
          <div class="meta-row">
            <span>{{ preset.scene.obstacles.length }} obstacles</span>
            <span>{{ preset.sensors.length }} sensors</span>
          </div>
          <button type="button" class="btn btn-primary" @click.stop="$emit('applyPreset', preset)">Apply preset</button>
        </article>
      </div>

      <div class="preset-detail panel" v-if="selectedPreset">
        <div class="preset-row">
          <div>
            <p class="eyebrow">Current selection</p>
            <h3>{{ selectedPreset.title }}</h3>
          </div>
          <span v-if="activePresetId === selectedPreset.id" class="active-tag">Active in workspace</span>
        </div>

        <p class="muted">{{ selectedPreset.summary }}</p>

        <section class="detail-block">
          <h4>Objectives</h4>
          <ul>
            <li v-for="item in selectedPreset.objectives" :key="item">{{ item }}</li>
          </ul>
        </section>

        <section class="detail-block">
          <h4>Suggested metrics</h4>
          <div class="chips">
            <span v-for="item in selectedPreset.metrics" :key="item" class="chip">{{ item }}</span>
          </div>
        </section>

        <section class="detail-block">
          <h4>Scene snapshot</h4>
          <div class="scene-grid">
            <div class="scene-item">
              <span>Scene ID</span>
              <strong>{{ selectedPreset.scene.sceneId }}</strong>
            </div>
            <div class="scene-item">
              <span>Ambient light</span>
              <strong>{{ selectedPreset.scene.ambientLight }}</strong>
            </div>
            <div class="scene-item">
              <span>Robot pose</span>
              <strong>
                {{ selectedPreset.scene.robot.x }}, {{ selectedPreset.scene.robot.y }}, {{ selectedPreset.scene.robot.theta }}
              </strong>
            </div>
            <div class="scene-item">
              <span>Obstacles</span>
              <strong>{{ selectedPreset.scene.obstacles.length }}</strong>
            </div>
          </div>
        </section>

        <section class="detail-block">
          <h4>Sensor layout</h4>
          <div class="sensor-table">
            <div class="sensor-head">
              <span>Name</span>
              <span>Type</span>
              <span>Frequency</span>
              <span>Key note</span>
            </div>
            <div v-for="sensor in selectedPreset.sensors" :key="sensor.sensorId || sensor.name" class="sensor-row">
              <span>{{ sensor.name }}</span>
              <span>{{ sensor.sensorType }}</span>
              <span>{{ sensor.frequency || '-' }} Hz</span>
              <span>{{ sensor.beamDeg ? `beam ${sensor.beamDeg}` : sensor.outputMode || 'imu drift tracking' }}</span>
            </div>
          </div>
        </section>

        <div class="actions">
          <button type="button" class="btn btn-primary" @click="$emit('applyPreset', selectedPreset)">Apply this preset</button>
        </div>
      </div>
    </div>

    <section class="template-section panel">
      <div class="preset-row">
        <div>
          <p class="eyebrow">Experiment Templates</p>
          <h3>Suggested runbooks for thesis screenshots and appendix material</h3>
        </div>
      </div>
      <div class="template-grid">
        <article v-for="template in experimentTemplates" :key="template.id" class="template-card">
          <div class="preset-row">
            <h4>{{ template.title }}</h4>
            <span class="badge">{{ template.durationMinutes }} min</span>
          </div>
          <p class="muted">{{ template.operator }}</p>
          <div class="detail-block">
            <h5>Steps</h5>
            <ol>
              <li v-for="step in template.steps" :key="step">{{ step }}</li>
            </ol>
          </div>
          <div class="detail-block">
            <h5>Deliverables</h5>
            <div class="chips">
              <span v-for="item in template.deliverables" :key="item" class="chip">{{ item }}</span>
            </div>
          </div>
          <button type="button" class="btn btn-ghost" @click="$emit('useTemplate', template)">Copy into report notes</button>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.scenario-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-hero,
.filter-bar,
.template-section {
  padding: 18px 20px;
}

.eyebrow {
  margin: 0 0 8px;
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--accent);
}

.eyebrow.small {
  font-size: 0.68rem;
  margin-bottom: 6px;
}

.page-hero h2,
.preset-card h3,
.preset-detail h3 {
  margin: 0;
}

.muted {
  color: var(--muted);
  line-height: 1.6;
}

.filter-bar {
  display: flex;
  gap: 12px;
}

.search,
.sel {
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}

.search {
  flex: 1;
}

.scenario-layout {
  display: grid;
  grid-template-columns: minmax(280px, 380px) 1fr;
  gap: 16px;
  align-items: start;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-card,
.preset-detail {
  padding: 16px 18px;
}

.preset-card {
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.preset-card:hover,
.preset-card.active {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.preset-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.badge,
.active-tag {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 0.74rem;
  color: var(--muted);
}

.active-tag {
  color: var(--accent);
}

.summary {
  color: var(--muted);
  line-height: 1.5;
}

.meta-row {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  font-size: 0.82rem;
  color: var(--muted);
}

.detail-block {
  margin-top: 18px;
}

.detail-block h4,
.detail-block h5 {
  margin: 0 0 10px;
}

.detail-block ul,
.detail-block ol {
  margin: 0;
  padding-left: 18px;
  color: var(--muted);
  line-height: 1.7;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 0.82rem;
}

.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.scene-item {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.scene-item span {
  display: block;
  font-size: 0.78rem;
  color: var(--muted);
  margin-bottom: 6px;
}

.sensor-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sensor-head,
.sensor-row {
  display: grid;
  grid-template-columns: 1.5fr 0.8fr 0.8fr 1.2fr;
  gap: 10px;
}

.sensor-head {
  color: var(--muted);
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.sensor-row {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  font-size: 0.86rem;
}

.actions {
  margin-top: 18px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.template-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.03);
}

@media (max-width: 1180px) {
  .scenario-layout,
  .template-grid {
    grid-template-columns: 1fr;
  }

  .scene-grid {
    grid-template-columns: 1fr;
  }

  .sensor-head,
  .sensor-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
