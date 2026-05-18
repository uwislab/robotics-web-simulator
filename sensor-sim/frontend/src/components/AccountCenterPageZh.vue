<script setup>
// 账户中心页面
import { computed, ref, toRefs, unref } from 'vue';

const props = defineProps({
  account: { type: Object, required: true },
  scene: { type: Object, required: true },
  sensors: { type: Array, default: () => [] },
  recordRows: { type: Array, default: () => [] },
  recordTotal: { type: Number, default: 0 },
  activePresetTitle: { type: String, default: '' },
  onApplyScene: { type: Function, default: null },
  onApplyRobot: { type: Function, default: null },
  onApplyFull: { type: Function, default: null },
  onToast: { type: Function, default: null },
});

const { scene, sensors, recordRows, recordTotal, activePresetTitle } = toRefs(props);

const accountState = computed(() => ({
  isLoggedIn: !!unref(props.account.isLoggedIn),
  user: unref(props.account.user),
  authLoading: !!unref(props.account.authLoading),
  dataLoading: !!unref(props.account.dataLoading),
  error: unref(props.account.error) || '',
  presets: unref(props.account.presets) || [],
  history: unref(props.account.history) || [],
}));

const authMode = ref('login');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const scenePresetName = ref('');
const robotPresetName = ref('');
const historyName = ref('');
const selectedHistory = ref(null);
const detailLoading = ref(false);

const allPresets = computed(() => accountState.value.presets);
const allHistory = computed(() => accountState.value.history);
const scenePresets = computed(() => allPresets.value.filter((item) => item.category === 'scene'));
const robotPresets = computed(() => allPresets.value.filter((item) => item.category === 'robot'));
const fullPresets = computed(() => allPresets.value.filter((item) => item.category === 'full'));

function notify(message) {
  if (props.onToast) props.onToast(message);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleString('zh-CN');
}

async function handleLogin() {
  const ok = await props.account.login(username.value, password.value);
  if (ok) {
    username.value = '';
    password.value = '';
    notify('登录成功');
  }
}

async function handleRegister() {
  if (password.value !== confirmPassword.value) {
    notify('两次输入的密码不一致');
    return;
  }
  const ok = await props.account.register(username.value, password.value);
  if (ok) {
    username.value = '';
    password.value = '';
    confirmPassword.value = '';
    notify('注册成功');
  }
}

function buildDefaultName(prefix) {
  const now = new Date().toLocaleString('zh-CN');
  return `${prefix} ${now}`;
}

async function saveScenePreset() {
  const name = scenePresetName.value.trim() || buildDefaultName('场景预设');
  const preset = await props.account.createPreset({
    name,
    category: 'scene',
    scene: scene.value,
  });
  if (preset) {
    scenePresetName.value = '';
    notify('已保存场景预设');
  }
}

async function saveRobotPreset() {
  const name = robotPresetName.value.trim() || buildDefaultName('机器人预设');
  const preset = await props.account.createPreset({
    name,
    category: 'robot',
    robot: scene.value.robot,
    sensors: sensors.value,
  });
  if (preset) {
    robotPresetName.value = '';
    notify('已保存机器人预设');
  }
}

async function saveFullPreset() {
  const name = buildDefaultName('组合预设');
  const preset = await props.account.createPreset({
    name,
    category: 'full',
    scene: scene.value,
    robot: scene.value.robot,
    sensors: sensors.value,
  });
  if (preset) notify('已保存组合预设');
}

async function saveHistory() {
  if (!recordRows.value.length) {
    notify('当前没有可保存的采样记录');
    return;
  }
  const name = historyName.value.trim() || buildDefaultName('仿真记录');
  const records = recordRows.value.slice(-5000);
  const payload = {
    name,
    scene: scene.value,
    sensors: sensors.value,
    records,
    stats: {
      totalRecords: recordTotal.value,
      storedRecords: records.length,
      sensorCount: sensors.value.length,
    },
  };
  const item = await props.account.createHistory(payload);
  if (item) {
    historyName.value = '';
    notify('已保存历史记录');
  }
}

async function openHistoryDetail(item) {
  selectedHistory.value = null;
  detailLoading.value = true;
  const detail = await props.account.fetchHistoryDetail(item.id);
  selectedHistory.value = detail;
  detailLoading.value = false;
}

async function removePreset(item) {
  if (!window.confirm(`确定删除预设「${item.name}」吗？`)) return;
  const ok = await props.account.deletePreset(item.id);
  if (ok) notify('已删除预设');
}

