<!-- 传感器面板 -->
<script setup>
import { ref } from 'vue';

const props = defineProps({
  sensors: { type: Array, default: () => [] },
  hidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update', 'remove', 'add', 'resetDefaults']);

const types = [
  { id: 'ultrasonic', label: '超声波' },
  { id: 'infrared', label: '红外' },
  { id: 'imu', label: '陀螺仪/加速度计' },
];

const addType = ref('ultrasonic');

function patch(id, partial) {
  emit('update', { sensorId: id, ...partial });
}

function addSensor() {
  emit('add', addType.value);
}
</script>

<template>
  <div v-show="!hidden" class="sensor-panel panel scroll-y">
    <div class="head">
      <span class="panel-title" style="margin: 0">传感器</span>
      <div class="add-row">
        <select v-model="addType" class="sel">
          <option v-for="t in types" :key="t.id" :value="t.id">{{ t.label }}</option>
        </select>
        <button type="button" class="btn btn-primary" @click="addSensor">添加</button>
      </div>
    </div>

    <div v-for="s in sensors" :key="s.sensorId" class="card">
      <div class="card-h">
        <label class="name-inp">
          名称
          <input type="text" maxlength="40" :value="s.name || ''" @change="patch(s.sensorId, { name: $event.target.value })" />
        </label>
        <span class="badge">{{ s.sensorType }}</span>
        <label class="en">
          <input type="checkbox" :checked="s.enabled" @change="patch(s.sensorId, { enabled: $event.target.checked })" />
          启用
        </label>
        <button type="button" class="btn btn-ghost sm" @click="emit('resetDefaults', s.sensorId)">恢复默认</button>
        <button type="button" class="btn btn-ghost sm" @click="emit('remove', s.sensorId)">删除</button>
      </div>

      <template v-if="s.sensorType === 'ultrasonic'">
        <div class="grid2">
          <label>量程 (cm) <input type="number" min="1" max="1000" :value="s.rangeCm" @change="patch(s.sensorId, { rangeCm: +$event.target.value })" /></label>
          <label>波束角 (°) <input type="number" min="1" max="180" :value="s.beamDeg" @change="patch(s.sensorId, { beamDeg: +$event.target.value })" /></label>
          <label>采样 (Hz) <input type="number" min="0.5" max="100" step="0.5" :value="s.frequency" @change="patch(s.sensorId, { frequency: +$event.target.value })" /></label>
          <label>噪声 <input type="number" min="0" max="1" step="0.01" :value="s.noise" @change="patch(s.sensorId, { noise: +$event.target.value })" /></label>
          <label>安装角 (rad) <input type="number" min="-6.283" max="6.283" step="0.01" :value="s.mountAngle" @change="patch(s.sensorId, { mountAngle: +$event.target.value })" /></label>
          <label>系统误差 <input type="number" min="-1" max="1" step="0.001" :value="s.sysError" @change="patch(s.sensorId, { sysError: +$event.target.value })" /></label>
        </div>
      </template>

      <template v-else-if="s.sensorType === 'infrared'">
        <div class="grid2">
          <label>量程 (cm) <input type="number" min="1" max="1000" :value="s.rangeCm" @change="patch(s.sensorId, { rangeCm: +$event.target.value })" /></label>
          <label>采样 (Hz) <input type="number" min="0.5" max="100" step="0.5" :value="s.frequency" @change="patch(s.sensorId, { frequency: +$event.target.value })" /></label>
          <label>噪声 <input type="number" min="0" max="1" step="0.01" :value="s.noise" @change="patch(s.sensorId, { noise: +$event.target.value })" /></label>
          <label>灵敏度 <input type="number" min="0" max="5" step="0.05" :value="s.sensitivity" @change="patch(s.sensorId, { sensitivity: +$event.target.value })" /></label>
          <label>模式
            <select :value="s.outputMode" @change="patch(s.sensorId, { outputMode: $event.target.value })">
              <option value="analog">模拟强度</option>
              <option value="binary">二值</option>
            </select>
          </label>
          <label>阈值 (二值) <input type="number" min="0" max="1" step="0.05" :value="s.threshold" @change="patch(s.sensorId, { threshold: +$event.target.value })" /></label>
        </div>
      </template>

      <template v-else-if="s.sensorType === 'imu'">
        <div class="grid2">
          <label>采样 (Hz) <input type="number" min="0.5" max="100" step="0.5" :value="s.frequency" @change="patch(s.sensorId, { frequency: +$event.target.value })" /></label>
          <label>陀螺噪声 <input type="number" min="0" max="10" step="0.01" :value="s.noiseGyro" @change="patch(s.sensorId, { noiseGyro: +$event.target.value })" /></label>
          <label>加速度噪声 <input type="number" min="0" max="20" step="0.01" :value="s.noiseAccel" @change="patch(s.sensorId, { noiseAccel: +$event.target.value })" /></label>
          <label>漂移系数 <input type="number" min="0" max="1" step="0.001" :value="s.driftCoeff" @change="patch(s.sensorId, { driftCoeff: +$event.target.value })" /></label>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sensor-panel {
  padding: 12px 14px;
  max-height: 70vh;
}
.head {
  margin-bottom: 12px;
}
.add-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.sel {
  flex: 1;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--text);
}
.card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: rgba(0, 0, 0, 0.15);
}
.card-h {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.name-inp {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 10px;
  color: var(--muted);
  min-width: 120px;
  flex: 1;
}
.name-inp input {
  font-weight: 600;
  color: var(--text);
}
.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #1e2630;
  color: var(--accent);
}
.en {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--muted);
  margin-left: auto;
}
.sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}
input,
select {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  color: var(--text);
  font-size: 12px;
}
</style>
