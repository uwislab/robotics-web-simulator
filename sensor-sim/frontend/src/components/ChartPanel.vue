<script setup>
// 实时曲线面板
import { ref, watch, onMounted, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const props = defineProps({
  series: { type: Object, default: () => ({}) },
  hidden: { type: Boolean, default: false },
});

defineEmits(['clear']);

const el = ref(null);
let chart;

const MAX = 180;

function buildOption() {
  const s = props.series;
  const names = Object.keys(s);
  const series = [];
  for (const name of names) {
    const pts = s[name] || [];
    series.push({
      name,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: pts.slice(-MAX).map((p) => [p.t, p.v]),
      lineStyle: { width: 1.5 },
    });
  }
  return {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b9bb0', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
    },
    legend: {
      textStyle: { color: '#8b9bb0' },
      type: 'scroll',
      top: 0,
    },
    grid: { left: 48, right: 24, top: 36, bottom: 28 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#2a3544' } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#2a3544' } },
      splitLine: { lineStyle: { color: '#1e2630' } },
    },
    series,
  };
}

function resize() {
  chart?.resize();
}

onMounted(() => {
  chart = echarts.init(el.value, null, { renderer: 'canvas' });
  chart.setOption(buildOption());
  window.addEventListener('resize', resize);
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
  chart?.dispose();
});

watch(
  () => props.series,
  () => {
    if (!chart) return;
    chart.setOption(buildOption(), { notMerge: true });
  },
  { deep: true }
);
</script>

<template>
  <div v-show="!hidden" class="chart-card panel">
    <div class="chart-head">
      <span class="panel-title" style="margin: 0">实时数据曲线</span>
      <button type="button" class="btn btn-ghost sm" @click="$emit('clear')">清空曲线</button>
    </div>
    <div ref="el" class="chart" />
  </div>
</template>

<style scoped>
.chart-card {
  padding: 10px 12px 12px;
}
.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.sm {
  font-size: 0.8rem;
  padding: 0.3rem 0.55rem;
}
.chart {
  width: 100%;
  height: 280px;
}
</style>