async function removeHistory(item) {
  if (!window.confirm(`确定删除记录「${item.name}」吗？`)) return;
  const ok = await props.account.deleteHistory(item.id);
  if (ok) {
    notify('已删除记录');
    if (selectedHistory.value?.id === item.id) selectedHistory.value = null;
  }
}
</script>

<template>
  <section class="account-page">
    <div class="page-hero panel">
      <div>
        <p class="eyebrow">账号中心</p>
        <h2>登录后即可保存个人预设与历史数据，跨会话延续仿真工作流。</h2>
        <p class="muted">
          当前预设：{{ activePresetTitle || '自定义工作区' }}，传感器数量：{{ sensors.length }}，采样总数：{{ recordTotal }}
        </p>
      </div>
      <div class="hero-actions">
        <span v-if="accountState.isLoggedIn && accountState.user" class="user-chip">当前用户：{{ accountState.user.username }}</span>
        <span v-else class="user-chip">游客模式</span>
        <button v-if="accountState.isLoggedIn" type="button" class="btn btn-ghost" @click="account.loadAll()">刷新数据</button>
        <button v-if="accountState.isLoggedIn" type="button" class="btn" :disabled="accountState.authLoading" @click="account.logout()">
          退出登录
        </button>
      </div>
    </div>

    <div v-if="!accountState.isLoggedIn" class="auth-grid">
      <div class="panel auth-card">
        <div class="auth-tabs">
          <button type="button" class="tab-btn" :class="{ active: authMode === 'login' }" @click="authMode = 'login'">
            登录
          </button>
          <button type="button" class="tab-btn" :class="{ active: authMode === 'register' }" @click="authMode = 'register'">
            注册
          </button>
        </div>
        <div class="form">
          <label>用户名<input v-model="username" type="text" placeholder="3-32 字符" /></label>
          <label>密码<input v-model="password" type="password" placeholder="至少 6 位" /></label>
          <label v-if="authMode === 'register'">确认密码<input v-model="confirmPassword" type="password" /></label>
          <button
            v-if="authMode === 'login'"
            type="button"
            class="btn btn-primary"
            :disabled="accountState.authLoading"
            @click="handleLogin"
          >
            登录
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            :disabled="accountState.authLoading"
            @click="handleRegister"
          >
            注册并登录
          </button>
          <p v-if="accountState.error" class="error">{{ accountState.error }}</p>
        </div>
      </div>

      <div class="panel auth-note">
        <h3>账号系统说明</h3>
        <p>登录后可保存个人预设场景、机器人配置以及历史采样记录。</p>
        <p>数据存储在本地 MySQL 中，适合课程设计与个人仿真资料管理。</p>
        <p>进入系统默认游客模式，如需账号功能请在此页登录。</p>
      </div>
    </div>

    <div v-else class="account-grid">
      <section class="panel block">
        <div class="block-head">
          <div>
            <p class="eyebrow">场景预设</p>
            <h3>保存当前场景布局与环境参数</h3>
          </div>
        </div>
        <div class="preset-form">
          <input v-model="scenePresetName" type="text" placeholder="预设名称（可选）" />
          <button type="button" class="btn btn-primary" :disabled="accountState.dataLoading" @click="saveScenePreset">
            保存场景预设
          </button>
        </div>
        <div class="preset-list">
          <div v-for="item in scenePresets" :key="item.id" class="preset-item">
            <div>
              <strong>{{ item.name }}</strong>
              <span>{{ formatTime(item.createdAt) }}</span>
            </div>
            <div class="item-actions">
              <button type="button" class="btn btn-ghost" @click="onApplyScene && onApplyScene(item)">应用</button>
              <button type="button" class="btn" @click="removePreset(item)">删除</button>
            </div>
          </div>
          <p v-if="!scenePresets.length" class="muted">暂无场景预设。</p>
        </div>
      </section>

      <section class="panel block">
        <div class="block-head">
          <div>
            <p class="eyebrow">机器人预设</p>
            <h3>保存机器人姿态与传感器配置</h3>
          </div>
        </div>
        <div class="preset-form">
          <input v-model="robotPresetName" type="text" placeholder="预设名称（可选）" />
          <button type="button" class="btn btn-primary" :disabled="accountState.dataLoading" @click="saveRobotPreset">
            保存机器人预设
          </button>
        </div>
        <div class="preset-list">
          <div v-for="item in robotPresets" :key="item.id" class="preset-item">
            <div>
              <strong>{{ item.name }}</strong>
              <span>{{ formatTime(item.createdAt) }}</span>
            </div>
            <div class="item-actions">
              <button type="button" class="btn btn-ghost" @click="onApplyRobot && onApplyRobot(item)">应用</button>
              <button type="button" class="btn" @click="removePreset(item)">删除</button>
            </div>
          </div>
          <p v-if="!robotPresets.length" class="muted">暂无机器人预设。</p>
        </div>
      </section>

      <section class="panel block">
        <div class="block-head">
          <div>
            <p class="eyebrow">组合预设</p>
            <h3>同时保存场景与机器人配置</h3>
          </div>
        </div>
        <div class="preset-list">
          <div v-for="item in fullPresets" :key="item.id" class="preset-item">
            <div>
              <strong>{{ item.name }}</strong>
              <span>{{ formatTime(item.createdAt) }}</span>
            </div>
            <div class="item-actions">
              <button type="button" class="btn btn-ghost" @click="onApplyFull && onApplyFull(item)">应用</button>
              <button type="button" class="btn" @click="removePreset(item)">删除</button>
            </div>
          </div>
          <p v-if="!fullPresets.length" class="muted">暂无组合预设。</p>
        </div>
        <div class="preset-form">
          <button type="button" class="btn" :disabled="accountState.dataLoading" @click="saveFullPreset">
            保存组合预设
          </button>
        </div>
      </section>

      <section class="panel block">
        <div class="block-head">
          <div>
            <p class="eyebrow">历史记录</p>
            <h3>保存采样结果以便回溯与对比</h3>
          </div>
        </div>
        <div class="preset-form">
          <input v-model="historyName" type="text" placeholder="记录名称（可选）" />
          <button type="button" class="btn btn-primary" :disabled="accountState.dataLoading" @click="saveHistory">
            保存本次记录
          </button>
        </div>
        <div class="preset-list">
          <div v-for="item in allHistory" :key="item.id" class="preset-item">
            <div>
              <strong>{{ item.name }}</strong>
              <span>{{ formatTime(item.createdAt) }} · {{ item.recordCount }} 条</span>
            </div>
            <div class="item-actions">
              <button type="button" class="btn btn-ghost" @click="openHistoryDetail(item)">查看</button>
              <button type="button" class="btn" @click="removeHistory(item)">删除</button>
            </div>
          </div>
          <p v-if="!allHistory.length" class="muted">暂无历史记录。</p>
        </div>
        <div v-if="detailLoading" class="history-detail muted">正在加载详情...</div>
        <div v-else-if="selectedHistory" class="history-detail">
          <h4>{{ selectedHistory.name }}</h4>
          <p>创建时间：{{ formatTime(selectedHistory.createdAt) }}</p>
          <p>存储记录数：{{ selectedHistory.recordCount }}</p>
          <pre>{{ JSON.stringify(selectedHistory.stats || {}, null, 2) }}</pre>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.account-page { display: flex; flex-direction: column; gap: 16px; }
