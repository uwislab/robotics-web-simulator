const STORAGE_KEYS = {
  workspace: "robot-script-studio.obstacle-layout.workspace",
  savedLayouts: "robot-script-studio.obstacle-layout.saved-layouts"
};

const DEFAULT_LAYOUT_NAME = "默认布局";

function getStorage() {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("当前环境不支持浏览器本地存储。");
  }

  return window.localStorage;
}

function safeParse(json, fallback) {
  if (!json) {
    return fallback;
  }

  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function normalizeObstacleLayoutName(name, fallback = DEFAULT_LAYOUT_NAME) {
  const trimmed = String(name ?? "").trim().replace(/\.json$/i, "");
  return trimmed || fallback;
}

export function normalizeObstacleEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  let nextId = 1;
  const usedIds = new Set();

  function allocateId(preferredId) {
    if (Number.isInteger(preferredId) && preferredId > 0 && !usedIds.has(preferredId)) {
      usedIds.add(preferredId);
      nextId = Math.max(nextId, preferredId + 1);
      return preferredId;
    }

    while (usedIds.has(nextId)) {
      nextId += 1;
    }

    const allocatedId = nextId;
    usedIds.add(allocatedId);
    nextId += 1;
    return allocatedId;
  }

  return entries
    .map((entry) => ({
      id: Number(entry?.id),
      x: Number(entry?.x),
      z: Number(entry?.z),
      width: Number(entry?.width),
      depth: Number(entry?.depth),
      height: Number(entry?.height)
    }))
    .filter((entry) =>
      [entry.x, entry.z, entry.width, entry.depth, entry.height].every((value) =>
        Number.isFinite(value)
      )
    )
    .map((entry) => ({
      id: allocateId(entry.id),
      x: entry.x,
      z: entry.z,
      width: entry.width,
      depth: entry.depth,
      height: entry.height
    }));
}

function sortObstacleLayouts(layouts) {
  return [...layouts].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function normalizeObstacleLayout(layout) {
  const now = new Date().toISOString();

  return {
    id: String(layout?.id ?? generateObstacleLayoutId()),
    name: normalizeObstacleLayoutName(layout?.name, DEFAULT_LAYOUT_NAME),
    axesVisible: Boolean(layout?.axesVisible),
    obstacles: normalizeObstacleEntries(layout?.obstacles),
    createdAt: layout?.createdAt || now,
    updatedAt: layout?.updatedAt || now
  };
}

export function generateObstacleLayoutId() {
  return `obstacle-layout-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function readObstacleLayouts() {
  const storage = getStorage();
  const parsed = safeParse(storage.getItem(STORAGE_KEYS.savedLayouts), []);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return sortObstacleLayouts(parsed.map((item) => normalizeObstacleLayout(item)));
}

export function writeObstacleLayouts(layouts) {
  const storage = getStorage();
  const normalized = sortObstacleLayouts(
    (layouts ?? []).map((item) => normalizeObstacleLayout(item))
  );
  storage.setItem(STORAGE_KEYS.savedLayouts, JSON.stringify(normalized));
  return normalized;
}

export function readObstacleLayoutWorkspace() {
  const storage = getStorage();
  const parsed = safeParse(storage.getItem(STORAGE_KEYS.workspace), null);

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  return {
    currentLayoutId: parsed.currentLayoutId ? String(parsed.currentLayoutId) : null,
    currentLayoutName: normalizeObstacleLayoutName(
      parsed.currentLayoutName,
      DEFAULT_LAYOUT_NAME
    ),
    axesVisible: Boolean(parsed.axesVisible),
    obstacles: normalizeObstacleEntries(parsed.obstacles),
    updatedAt: parsed.updatedAt || null
  };
}

export function writeObstacleLayoutWorkspace(workspace) {
  const storage = getStorage();
  const normalized = {
    currentLayoutId: workspace?.currentLayoutId ? String(workspace.currentLayoutId) : null,
    currentLayoutName: normalizeObstacleLayoutName(
      workspace?.currentLayoutName,
      DEFAULT_LAYOUT_NAME
    ),
    axesVisible: Boolean(workspace?.axesVisible),
    obstacles: normalizeObstacleEntries(workspace?.obstacles),
    updatedAt: workspace?.updatedAt || new Date().toISOString()
  };

  storage.setItem(STORAGE_KEYS.workspace, JSON.stringify(normalized));
  return normalized;
}

export function upsertObstacleLayout(layouts, nextLayout) {
  const normalized = normalizeObstacleLayout(nextLayout);
  const remaining = (layouts ?? []).filter((item) => item.id !== normalized.id);
  return sortObstacleLayouts([normalized, ...remaining]);
}
