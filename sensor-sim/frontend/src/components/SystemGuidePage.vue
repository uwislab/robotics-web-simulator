<!-- 系统指南页面 -->
<script setup>
import { computed, ref } from 'vue';
import { architectureNotes } from '../lib/presetLibrary.js';

const search = ref('');

const sections = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  const base = [
    {
      title: 'Project positioning',
      text: 'The system is a web-based robot sensor simulation platform that integrates scene editing, sensor configuration, real-time data streaming, log observation, export tools, preset management, and report generation.',
    },
    {
      title: 'Recommended thesis chapter mapping',
      text: 'You can map the modules to requirement analysis, overall architecture, functional design, implementation details, experiment design, and result discussion chapters. The new pages make that mapping much easier to explain.',
    },
    {
      title: 'Suggested defense demonstration order',
      text: 'Start in the scenario library, switch to the workspace for a live run, open analysis for data interpretation, then finish in report studio to export markdown or screenshots.',
    },
    {
      title: 'Potential extension directions',
      text: 'Future work can include route planning, additional sensor models, 3D visualization, multi-robot collaboration, persistence for historical experiments, and formal test-case management.',
    },
  ];

  return base.filter((item) => {
    if (!keyword) return true;
    return `${item.title} ${item.text}`.toLowerCase().includes(keyword);
  });
});
</script>

<template>
  <section class="guide-page">
    <div class="page-hero panel">
      <div>
        <p class="eyebrow">System Guide</p>
        <h2>Project overview, architecture notes, and defense-ready talking points.</h2>
        <p class="muted">
          This page intentionally packages engineering context around the code so the project looks more complete during
          documentation and presentation.
        </p>
      </div>
    </div>

    <section class="panel search-card">
      <div class="section-head">
        <div>
          <p class="eyebrow small">Knowledge Base</p>
          <h3>Search talking points and system descriptions</h3>
        </div>
      </div>
      <input v-model="search" class="search" type="search" placeholder="Search architecture, thesis, defense..." />
      <div class="info-grid">
        <article v-for="item in sections" :key="item.title" class="info-card">
          <h4>{{ item.title }}</h4>
          <p>{{ item.text }}</p>
        </article>
      </div>
    </section>

    <section class="panel architecture-card">
      <div class="section-head">
        <div>
          <p class="eyebrow small">Architecture</p>
          <h3>Module-level understanding</h3>
        </div>
      </div>
      <div class="note-grid">
        <article v-for="note in architectureNotes" :key="note.title" class="note-card">
          <h4>{{ note.title }}</h4>
          <ul>
            <li v-for="point in note.points" :key="point">{{ point }}</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="panel architecture-card">
      <div class="section-head">
        <div>
          <p class="eyebrow small">Presentation Outline</p>
          <h3>A concise sequence for demo and defense</h3>
        </div>
      </div>
      <ol class="outline">
        <li>Introduce the system goal and explain why web-based simulation reduces experiment cost.</li>
        <li>Use the scenario library to show repeatable experiment initialization.</li>
        <li>Open the workspace and adjust scene, obstacles, and sensors live.</li>
        <li>Run the simulation and point out chart growth, sensor status, and logs.</li>
        <li>Switch to analysis center to summarize runtime metrics and health indicators.</li>
        <li>Show report studio to demonstrate export capability and engineering completeness.</li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.guide-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-hero,
.search-card,
.architecture-card {
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

.section-head {
  margin-bottom: 14px;
}

.search {
  width: 100%;
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
}

.info-grid,
.note-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.info-card,
.note-card {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.03);
}

.info-card h4,
.note-card h4 {
  margin: 0 0 10px;
}

.info-card p,
.note-card ul,
.outline {
  margin: 0;
  color: var(--muted);
  line-height: 1.7;
}

.note-card ul,
.outline {
  padding-left: 18px;
}

@media (max-width: 980px) {
  .info-grid,
  .note-grid {
    grid-template-columns: 1fr;
  }
}
</style>