.page-hero { padding: 18px 20px; display: flex; justify-content: space-between; gap: 20px; }
.eyebrow { margin: 0 0 6px; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--accent); }
.muted { color: var(--muted); line-height: 1.6; }
.hero-actions { display: flex; gap: 10px; align-items: flex-start; }
.user-chip { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border); font-size: 0.78rem; color: var(--muted); }
.auth-grid { display: grid; grid-template-columns: minmax(280px, 420px) 1fr; gap: 16px; }
.auth-card { padding: 18px 20px; }
.auth-note { padding: 18px 20px; }
.auth-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tab-btn { flex: 1; border: 1px solid var(--border); background: rgba(255,255,255,0.03); color: var(--muted); padding: 0.6rem 0.9rem; border-radius: 10px; }
.tab-btn.active { border-color: var(--accent); color: var(--text); background: rgba(61, 214, 198, 0.12); }
.form { display: flex; flex-direction: column; gap: 12px; }
.form label { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 0.85rem; }
.form input { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); }
.error { color: var(--danger); margin: 0; }
.account-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.block { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.block-head h3 { margin: 0; }
.preset-form { display: flex; flex-wrap: wrap; gap: 10px; }
.preset-form input { flex: 1; min-width: 220px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); }
.preset-list { display: flex; flex-direction: column; gap: 10px; }
.preset-item { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: rgba(255,255,255,0.03); }
.preset-item strong { display: block; }
.preset-item span { font-size: 0.8rem; color: var(--muted); }
.item-actions { display: flex; gap: 8px; }
.history-detail { padding: 12px; border: 1px dashed var(--border); border-radius: 10px; background: rgba(255,255,255,0.02); }
.history-detail pre { margin: 8px 0 0; font-size: 0.75rem; color: var(--muted); white-space: pre-wrap; }
@media (max-width: 1180px) {
  .auth-grid, .account-grid { grid-template-columns: 1fr; }
  .page-hero { flex-direction: column; }
}
</style>
