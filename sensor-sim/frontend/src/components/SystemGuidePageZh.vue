<script setup>
import { computed, ref } from 'vue';
import { architectureNotes } from '../lib/presetLibrary.js';

const search = ref('');

const overviewSections = [
  {
    title: '平台概况',
    text: '本平台面向机器人传感器实验与场景验证，提供场景编辑、传感器配置、实时采样、日志观察、数据分析和结果导出能力。',
  },
  {
    title: '适用场景',
    text: '适合用于超声波、红外和 IMU 等常见传感器的参数调试、障碍环境验证、多场景对比和长时运行观察。',
  },
  {
    title: '核心价值',
    text: '通过可重复的场景预设和可视化运行界面，降低重复搭建实验环境的成本，并提升调试效率。',
  },
  {
    title: '数据能力',
    text: '平台会持续记录采样结果、运行状态和告警日志，便于后续分析趋势、定位异常并导出结果留存。',
  },
];

const quickStart = [
  '进入“场景库”选择一个预设场景，并将其应用到工作台。',
  '在“工作台”调整障碍物位置、环境光强和传感器参数。',
  '启动仿真后观察二维场景、实时曲线和日志输出。',
  '切换到“数据分析”查看采样统计、传感器状态和近期样本。',
  '如果需要留存结果，可在工作台和日志面板中导出数据文件。',
];

const interactions = [
  '左键拖拽机器人或障碍物可直接调整场景布局。',
  '在画布上使用滚轮可缩放视图。',
  '按住 Alt 再拖拽可平移画布。',
  '将鼠标移到机器人上时，按住 Shift 并滚动滚轮可调整机器人朝向。',
  '键盘 W/S 可前进后退，A/D 或方向键左右可转向。',
  '按 Delete 或 Backspace 可删除当前选中的障碍物。',
];

const filteredSections = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  return overviewSections.filter((item) => !keyword || `${item.title} ${item.text}`.toLowerCase().includes(keyword));
});
</script>

<template>
  <section class="guide-page">
    <div class="page-hero panel">
      <div>
        <p class="eyebrow">使用说明与平台概况</p>
        <h2>帮助你快速了解平台结构、核心能力和常用操作方式。</h2>
        <p class="muted">这一页聚焦真实使用过程中的关键信息，方便快速上手、熟悉页面结构并掌握主要交互方式。</p>
      </div>
    </div>

    <section class="panel search-card">
      <div class="section-head"><div><p class="eyebrow small">概况检索</p><h3>按关键词查看平台能力与适用范围</h3></div></div>
      <input v-model="search" class="search" type="search" placeholder="搜索场景、采样、日志、导出、分析等关键词…" />
      <div class="info-grid">
        <article v-for="item in filteredSections" :key="item.title" class="info-card">
          <h4>{{ item.title }}</h4>
          <p>{{ item.text }}</p>
        </article>
      </div>
    </section>

    <section class="panel architecture-card">
      <div class="section-head"><div><p class="eyebrow small">快速上手</p><h3>推荐的使用顺序</h3></div></div>
      <ol class="outline">
        <li v-for="item in quickStart" :key="item">{{ item }}</li>
      </ol>
    </section>

    <section class="panel architecture-card">
      <div class="section-head"><div><p class="eyebrow small">交互说明</p><h3>工作台中的常见操作</h3></div></div>
      <ul class="outline">
        <li v-for="item in interactions" :key="item">{{ item }}</li>
      </ul>
    </section>

    <section class="panel architecture-card">
      <div class="section-head"><div><p class="eyebrow small">系统结构</p><h3>平台由哪些模块组成</h3></div></div>
      <div class="note-grid">
        <article v-for="note in architectureNotes" :key="note.title" class="note-card">
          <h4>{{ note.title }}</h4>
          <ul><li v-for="point in note.points" :key="point">{{ point }}</li></ul>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.guide-page { display: flex; flex-direction: column; gap: 16px; }
.page-hero, .search-card, .architecture-card { padding: 18px 20px; }
.eyebrow { margin: 0 0 8px; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.eyebrow.small { font-size: 0.68rem; }
.muted { color: var(--muted); line-height: 1.6; }
.section-head { margin-bottom: 14px; }
.search { width: 100%; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.info-grid, .note-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.info-card, .note-card { padding: 14px; border-radius: 12px; border: 1px solid var(--border); background: rgba(255,255,255,0.03); }
.info-card h4, .note-card h4 { margin: 0 0 10px; }
.info-card p, .note-card ul, .outline { margin: 0; color: var(--muted); line-height: 1.7; }
.note-card ul, .outline { padding-left: 18px; }
@media (max-width: 980px) { .info-grid, .note-grid { grid-template-columns: 1fr; } }
</style>
