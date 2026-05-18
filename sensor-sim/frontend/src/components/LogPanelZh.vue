<script setup>
// 仿真日志面板
import { computed, ref } from 'vue';
import { translateLogLevel } from '../lib/analytics.js';

const props = defineProps({
  logs: { type: Array, default: () => [] },
  hidden: { type: Boolean, default: false },
});

const emit = defineEmits(['export', 'exportFiltered']);

const keyword = ref('');
const level = ref('all');
const startAt = ref('');
const endAt = ref('');

const filtered = computed(() => {
  let list = props.logs.slice().reverse();
  if (level.value !== 'all') list = list.filter((item) => item.payload?.level === level.value);
  if (keyword.value.trim()) {
    const q = keyword.value.toLowerCase();
    list = list.filter((item) => JSON.stringify(item.payload || {}).toLowerCase().includes(q));
  }
  const startMs = startAt.value ? new Date(startAt.value).getTime() : null;
  if (startMs !== null && !Number.isNaN(startMs)) list = list.filter((item) => item.timestamp >= startMs);
  const endMs = endAt.value ? new Date(endAt.value).getTime() : null;
  if (endMs !== null && !Number.isNaN(endMs)) list = list.filter((item) => item.timestamp <= endMs);
  return list.slice(0, 400);
});

function levelClass(lv) {
  if (lv === 'warning') return 'warn';
  if (lv === 'error') return 'err';
  return '';
}

function formatTime(ts) {
  const date = new Date(ts);
  return `${date.toLocaleTimeString('zh-CN', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function exportFiltered(kind) {
  emit('exportFiltered', { kind, rows: [...filtered.value].reverse() });
}

function clearTimeFilter() {
  startAt.value = '';
  endAt.value = '';
}
</script>

<template>
  <div v-show="!hidden" class="log-panel panel">
    <div class="toolbar">
      <span class="panel-title" style="margin: 0">仿真日志</span>
      <input v-model="keyword" class="inp" placeholder="搜索日志内容…" />
      <input v-model="startAt" class="time" type="datetime-local" title="开始时间" />
      <input v-model="endAt" class="time" type="datetime-local" title="结束时间" />
      <select v-model="level" class="sel">
        <option value="all">全部级别</option>
        <option value="info">信息</option>
        <option value="warning">警告</option>
        <option value="error">错误</option>
      </select>
      <button type="button" class="btn btn-ghost" @click="clearTimeFilter">清空时间</button>
      <button type="button" class="btn btn-ghost" @click="emit('export', 'txt')">导出全部 TXT</button>
      <button type="button" class="btn btn-ghost" @click="emit('export', 'csv')">导出全部 CSV</button>
      <button type="button" class="btn btn-ghost" @click="exportFiltered('txt')">导出筛选 TXT</button>
      <button type="button" class="btn btn-ghost" @click="exportFiltered('csv')">导出筛选 CSV</button>
    </div>
    <div class="rows scroll-y">
      <div v-for="(row, index) in filtered" :key="index" class="row" :class="levelClass(row.payload?.level)">
        <span class="t">{{ formatTime(row.timestamp) }}</span>
        <span class="lv">[{{ translateLogLevel(row.payload?.level) }}]</span>
        <span class="msg">{{ row.payload?.message }}</span>
        <span v-if="row.payload?.sensorId" class="sid">{{ row.payload.sensorId }}</span>
      </div>
      <div v-if="filtered.length === 0" class="empty">当前没有符合条件的日志。</div>
    </div>
  </div>
</template>

<style scoped>
.log-panel {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  min-height: 220px;
  max-height: 340px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}

.inp {
  flex: 1;
  min-width: 140px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--text);
  font-size: 0.85rem;
}

.sel,
.time {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--text);
  font-size: 0.85rem;
}

.rows {
  flex: 1;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.45;
}

.row {
  display: grid;
  grid-template-columns: 110px 64px 1fr auto;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid #1a222d;
  color: var(--muted);
}

.row.warn {
  color: var(--warn);
}

.row.err {
  color: var(--danger);
}

.msg {
  color: var(--text);
}

.sid {
  color: var(--accent);
  font-size: 11px;
}

.empty {
  color: var(--muted);
  padding: 16px;
  text-align: center;
}
</style>
