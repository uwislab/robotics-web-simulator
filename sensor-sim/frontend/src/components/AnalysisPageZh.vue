<script setup>
// 分析页
import { computed } from 'vue';
import {
  buildRecommendations,
  buildSensorHealth,
  summarizeLogs,
  summarizeRecords,
  summarizeScene,
  translateSensorStatus,
  translateSensorType,
} from '../lib/analytics.js';

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
const recommendations = computed(() => buildRecommendations({ sceneSummary: sceneSummary.value, logSummary: logSummary.value, recordSummary: recordSummary.value, healthRows: healthRows.value }));

const summaryCards = computed(() => [
  { label: '样本总数', value: recordSummary.value.totalSamples },
  { label: '有效传感器数', value: recordSummary.value.sensorCount },
  { label: '运行时长（秒）', value: recordSummary.value.durationSeconds.toFixed(2) },
  { label: '每分钟采样数', value: recordSummary.value.throughputPerMinute },
  { label: '警告日志', value: logSummary.value.counts.warning ?? 0 },
  { label: '错误日志', value: logSummary.value.counts.error ?? 0 },
  { label: '障碍物数量', value: sceneSummary.value.obstacleCount },
  { label: '平均反射率', value: sceneSummary.value.averageReflectivity },
]);

const recentRows = computed(() => props.recordRows.slice(-12).reverse());

const metricDescriptions = [
  '样本总数反映本轮实验的采样规模，数量越大越适合进行趋势分析。',
  '每分钟采样数用于评估系统吞吐量，受传感器频率和运行时长共同影响。',
  '平均反射率可辅助判断障碍物材质分布是否足够丰富。',
];
</script>

<template>
  <section class="analysis-page">
    <div class="page-hero panel">
      <div>
        <p class="eyebrow">数据分析中心</p>
        <h2>将原始采样、运行日志和场景信息整理为便于观察的统计结果。</h2>
        <p class="muted">本页用于快速判断运行质量、传感器健康度和场景复杂度，帮助你更高效地完成调参和复盘。</p>
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
            <p class="eyebrow small">指标释义</p>
            <h3>如何理解当前统计结果</h3>
          </div>
        </div>
        <ul class="note-list"><li v-for="item in metricDescriptions" :key="item">{{ item }}</li></ul>
      </section>

      <section class="panel section">
        <div class="section-head">
          <div>
            <p class="eyebrow small">运行建议</p>
            <h3>系统根据当前数据给出的建议</h3>
          </div>
        </div>
        <ul class="note-list"><li v-for="item in recommendations" :key="item">{{ item }}</li></ul>
      </section>
    </div>

    <div class="analysis-grid">
      <section class="panel section">
        <div class="section-head"><div><p class="eyebrow small">传感器状态</p><h3>通道健康度与最新数据</h3></div></div>
        <div class="health-table">
          <div class="health-head"><span>名称</span><span>类型</span><span>状态</span><span>采样数</span><span>最新值</span></div>
          <div v-for="row in healthRows" :key="row.sensorId" class="health-row">
            <span>{{ row.name }}</span><span>{{ row.sensorType }}</span><span>{{ row.health }}</span><span>{{ row.samples }}</span><span>{{ row.latestValue }}</span>
          </div>
        </div>
      </section>

      <section class="panel section">
        <div class="section-head"><div><p class="eyebrow small">日志概况</p><h3>告警与错误统计</h3></div></div>
        <div class="log-counters">
          <div class="counter"><span>信息日志</span><strong>{{ logSummary.counts.info ?? 0 }}</strong></div>
          <div class="counter warn"><span>警告日志</span><strong>{{ logSummary.counts.warning ?? 0 }}</strong></div>
          <div class="counter err"><span>错误日志</span><strong>{{ logSummary.counts.error ?? 0 }}</strong></div>
        </div>
        <p class="muted small-text">错误占比：{{ logSummary.errorRate }}%，若警告数量偏多，可优先检查噪声、量程、阈值等参数。</p>
      </section>
    </div>

    <div class="analysis-grid">
      <section class="panel section">
        <div class="section-head"><div><p class="eyebrow small">场景摘要</p><h3>当前实验环境特征</h3></div></div>
        <div class="scene-grid">
          <article class="scene-card"><span>场景编号</span><strong>{{ sceneSummary.sceneId }}</strong></article>
          <article class="scene-card"><span>环境光强</span><strong>{{ sceneSummary.ambientLight }}</strong></article>
          <article class="scene-card"><span>障碍物总占地</span><strong>{{ sceneSummary.obstacleFootprint }}</strong></article>
          <article class="scene-card"><span>机器人位姿</span><strong>{{ sceneSummary.robotPose.x.toFixed(2) }}, {{ sceneSummary.robotPose.y.toFixed(2) }}, {{ sceneSummary.robotPose.theta.toFixed(2) }}</strong></article>
        </div>
      </section>

      <section class="panel section">
        <div class="section-head"><div><p class="eyebrow small">近期样本</p><h3>最近 12 条采样记录</h3></div></div>
        <div class="record-table">
          <div class="record-head"><span>传感器</span><span>类型</span><span>状态</span><span>数值</span><span>时间</span></div>
          <div v-for="row in recentRows" :key="`${row.sensorId}-${row.t}`" class="record-row">
            <span>{{ row.sensorId }}</span><span>{{ translateSensorType(row.sensorType) }}</span><span>{{ translateSensorStatus(row.status || '-') }}</span><span>{{ row.value ?? row.gyroZ ?? '-' }}</span><span>{{ new Date(row.t).toLocaleTimeString('zh-CN', { hour12: false }) }}</span>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.analysis-page { display: flex; flex-direction: column; gap: 16px; }
.page-hero, .section { padding: 18px 20px; }
.eyebrow { margin: 0 0 8px; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.eyebrow.small { font-size: 0.68rem; }
.muted { color: var(--muted); line-height: 1.6; }
.small-text { margin-top: 14px; font-size: 0.86rem; }
.card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.summary-card { padding: 14px 16px; }
.card-label { display: block; color: var(--muted); font-size: 0.78rem; margin-bottom: 8px; }
.card-value { font-size: 1.28rem; }
.analysis-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.section-head { margin-bottom: 14px; }
.health-table, .record-table { display: flex; flex-direction: column; gap: 8px; }
.health-head, .health-row, .record-head, .record-row { display: grid; grid-template-columns: 1.3fr 0.8fr 0.9fr 0.7fr 1fr; gap: 10px; }
.health-head, .record-head { color: var(--muted); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; }
.health-row, .record-row { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: rgba(255,255,255,0.03); font-size: 0.86rem; }
.note-list { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.7; }
.log-counters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.counter { padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: rgba(255,255,255,0.03); }
.counter.warn strong { color: var(--warn); }
.counter.err strong { color: var(--danger); }
.counter span, .scene-card span { display: block; color: var(--muted); font-size: 0.78rem; margin-bottom: 8px; }
.scene-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.scene-card { padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: rgba(255,255,255,0.03); }
@media (max-width: 1180px) {
  .card-grid, .analysis-grid, .scene-grid, .log-counters { grid-template-columns: 1fr; }
  .health-head, .health-row, .record-head, .record-row { grid-template-columns: 1fr 1fr; }
}
</style>
