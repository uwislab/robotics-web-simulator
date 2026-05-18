import { ref, shallowRef, onUnmounted } from 'vue';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export function useWebSocket(handlers = {}) {
  const connected = ref(false);
  const reconnecting = ref(false);
  const lastError = shallowRef(null);
  let ws = null;
  let reconnectTimer = null;
  let pingTimer = null;
  let manualClose = false;
  let attempt = 0;

  function clearPing() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function connect() {
    manualClose = false;
    if (ws?.readyState === WebSocket.OPEN) return;
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      lastError.value = String(e);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected.value = true;
      reconnecting.value = false;
      attempt = 0;
      handlers.onOpen?.();
      send({ type: 'get_state', payload: {} });
      clearPing();
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', payload: {} }));
        }
      }, 25000);
    };

    ws.onclose = () => {
      clearPing();
      connected.value = false;
      handlers.onClose?.();
      if (!manualClose) scheduleReconnect();
    };

    ws.onerror = () => {
      lastError.value = 'WebSocket 错误';
      handlers.onError?.();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        handlers.onMessage?.(msg);
      } catch {
        /* ignore */
      }
    };
  }

  function scheduleReconnect() {
    if (manualClose) return;
    reconnecting.value = true;
    const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
    attempt += 1;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(), delay);
  }

  function send(obj) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  function close() {
    manualClose = true;
    clearPing();
    clearTimeout(reconnectTimer);
    ws?.close();
    ws = null;
  }

  connect();

  onUnmounted(() => close());

  return { connected, reconnecting, lastError, send, connect };
}
