const ENV_BASE = import.meta.env.VITE_API_URL;
const API_HOST = import.meta.env.VITE_API_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
const API_PORT = import.meta.env.VITE_API_PORT || '3001';
const API_PROTO = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http';
const API_BASE = ENV_BASE || `${API_PROTO}://${API_HOST}:${API_PORT}/api`;

export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, token } = options;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || '请求失败';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload?.data ?? payload;
}
