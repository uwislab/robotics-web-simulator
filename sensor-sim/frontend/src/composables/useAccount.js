import { computed, ref } from 'vue';
import { apiRequest } from '../lib/apiClient.js';

export function useAccount() {
  const user = ref(null);
  const token = ref('');
  const authLoading = ref(false);
  const dataLoading = ref(false);
  const error = ref('');
  const presets = ref([]);
  const history = ref([]);

  const isLoggedIn = computed(() => !!token.value && !!user.value);

  function setError(message) {
    error.value = message || '';
  }

  function storeAuth(nextToken, nextUser) {
    token.value = nextToken || '';
    user.value = nextUser || null;
  }

  function clearAuth() {
    token.value = '';
    user.value = null;
  }

  async function fetchProfile() {
    if (!token.value) return;
    try {
      const data = await apiRequest('/auth/me', { token: token.value });
      user.value = data.user;
      setError('');
    } catch (err) {
      clearAuth();
      setError(err.message || '登录已失效');
    }
  }

  async function login(username, password) {
    authLoading.value = true;
    setError('');
    try {
      const data = await apiRequest('/auth/login', { method: 'POST', body: { username, password } });
      storeAuth(data.token, data.user);
      await loadAll();
      return true;
    } catch (err) {
      setError(err.message || '登录失败');
      return false;
    } finally {
      authLoading.value = false;
    }
  }

  async function register(username, password) {
    authLoading.value = true;
    setError('');
    try {
      const data = await apiRequest('/auth/register', { method: 'POST', body: { username, password } });
      storeAuth(data.token, data.user);
      await loadAll();
      return true;
    } catch (err) {
      setError(err.message || '注册失败');
      return false;
    } finally {
      authLoading.value = false;
    }
  }

  async function logout() {
    authLoading.value = true;
    try {
      if (token.value) {
        await apiRequest('/auth/logout', { method: 'POST', token: token.value });
      }
    } catch {
      /* ignore */
    } finally {
      clearAuth();
      presets.value = [];
      history.value = [];
      authLoading.value = false;
      dataLoading.value = false;
      setError('');
    }
  }

  async function loadPresets() {
    if (!token.value) return;
    dataLoading.value = true;
    try {
      const data = await apiRequest('/presets', { token: token.value });
      presets.value = data.presets || [];
    } catch (err) {
      setError(err.message || '加载预设失败');
    } finally {
      dataLoading.value = false;
    }
  }

  async function loadHistory() {
    if (!token.value) return;
    dataLoading.value = true;
    try {
      const data = await apiRequest('/history', { token: token.value });
      history.value = data.history || [];
    } catch (err) {
      setError(err.message || '加载记录失败');
    } finally {
      dataLoading.value = false;
    }
  }

  async function loadAll() {
    await Promise.all([loadPresets(), loadHistory()]);
  }

  async function createPreset(payload) {
    if (!token.value) return null;
    dataLoading.value = true;
    setError('');
    try {
      const data = await apiRequest('/presets', { method: 'POST', body: payload, token: token.value });
      presets.value = [data.preset, ...presets.value];
      return data.preset;
    } catch (err) {
      setError(err.message || '保存预设失败');
      return null;
    } finally {
      dataLoading.value = false;
    }
  }

  async function deletePreset(id) {
    if (!token.value) return false;
    dataLoading.value = true;
    setError('');
    try {
      await apiRequest(`/presets/${id}`, { method: 'DELETE', token: token.value });
      presets.value = presets.value.filter((item) => item.id !== id);
      return true;
    } catch (err) {
      setError(err.message || '删除预设失败');
      return false;
    } finally {
      dataLoading.value = false;
    }
  }

  async function createHistory(payload) {
    if (!token.value) return null;
    dataLoading.value = true;
    setError('');
    try {
      const data = await apiRequest('/history', { method: 'POST', body: payload, token: token.value });
      history.value = [data.history, ...history.value];
      return data.history;
    } catch (err) {
      setError(err.message || '保存记录失败');
      return null;
    } finally {
      dataLoading.value = false;
    }
  }

  async function fetchHistoryDetail(id) {
    if (!token.value) return null;
    dataLoading.value = true;
    setError('');
    try {
      const data = await apiRequest(`/history/${id}`, { token: token.value });
      return data.history;
    } catch (err) {
      setError(err.message || '加载详情失败');
      return null;
    } finally {
      dataLoading.value = false;
    }
  }

  async function deleteHistory(id) {
    if (!token.value) return false;
    dataLoading.value = true;
    setError('');
    try {
      await apiRequest(`/history/${id}`, { method: 'DELETE', token: token.value });
      history.value = history.value.filter((item) => item.id !== id);
      return true;
    } catch (err) {
      setError(err.message || '删除记录失败');
      return false;
    } finally {
      dataLoading.value = false;
    }
  }

  return {
    user,
    token,
    isLoggedIn,
    authLoading,
    dataLoading,
    error,
    presets,
    history,
    login,
    register,
    logout,
    loadPresets,
    loadHistory,
    loadAll,
    createPreset,
    deletePreset,
    createHistory,
    fetchHistoryDetail,
    deleteHistory,
    fetchProfile,
  };
}
