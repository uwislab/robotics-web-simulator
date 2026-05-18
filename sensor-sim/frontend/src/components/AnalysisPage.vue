<script setup>
// 分析页
import { computed } from 'vue';
import { buildRecommendations, buildSensorHealth, summarizeLogs, summarizeRecords, summarizeScene } from '../lib/analytics.js';

const props = defineProps({
  scene: { type: Object, required: true },
  sensors: { type: Array, default: () => [] },
  logs: { type: Array, default: () => [] },
  recordRows: { type: Array, default: () => [] },
  latestBySensor: { type: Object, default: () => ({}) },
});

const sceneSummary = computed(() => summarizeScene(props.scene));
const recordSummary = computed(() => summarizeRecords(props.recordRows));
const logSummary = computed(() => summarizeLogs(props.logs));
const healthRows = computed(() => buildSensorHealth(props.sensors, props.latestBySensor, recordSummary.value));
const recommendations = computed(() =>
  buildRecommendations({
    sceneSummary: sceneSummary.value,
    logSummary: logSummary.value,
    recordSummary: recordSummary.value,
    healthRows: healthRows.value,
  })
);

const summaryCards = computed(() => [
  { label: 'Total samples', value: recordSummary.value.totalSamples },
  { label: 'Sensors in records', value: recordSummary.value.sensorCount },
  { label: 'Duration (s)', value: recordSummary.value.durationSeconds.toFixed(2) },
  { label: 'Throughput / min', value: recordSummary.value.throughputPerMinute },
  { label: 'Warnings', value: logSummary.value.counts.warning ?? 0 },
  { label: 'Errors', value: logSummary.value.counts.error ?? 0 },
  { label: 'Obstacles', value: sceneSummary.value.obstacleCount },
  { label: 'Avg reflectivity', value: sceneSummary.value.averageReflectivity },
]);

const recentRows = computed(() => props.recordRows.slice(-15).reverse());
</script>

<template>
  <section class="analysis-page">
    <div class="page-hero panel">
      <div>
        <p class="eyebrow">Analysis Center</p>
        <h2>Turn runtime traces into metrics, health checks, and experiment observations.</h2>
        <p class="muted">
          This page summarizes the raw data stream into information you can reference in your thesis, test records, or
          defense slides.
        </p>
      </div>
    </div>

    <div class="card-grid">
      <article v-for="card in summaryCards" :key="card.label" class="summary-card panel">
        <span class="card-label">{{ card.label }}</span>
        <strong class="card-value">{{ card.value }}</strong>
      </article>
    </div>

    <div class="analysis-grid">
      <section class="panel section">
        <div class="section-head">
          <div>
            <p class="eyebrow small">Sensor Health</p>
            <h3>Latest status by sensor channel</h3>
          </div>
        </div>
        <div class="health-table">
          <div class="health-head">
            <span>Name</span>
            <span>Type</span>
            <span>Status</span>
            <span>Samples</span>
            <span>Latest</span>
          </div>
          <div v-for="row in healthRows" :key="row.sensorId" class="health-row">
            <span>{{ row.name }}</span>
            <span>{{ row.sensorType }}</span>
            <span>{{ row.health }}</span>
            <span>{{ row.samples }}</span>
            <span>{{ row.latestValue }}</span>
          </div>
        </div>
      </section>

      <section class="panel section">
        <div class="section-head">
          <div>
            <p class="eyebrow small">Runtime Findings</p>
            <h3>Actionable recommendations</h3>
          </div>
        </div>
        <ul class="note-list">
          <li v-for="item in recommendations" :key="item">{{ item }}</li>
        </ul>

        <div class="log-counters">
          <div class="counter warn">
            <span>Warnings</span>
            <strong>{{ logSummary.counts.warning ?? 0 }}</strong>
          </div>
          <div class="counter err">
            <span>Errors</span>
            <strong>{{ logSummary.counts.error ?? 0 }}</strong>
          </div>
          <div class="counter">
            <span>Total logs</span>
            <strong>{{ logSummary.total }}</strong>
          </div>
        </div>
      </section>
    </div>

    <div class="analysis-grid">
      <section class="panel section">
        <div class="section-head">
          <div>
            <p class="eyebrow small">Scene Summary</p>
            <h3>Current scene characteristics</h3>
          </div>
        </div>
        <div class="scene-grid">
          <article class="scene-card">
            <span>Scene ID</span>
            <strong>{{ sceneSummary.sceneId }}</strong>
          </article>
          <article class="scene-card">
            <span>Ambient light</span>
            <strong>{{ sceneSummary.ambientLight }}</strong>
          </article>
          <article class="scene-card">
            <span>Obstacle footprint</span>
            <strong>{{ sceneSummary.obstacleFootprint }}</strong>
          </article>
          <article class="scene-card">
            <span>Robot pose</span>
            <strong>
              {{ sceneSummary.robotPose.x.toFixed(2) }}, {{ sceneSummary.robotPose.y.toFixed(2) }},
              {{ sceneSummary.robotPose.theta.toFixed(2) }}
            </strong>
          </article>
        </div>
      </section>

      <section class="panel section">
        <div class="section-head">
          <div>
            <p class="eyebrow small">Recent Samples</p>
            <h3>Last 15 recorded rows</h3>
          </div>
        </div>
        <div class="record-table">
          <div class="record-head">
            <span>Sensor</span>
            <span>Type</span>
            <span>Status</span>
            <span>Value</span>
            <span>Time</span>
          </div>
          <div v-for="row in recentRows" :key="`${row.sensorId}-${row.t}`" class="record-row">
            <span>{{ row.sensorId }}</span>
            <span>{{ row.sensorType }}</span>
            <span>{{ row.status || '-' }}</span>
            <span>{{ row.value ?? row.gyroZ ?? '-' }}</span>
            <span>{{ new Date(row.t).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.analysis-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-hero,
.section {
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
}

.muted {
  color: var(--muted);
  line-height: 1.6;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-card {
  padding: 14px 16px;
}

.card-label {
  display: block;
  color: var(--muted);
  font-size: 0.78rem;
  margin-bottom: 8px;
}

.card-value {
  font-size: 1.28rem;
}

.analysis-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.section-head {
  margin-bottom: 14px;
}

.health-table,
.record-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.health-head,
.health-row,
.record-head,
.record-row {
  display: grid;
  grid-template-columns: 1.3fr 0.8fr 0.9fr 0.7fr 1fr;
  gap: 10px;
}

.health-head,
.record-head {
  color: var(--muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.health-row,
.record-row {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
  font-size: 0.86rem;
}

.note-list {
  margin: 0;
  padding-left: 18px;
  color: var(--muted);
  line-height: 1.7;
}

.log-counters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.counter {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

.counter.warn strong {
  color: var(--warn);
}

.counter.err strong {
  color: var(--danger);
}

.counter span,
.scene-card span {
  display: block;
  color: var(--muted);
  font-size: 0.78rem;
  margin-bottom: 8px;
}

.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.scene-card {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

@media (max-width: 1180px) {
  .card-grid,
  .analysis-grid,
  .scene-grid,
  .log-counters {
    grid-template-columns: 1fr;
  }

  .health-head,
  .health-row,
  .record-head,
  .record-row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
