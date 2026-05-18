<script setup>
// 报告与导出工作区
import { computed, ref, watch } from 'vue';
import { createReportModel, generateMarkdownReport } from '../lib/analytics.js';
import { reportSections } from '../lib/presetLibrary.js';

const props = defineProps({
  scene: { type: Object, required: true },
  sensors: { type: Array, default: () => [] },
  logs: { type: Array, default: () => [] },
  recordRows: { type: Array, default: () => [] },
  latestBySensor: { type: Object, default: () => ({}) },
  selectedPreset: { type: Object, default: null },
  injectedTemplate: { type: Object, default: null },
});

const reportMeta = ref({
  title: 'Robot Sensor Simulation Experiment Report',
  author: 'Liu Ye',
  reviewer: 'Advisor',
  date: new Date().toISOString().slice(0, 10),
  notes: '',
});

watch(
  () => props.injectedTemplate,
  (template) => {
    if (!template) return;
    reportMeta.value.notes = [`Template: ${template.title}`, ...template.steps.map((step, index) => `${index + 1}. ${step}`)].join('\n');
  }
);

const reportModel = computed(() =>
  createReportModel({
    projectMeta: reportMeta.value,
    scene: props.scene,
    sensors: props.sensors,
    logs: props.logs,
    recordRows: props.recordRows,
    latestBySensor: props.latestBySensor,
    selectedPreset: props.selectedPreset,
  })
);

const markdown = computed(() => generateMarkdownReport(reportModel.value));

function downloadReport() {
  const blob = new Blob([markdown.value], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'experiment-report.md';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(markdown.value);
  } catch {
    /* ignore clipboard failure */
  }
}
</script>

<template>
  <section class="report-page">
    <div class="page-hero panel">
      <div>
        <p class="eyebrow">Report Studio</p>
        <h2>Generate a markdown experiment report from live scene, log, and sample data.</h2>
        <p class="muted">
          This module gives the project a more complete engineering workflow and helps you produce thesis appendix
          material faster.
        </p>
      </div>
    </div>

    <div class="report-grid">
      <section class="panel form-card">
        <div class="section-head">
          <div>
            <p class="eyebrow small">Metadata</p>
            <h3>Report configuration</h3>
          </div>
        </div>

        <label class="field">
          Title
          <input v-model="reportMeta.title" type="text" />
        </label>
        <label class="field">
          Author
          <input v-model="reportMeta.author" type="text" />
        </label>
        <label class="field">
          Reviewer
          <input v-model="reportMeta.reviewer" type="text" />
        </label>
        <label class="field">
          Date
          <input v-model="reportMeta.date" type="date" />
        </label>
        <label class="field">
          Notes
          <textarea v-model="reportMeta.notes" rows="10" />
        </label>

        <div class="detail-block">
          <h4>Suggested sections</h4>
          <ul>
            <li v-for="section in reportSections" :key="section">{{ section }}</li>
          </ul>
        </div>

        <div class="actions">
          <button type="button" class="btn btn-primary" @click="downloadReport">Download markdown</button>
          <button type="button" class="btn btn-ghost" @click="copyReport">Copy markdown</button>
        </div>
      </section>

      <section class="panel preview-card">
        <div class="section-head">
          <div>
            <p class="eyebrow small">Preview</p>
            <h3>Generated markdown</h3>
          </div>
        </div>
        <pre class="preview">{{ markdown }}</pre>
      </section>
    </div>
  </section>
</template>

<style scoped>
.report-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-hero,
.form-card,
.preview-card {
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

.report-grid {
  display: grid;
  grid-template-columns: minmax(320px, 420px) 1fr;
  gap: 16px;
}

.section-head {
  margin-bottom: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--muted);
  font-size: 0.86rem;
}

.field input,
.field textarea {
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
}

.detail-block h4 {
  margin: 0 0 10px;
}

.detail-block ul {
  margin: 0;
  padding-left: 18px;
  color: var(--muted);
  line-height: 1.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}

.preview {
  margin: 0;
  min-height: 640px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.22);
  color: var(--text);
  white-space: pre-wrap;
  font-family: var(--mono);
  line-height: 1.55;
}

@media (max-width: 1080px) {
  .report-grid {
    grid-template-columns: 1fr;
  }
}
</style>
