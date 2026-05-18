<script setup>
// 仿真日志面板
import { computed, ref } from 'vue';

const props = defineProps({
  logs: { type: Array, default: () => [] },
  hidden: { type: Boolean, default: false },
});

const emit = defineEmits(['export', 'exportFiltered']);

const q = ref('');
const level = ref('all');
const startAt = ref('');
const endAt = ref('');

const filtered = computed(() => {
  let list = props.logs.slice().reverse();
  if (level.value !== 'all') {
    list = list.filter((l) => l.payload?.level === level.value);
  }
  if (q.value.trim()) {
    const s = q.value.toLowerCase();
    list = list.filter((l) => JSON.stringify(l.payload || {}).toLowerCase().includes(s));
  }
  const startMs = startAt.value ? new Date(startAt.value).getTime() : null;
  if (startMs !== null && !Number.isNaN(startMs)) {
    list = list.filter((l) => l.timestamp >= startMs);
  }
  const endMs = endAt.value ? new Date(endAt.value).getTime() : null;
  if (endMs !== null && !Number.isNaN(endMs)) {
    list = list.filter((l) => l.timestamp <= endMs);
  }
  return list.slice(0, 400);
});

function levelClass(lv) {
  if (lv === 'warning') return 'warn';
  if (lv === 'error') return 'err';
  return '';
}

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function exportFiltered(kind) {
  const rows = [...filtered.value].reverse();
  emit('exportFiltered', { kind, rows });
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
      <input v-model="q" class="inp" placeholder="搜索…" />
      <input v-model="startAt" class="time" type="datetime-local" title="开始时间" />
      <input v-model="endAt" class="time" type="datetime-local" title="结束时间" />
      <select v-model="level" class="sel">
        <option value="all">全部级别</option>
        <option value="info">info</option>
        <option value="warning">warning</option>
        <option value="error">error</option>
      </select>
      <button type="button" class="btn btn-ghost" @click="clearTimeFilter">清空时间</button>
      <button type="button" class="btn btn-ghost" @click="emit('export', 'txt')">全部 TXT</button>
      <button type="button" class="btn btn-ghost" @click="emit('export', 'csv')">全部 CSV</button>
      <button type="button" class="btn btn-ghost" @click="exportFiltered('txt')">筛选 TXT</button>
      <button type="button" class="btn btn-ghost" @click="exportFiltered('csv')">筛选 CSV</button>
    </div>
    <div class="rows scroll-y">
      <div v-for="(row, i) in filtered" :key="i" class="row" :class="levelClass(row.payload?.level)">
        <span class="t">{{ fmtTime(row.timestamp) }}</span>
        <span class="lv">[{{ row.payload?.level || '-' }}]</span>
        <span class="msg">{{ row.payload?.message }}</span>
        <span v-if="row.payload?.sensorId" class="sid">{{ row.payload.sensorId }}</span>
      </div>
      <div v-if="filtered.length === 0" class="empty">暂无日志</div>
    </div>
  </div>
</template>

<style scoped>
.log-panel {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  min-height: 200px;
  max-height: 320px;
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
  min-width: 120px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--text);
  font-size: 0.85rem;
}
.sel {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--text);
  font-size: 0.85rem;
}
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
  grid-template-columns: 92px 64px 1fr auto;
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
.t {
  opacity: 0.85;
}
.lv {
  opacity: 0.75;
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
