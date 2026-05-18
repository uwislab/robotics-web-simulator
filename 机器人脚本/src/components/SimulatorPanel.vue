<script setup>
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  generateObstacleLayoutId,
  normalizeObstacleEntries,
  normalizeObstacleLayoutName,
  readObstacleLayoutWorkspace,
  readObstacleLayouts,
  upsertObstacleLayout,
  writeObstacleLayoutWorkspace,
  writeObstacleLayouts
} from "../core/obstacleLayoutStorage.js";

const emit = defineEmits(["scene-log"]);

const mountRef = ref(null);
const layoutFileInputRef = ref(null);
const managementExpanded = ref(false);
const axesVisible = ref(true);
const obstacleEntries = ref([]);
const currentLayoutId = ref(null);
const currentLayoutName = ref("默认布局");
const savedObstacleLayouts = ref([]);
const layoutStatus = ref("当前障碍布局会自动保存到浏览器草稿。");

const GROUND_TILE_SIZE = 2200;
const GROUND_GRID_DIVISIONS = 48;
const GROUND_ANCHOR_STEP = 100;
const GROUND_RECENTER_MARGIN = 520;
const SENSOR_MAX_DISTANCE = 1000000;
const ROBOT_Y = 0;
const ROBOT_RADIUS = 18;
const DEFAULT_SENSOR_VALUES = {
  TEMPERATURE: 24.5,
  LIGHT: 420,
  BATTERY: 92
};
const COLLISION_STOP_MESSAGE = "机器人碰到障碍物，当前运行已停止。";
const DEFAULT_LAYOUT_NAME = "默认布局";
const IMPORTED_LAYOUT_FALLBACK_NAME = "导入布局";
const OBSTACLE_LAYOUT_EXPORT_TYPE = "robot-script-studio.obstacle-layout";
const OBSTACLE_LAYOUT_EXPORT_VERSION = 2;
const SUPPORTED_OBSTACLE_LAYOUT_IMPORT_VERSIONS = new Set([
  1,
  OBSTACLE_LAYOUT_EXPORT_VERSION
]);

const obstacleForm = reactive({
  x: 120,
  z: 0,
  width: 64,
  depth: 64,
  height: 48
});

const latestSensors = reactive({
  DISTANCE: 0,
  TEMPERATURE: DEFAULT_SENSOR_VALUES.TEMPERATURE,
  LIGHT: DEFAULT_SENSOR_VALUES.LIGHT,
  BATTERY: DEFAULT_SENSOR_VALUES.BATTERY
});

const distanceLabel = computed(() => {
  return Number.isFinite(latestSensors.DISTANCE)
    ? `${latestSensors.DISTANCE.toFixed(1)} cm`
    : "无遮挡";
});
const currentLayoutBindingLabel = computed(() => {
  return currentLayoutId.value
    ? "当前布局已关联到浏览器中的已保存布局。"
    : "当前布局还是临时草稿。";
});
const managementCollapsedSummary = computed(() => {
  const layoutName = currentLayoutName.value || DEFAULT_LAYOUT_NAME;
  return `${layoutName} · ${obstacleEntries.value.length} 个障碍物 · ${savedObstacleLayouts.value.length} 个已保存布局`;
});
const sceneHudCollapsed = ref(false);
const sceneHudMode = ref("pose");
const sceneHudMenuOpen = ref(false);
const sceneHudSwitchRef = ref(null);
const sceneHudTitle = computed(() => (sceneHudMode.value === "pose" ? "机器人位置" : "传感器读数"));
const sceneHudOptions = [
  { value: "pose", label: "机器人位置" },
  { value: "sensors", label: "传感器读数" }
];

function toggleSceneHudMenu() {
  sceneHudMenuOpen.value = !sceneHudMenuOpen.value;
}

function toggleSceneHudCollapsed() {
  sceneHudCollapsed.value = !sceneHudCollapsed.value;
  if (sceneHudCollapsed.value) {
    sceneHudMenuOpen.value = false;
  }
}

function selectSceneHudMode(mode) {
  sceneHudMode.value = mode;
  sceneHudMenuOpen.value = false;
}

function handleSceneHudOutsidePointerDown(event) {
  if (!sceneHudMenuOpen.value) {
    return;
  }

  if (sceneHudSwitchRef.value?.contains(event.target)) {
    return;
  }

  sceneHudMenuOpen.value = false;
}

function formatHudValue(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

const sceneHudEntries = computed(() => {
  if (sceneHudMode.value === "pose") {
    return [
      { label: "X", value: formatHudValue(robotState.x) },
      { label: "Z", value: formatHudValue(robotState.z) },
      { label: "向", value: `${formatHudValue(robotState.heading)}°` },
      { label: "移", value: formatHudValue(robotState.travelled) }
    ];
  }

  return [
    { label: "距", value: distanceLabel.value === "无遮挡" ? "无" : formatHudValue(latestSensors.DISTANCE) },
    { label: "温", value: formatHudValue(latestSensors.TEMPERATURE) },
    { label: "光", value: formatHudValue(latestSensors.LIGHT, 0) },
    { label: "电", value: `${formatHudValue(latestSensors.BATTERY, 0)}%` }
  ];
});

let renderer;
let scene;
let camera;
let animationId = 0;
let robotGroup;
let sensorProbe;
let controls;
let axesHelper;
let obstacleGroup;
let raycaster;
let obstacleIdSeed = 1;
let layoutAutosaveTimer = 0;
let layoutStorageReady = false;
let groundGroup;

const obstacleMeshes = [];

const robotState = reactive({
  x: 0,
  z: 0,
  heading: 0,
  travelled: 0
});

const motionState = {
  current: null
};

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#f6efe4");

  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  camera.position.set(170, 190, 220);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mountRef.value.appendChild(renderer.domElement);

  raycaster = new THREE.Raycaster();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 20, 0);
  controls.minDistance = 90;
  controls.maxDistance = 520;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.update();

  const ambientLight = new THREE.AmbientLight("#fff6df", 1.5);
  const directionLight = new THREE.DirectionalLight("#ffe39d", 1.8);
  directionLight.position.set(120, 220, 80);
  directionLight.castShadow = true;
  directionLight.shadow.mapSize.set(2048, 2048);
  scene.add(ambientLight, directionLight);

  groundGroup = new THREE.Group();

  axesHelper = new THREE.AxesHelper(180);
  axesHelper.position.y = 0.5;
  axesHelper.visible = axesVisible.value;
  groundGroup.add(axesHelper);

  const grid = new THREE.GridHelper(
    GROUND_TILE_SIZE,
    GROUND_GRID_DIVISIONS,
    "#1f2937",
    "#94a3b8"
  );
  grid.position.y = 0.1;
  groundGroup.add(grid);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_TILE_SIZE, GROUND_TILE_SIZE),
    new THREE.MeshStandardMaterial({
      color: "#e7dcc7",
      metalness: 0.1,
      roughness: 0.9
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  groundGroup.add(ground);
  scene.add(groundGroup);

  obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);

  robotGroup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(24, 16, 28),
    new THREE.MeshStandardMaterial({ color: "#0f172a", metalness: 0.45, roughness: 0.25 })
  );
  body.position.y = 12;
  body.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(18, 10, 10),
    new THREE.MeshStandardMaterial({ color: "#f97316", metalness: 0.2, roughness: 0.45 })
  );
  head.position.set(0, 22, 11);
  head.castShadow = true;

  sensorProbe = new THREE.Mesh(
    new THREE.CylinderGeometry(2, 2, 8, 24),
    new THREE.MeshStandardMaterial({ color: "#f8fafc", metalness: 0.7, roughness: 0.2 })
  );
  sensorProbe.rotation.x = Math.PI / 2;
  sensorProbe.position.set(0, 19, 18);
  sensorProbe.castShadow = true;

  robotGroup.add(body, head, sensorProbe);
  scene.add(robotGroup);

  rebuildObstacleMeshes();
  syncRobot();
  resize();
  window.addEventListener("resize", resize);
}

function disposeObject(object) {
  if (!object?.traverse) {
    return;
  }

  object.traverse((child) => {
    if (!child.isMesh && !child.isLine && !child.isLineSegments) {
      return;
    }

    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
      return;
    }

    child.material?.dispose?.();
  });
}

function getObstacleBounds(entry) {
  const halfWidth = entry.width / 2;
  const halfDepth = entry.depth / 2;

  return {
    minX: entry.x - halfWidth,
    maxX: entry.x + halfWidth,
    minZ: entry.z - halfDepth,
    maxZ: entry.z + halfDepth
  };
}

function boxesOverlap2D(left, right) {
  return !(
    left.maxX <= right.minX ||
    left.minX >= right.maxX ||
    left.maxZ <= right.minZ ||
    left.minZ >= right.maxZ
  );
}

function circleIntersectsRect(x, z, radius, bounds) {
  const closestX = THREE.MathUtils.clamp(x, bounds.minX, bounds.maxX);
  const closestZ = THREE.MathUtils.clamp(z, bounds.minZ, bounds.maxZ);
  const deltaX = x - closestX;
  const deltaZ = z - closestZ;

  return deltaX * deltaX + deltaZ * deltaZ <= radius * radius;
}

function createObstacleMesh(entry) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(entry.width, entry.height, entry.depth),
    new THREE.MeshStandardMaterial({
      color: "#475569",
      emissive: "#0f172a",
      metalness: 0.24,
      roughness: 0.78
    })
  );

  mesh.position.set(entry.x, entry.height / 2, entry.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.obstacleId = entry.id;
  return mesh;
}

function rebuildObstacleMeshes() {
  if (!obstacleGroup) {
    return;
  }

  while (obstacleMeshes.length) {
    const mesh = obstacleMeshes.pop();
    obstacleGroup.remove(mesh);
    disposeObject(mesh);
  }

  obstacleEntries.value.forEach((entry) => {
    const mesh = createObstacleMesh(entry);
    obstacleMeshes.push(mesh);
    obstacleGroup.add(mesh);
  });

  refreshSensors({ forceEmit: true });
}

function setAxesVisibility() {
  if (axesHelper) {
    axesHelper.visible = axesVisible.value;
  }
}

function resize() {
  if (!mountRef.value || !renderer || !camera) {
    return;
  }

  const { clientWidth, clientHeight } = mountRef.value;
  renderer.setSize(clientWidth, clientHeight);
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
}

function snapGroundAnchor(value) {
  return Math.round(value / GROUND_ANCHOR_STEP) * GROUND_ANCHOR_STEP;
}

function updateGroundAnchor() {
  if (!groundGroup) {
    return;
  }

  const shouldRecentre =
    Math.abs(robotState.x - groundGroup.position.x) >= GROUND_RECENTER_MARGIN ||
    Math.abs(robotState.z - groundGroup.position.z) >= GROUND_RECENTER_MARGIN;

  if (!shouldRecentre) {
    return;
  }

  groundGroup.position.set(snapGroundAnchor(robotState.x), 0, snapGroundAnchor(robotState.z));
}

function calculateDistanceSensorValue() {
  if (!sensorProbe || !robotGroup) {
    return 0;
  }

  const origin = sensorProbe.getWorldPosition(new THREE.Vector3());
  const headingRad = THREE.MathUtils.degToRad(robotState.heading);
  const direction = new THREE.Vector3(
    Math.sin(headingRad),
    0,
    Math.cos(headingRad)
  ).normalize();

  let obstacleDistance = Number.POSITIVE_INFINITY;
  if (raycaster && obstacleMeshes.length) {
    raycaster.set(origin, direction);
    raycaster.far = SENSOR_MAX_DISTANCE;

    const hit = raycaster
      .intersectObjects(obstacleMeshes, false)
      .find((entry) => entry.distance >= 0.05);

    obstacleDistance = hit?.distance ?? Number.POSITIVE_INFINITY;
  }

  return Number.isFinite(obstacleDistance)
    ? Math.max(0, Number(obstacleDistance.toFixed(1)))
    : Number.POSITIVE_INFINITY;
}

function refreshSensors() {
  const nextDistance = calculateDistanceSensorValue();
  const changed =
    Number.isFinite(nextDistance) && Number.isFinite(latestSensors.DISTANCE)
      ? Math.abs(nextDistance - latestSensors.DISTANCE) > 0.05
      : nextDistance !== latestSensors.DISTANCE;

  if (changed) {
    latestSensors.DISTANCE = nextDistance;
  }

}

function syncRobot() {
  if (!robotGroup) {
    return;
  }

  robotGroup.position.set(robotState.x, ROBOT_Y, robotState.z);
  robotGroup.rotation.y = THREE.MathUtils.degToRad(robotState.heading);
  updateGroundAnchor();
  refreshSensors();
}

function applySensorData(nextSensors = {}) {
  ["TEMPERATURE", "LIGHT", "BATTERY"].forEach((key) => {
    if (!(key in nextSensors)) {
      return;
    }

    const value = Number(nextSensors[key]);
    if (!Number.isFinite(value) || value === latestSensors[key]) {
      return;
    }

    latestSensors[key] = value;
  });

  refreshSensors();
}

function emitSceneLog(message) {
  emit("scene-log", message);
}

function finishMotion(error = null) {
  if (!motionState.current) {
    return;
  }

  if (error) {
    motionState.current.reject?.(error);
  } else {
    motionState.current.resolve?.();
  }

  motionState.current = null;
}

function pointHitsObstacle(x, z) {
  return obstacleEntries.value.some((entry) =>
    circleIntersectsRect(x, z, ROBOT_RADIUS, getObstacleBounds(entry))
  );
}

function computeSafeMoveTarget(targetX, targetZ) {
  const deltaX = targetX - robotState.x;
  const deltaZ = targetZ - robotState.z;
  const distance = Math.hypot(deltaX, deltaZ);

  if (distance <= 0) {
    return {
      x: robotState.x,
      z: robotState.z,
      hitObstacle: false
    };
  }

  const steps = Math.max(1, Math.ceil(distance / 4));
  let safeX = robotState.x;
  let safeZ = robotState.z;

  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const nextX = THREE.MathUtils.lerp(robotState.x, targetX, progress);
    const nextZ = THREE.MathUtils.lerp(robotState.z, targetZ, progress);

    if (pointHitsObstacle(nextX, nextZ)) {
      return {
        x: safeX,
        z: safeZ,
        hitObstacle: true
      };
    }

    safeX = nextX;
    safeZ = nextZ;
  }

  return {
    x: safeX,
    z: safeZ,
    hitObstacle: false
  };
}

function renderFrame(timestamp) {
  if (motionState.current) {
    const motion = motionState.current;
    const progress =
      motion.duration <= 0 ? 1 : Math.min(1, (timestamp - motion.start) / motion.duration);

    if (motion.kind === "move") {
      robotState.x = THREE.MathUtils.lerp(motion.from.x, motion.to.x, progress);
      robotState.z = THREE.MathUtils.lerp(motion.from.z, motion.to.z, progress);
      robotState.travelled = motion.travelBase + motion.distance * progress;
      syncRobot();
    }

    if (motion.kind === "turn") {
      robotState.heading = THREE.MathUtils.lerp(motion.fromHeading, motion.toHeading, progress);
      syncRobot();
    }

    if (progress >= 1) {
      if (motion.kind === "move") {
        robotState.travelled = motion.travelBase + motion.distance;
      }

      if (motion.kind === "turn") {
        robotState.heading = motion.toHeading;
      }

      syncRobot();
      finishMotion(motion.completionError ?? null);
    }
  }

  controls?.update();
  renderer?.render(scene, camera);
  animationId = window.requestAnimationFrame(renderFrame);
}

function createMotion(kind, payload) {
  return new Promise((resolve, reject) => {
    motionState.current = {
      ...payload,
      kind,
      resolve,
      reject,
      start: performance.now()
    };
  });
}

async function animateMove(direction, distance, speed = 40) {
  const headingRad = THREE.MathUtils.degToRad(robotState.heading);
  const sign = direction === "BACKWARD" ? -1 : 1;
  const deltaX = Math.sin(headingRad) * distance * sign;
  const deltaZ = Math.cos(headingRad) * distance * sign;
  const targetX = robotState.x + deltaX;
  const targetZ = robotState.z + deltaZ;
  const safeTarget = computeSafeMoveTarget(targetX, targetZ);
  const actualDistance = Math.hypot(safeTarget.x - robotState.x, safeTarget.z - robotState.z);
  const duration =
    actualDistance <= 0 ? 0 : Math.max(250, (actualDistance / Math.max(speed, 1)) * 1000);

  if (safeTarget.hitObstacle) {
    emitSceneLog("机器人检测到障碍物，已在碰撞前停止。");
  }

  return createMotion("move", {
    from: { x: robotState.x, z: robotState.z },
    to: { x: safeTarget.x, z: safeTarget.z },
    duration,
    distance: actualDistance,
    travelBase: robotState.travelled,
    completionError: safeTarget.hitObstacle ? new Error(COLLISION_STOP_MESSAGE) : null
  });
}

async function animateTurn(direction, angle, speed = 120) {
  const sign = direction === "LEFT" ? 1 : -1;
  const duration = Math.max(200, (angle / Math.max(speed, 1)) * 1000);

  return createMotion("turn", {
    fromHeading: robotState.heading,
    toHeading: robotState.heading + angle * sign,
    duration
  });
}

async function wait(seconds) {
  return createMotion("turn", {
    fromHeading: robotState.heading,
    toHeading: robotState.heading,
    duration: Math.max(0, seconds * 1000)
  });
}

async function stopMotion(reason = null) {
  finishMotion(reason ? new Error(reason) : null);
}

function readSensor(sensor) {
  const normalizedSensor = String(sensor ?? "").trim().toUpperCase();
  const value = latestSensors[normalizedSensor];

  if (normalizedSensor === "DISTANCE" && !Number.isFinite(value)) {
    return -1;
  }

  return value ?? 0;
}

async function resetRobot() {
  finishMotion(new Error("仿真已重置，当前运行已停止。"));
  robotState.x = 0;
  robotState.z = 0;
  robotState.heading = 0;
  robotState.travelled = 0;
  syncRobot();
}

function formatLayoutTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour12: false
  });
}

function formatLayoutUpdatedAt(value) {
  if (!value) {
    return "未知时间";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }

  return date.toLocaleString("zh-CN", {
    hour12: false
  });
}

function formatLayoutSummary(layout) {
  const obstacleCount = Array.isArray(layout?.obstacles) ? layout.obstacles.length : 0;
  return `${obstacleCount} 个障碍物 · 坐标轴${layout?.axesVisible ? "显示" : "隐藏"}`;
}

function findSavedLayoutByName(name, excludeId = null) {
  const normalizedTargetName = normalizeObstacleLayoutName(name, DEFAULT_LAYOUT_NAME).toLocaleLowerCase();

  return (
    savedObstacleLayouts.value.find((item) => {
      if (excludeId && item.id === excludeId) {
        return false;
      }

      return (
        normalizeObstacleLayoutName(item.name, DEFAULT_LAYOUT_NAME).toLocaleLowerCase() ===
        normalizedTargetName
      );
    }) ?? null
  );
}

function sanitizeLayoutExportFileName(name) {
  const normalizedName = normalizeObstacleLayoutName(name, DEFAULT_LAYOUT_NAME)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  return normalizedName || DEFAULT_LAYOUT_NAME;
}

function buildLayoutExportPayload(snapshot) {
  return {
    type: OBSTACLE_LAYOUT_EXPORT_TYPE,
    version: OBSTACLE_LAYOUT_EXPORT_VERSION,
    name: snapshot.currentLayoutName,
    axesVisible: snapshot.axesVisible,
    obstacleCount: snapshot.obstacles.length,
    obstacles: snapshot.obstacles.map((entry) => ({
      id: entry.id,
      x: entry.x,
      z: entry.z,
      width: entry.width,
      depth: entry.depth,
      height: entry.height
    })),
    exportedAt: new Date().toISOString()
  };
}

function clearLayoutAutosaveTimer() {
  if (!layoutAutosaveTimer) {
    return;
  }

  window.clearTimeout(layoutAutosaveTimer);
  layoutAutosaveTimer = 0;
}

function setObstacleEntries(nextEntries) {
  const normalized = normalizeObstacleEntries(nextEntries);
  obstacleEntries.value = normalized;
  obstacleIdSeed =
    normalized.reduce((maxId, item) => Math.max(maxId, Number(item.id) || 0), 0) + 1;

  if (obstacleGroup) {
    rebuildObstacleMeshes();
  }
}

function applyObstacleLayoutState({
  layoutId = null,
  layoutName = DEFAULT_LAYOUT_NAME,
  nextAxesVisible = true,
  obstacles = []
} = {}) {
  currentLayoutId.value = layoutId ? String(layoutId) : null;
  currentLayoutName.value = normalizeObstacleLayoutName(layoutName, DEFAULT_LAYOUT_NAME);
  axesVisible.value = Boolean(nextAxesVisible);
  setObstacleEntries(obstacles);
  setAxesVisibility();
  syncRobot();
}

function getCurrentLayoutSnapshot() {
  return {
    currentLayoutId: currentLayoutId.value,
    currentLayoutName: normalizeObstacleLayoutName(currentLayoutName.value, DEFAULT_LAYOUT_NAME),
    axesVisible: axesVisible.value,
    obstacles: normalizeObstacleEntries(obstacleEntries.value)
  };
}

function getAiSceneContext() {
  const snapshot = getCurrentLayoutSnapshot();
  const sortedObstacles = [...snapshot.obstacles].sort((left, right) => left.id - right.id);

  return {
    layoutName: snapshot.currentLayoutName,
    axesVisible: snapshot.axesVisible,
    obstacleCount: sortedObstacles.length,
    robot: {
      x: Number(robotState.x.toFixed(1)),
      z: Number(robotState.z.toFixed(1)),
      heading: Number(robotState.heading.toFixed(1)),
      travelled: Number(robotState.travelled.toFixed(1))
    },
    sensors: {
      DISTANCE: Number.isFinite(latestSensors.DISTANCE)
        ? Number(latestSensors.DISTANCE.toFixed(1))
        : -1,
      TEMPERATURE: Number(latestSensors.TEMPERATURE.toFixed(1)),
      LIGHT: Number(latestSensors.LIGHT.toFixed(0)),
      BATTERY: Number(latestSensors.BATTERY.toFixed(0))
    },
    notes: [
      "坐标系使用 X/Z 平面。",
      "机器人朝向 0 度表示面向 +Z 方向。",
      "障碍物以中心点和宽/深/高给出。"
    ],
    obstacles: sortedObstacles.map((entry) => ({
      id: entry.id,
      x: entry.x,
      z: entry.z,
      width: entry.width,
      depth: entry.depth,
      height: entry.height
    }))
  };
}

function persistLayoutWorkspaceNow({ updateStatus = true, logError = true } = {}) {
  if (!layoutStorageReady) {
    return false;
  }

  try {
    const timestamp = new Date().toISOString();
    const snapshot = getCurrentLayoutSnapshot();
    currentLayoutName.value = snapshot.currentLayoutName;

    writeObstacleLayoutWorkspace({
      currentLayoutId: snapshot.currentLayoutId,
      currentLayoutName: snapshot.currentLayoutName,
      axesVisible: snapshot.axesVisible,
      obstacles: snapshot.obstacles,
      updatedAt: timestamp
    });

    let syncedDirectory = false;
    if (snapshot.currentLayoutId) {
      const existing = savedObstacleLayouts.value.find(
        (item) => item.id === snapshot.currentLayoutId
      );

      if (existing) {
        savedObstacleLayouts.value = writeObstacleLayouts(
          upsertObstacleLayout(savedObstacleLayouts.value, {
            ...existing,
            id: snapshot.currentLayoutId,
            name: snapshot.currentLayoutName,
            axesVisible: snapshot.axesVisible,
            obstacles: snapshot.obstacles,
            createdAt: existing.createdAt,
            updatedAt: timestamp
          })
        );
        syncedDirectory = true;
      }
    }

    if (updateStatus) {
      layoutStatus.value = syncedDirectory
        ? `已自动保存已关联布局 ${formatLayoutTime(timestamp)}`
        : `障碍布局草稿已自动保存 ${formatLayoutTime(timestamp)}`;
    }

    return true;
  } catch (error) {
    if (updateStatus) {
      layoutStatus.value = `障碍布局保存失败：${error.message}`;
    }

    if (logError) {
      emitSceneLog(error.message);
    }

    return false;
  }
}

function scheduleLayoutAutosave() {
  if (!layoutStorageReady) {
    return;
  }

  clearLayoutAutosaveTimer();
  layoutStatus.value = currentLayoutId.value
    ? "正在自动保存已关联的障碍布局..."
    : "正在自动保存障碍布局草稿...";
  layoutAutosaveTimer = window.setTimeout(() => {
    persistLayoutWorkspaceNow();
  }, 260);
}

function restoreObstacleWorkspace() {
  try {
    savedObstacleLayouts.value = readObstacleLayouts();
    const workspace = readObstacleLayoutWorkspace();

    if (!workspace) {
      layoutStatus.value = "当前障碍布局会自动保存到浏览器草稿。";
      return true;
    }

    applyObstacleLayoutState({
      layoutId: workspace.currentLayoutId,
      layoutName: workspace.currentLayoutName,
      nextAxesVisible: workspace.axesVisible,
      obstacles: workspace.obstacles
    });

    if (currentLayoutId.value) {
      const linkedLayoutExists = savedObstacleLayouts.value.some(
        (item) => item.id === currentLayoutId.value
      );

      if (!linkedLayoutExists) {
        currentLayoutId.value = null;
      }
    }

    layoutStatus.value = workspace.updatedAt
      ? `已恢复障碍布局 ${formatLayoutTime(workspace.updatedAt)}`
      : "已恢复障碍布局草稿。";
    emitSceneLog("已从浏览器恢复上次的障碍布局。");
    return true;
  } catch (error) {
    layoutStatus.value = `障碍布局存储不可用：${error.message}`;
    emitSceneLog(error.message);
    return false;
  }
}

function createNewLayoutDraft() {
  applyObstacleLayoutState({
    layoutId: null,
    layoutName: DEFAULT_LAYOUT_NAME,
    nextAxesVisible: true,
    obstacles: []
  });
  layoutStatus.value = "已创建新的障碍布局草稿。";
  emitSceneLog("已创建新的障碍布局草稿。");
}

function saveCurrentLayoutToBrowser() {
  try {
    const timestamp = new Date().toISOString();
    const snapshot = getCurrentLayoutSnapshot();
    const linkedLayout =
      savedObstacleLayouts.value.find((item) => item.id === snapshot.currentLayoutId) ?? null;
    const sameNameLayout = findSavedLayoutByName(
      snapshot.currentLayoutName,
      snapshot.currentLayoutId
    );

    let targetLayout = linkedLayout;
    let overwroteByName = false;

    if (sameNameLayout) {
      const shouldOverwrite = window.confirm(
        `浏览器中已存在名为“${sameNameLayout.name}”的障碍布局。是否用当前场景覆盖它？`
      );
      if (!shouldOverwrite) {
        layoutStatus.value = "已取消保存，请修改布局名称后重试。";
        emitSceneLog("已取消覆盖同名障碍布局。");
        return;
      }

      targetLayout = sameNameLayout;
      overwroteByName = true;
    }

    const nextId = targetLayout?.id ?? snapshot.currentLayoutId ?? generateObstacleLayoutId();

    savedObstacleLayouts.value = writeObstacleLayouts(
      upsertObstacleLayout(savedObstacleLayouts.value, {
        id: nextId,
        name: snapshot.currentLayoutName,
        axesVisible: snapshot.axesVisible,
        obstacles: snapshot.obstacles,
        createdAt: targetLayout?.createdAt ?? linkedLayout?.createdAt ?? timestamp,
        updatedAt: timestamp
      })
    );

    currentLayoutId.value = nextId;
    currentLayoutName.value = snapshot.currentLayoutName;
    persistLayoutWorkspaceNow({ updateStatus: false, logError: false });
    layoutStatus.value = `已保存障碍布局 ${snapshot.currentLayoutName} ${formatLayoutTime(timestamp)}`;
    emitSceneLog(
      overwroteByName
        ? `已覆盖浏览器中的同名障碍布局 ${snapshot.currentLayoutName}。`
        : `已将障碍布局 ${snapshot.currentLayoutName} 保存到浏览器。`
    );
  } catch (error) {
    layoutStatus.value = `障碍布局保存失败：${error.message}`;
    emitSceneLog(error.message);
  }
}

function triggerLayoutImport() {
  layoutFileInputRef.value?.click();
}

function validateObstacleEntry(entry, existingEntries = obstacleEntries.value) {
  const numericValues = [entry.x, entry.z, entry.width, entry.depth, entry.height];
  if (numericValues.some((value) => !Number.isFinite(value))) {
    return "障碍物参数必须全部是有效数字。";
  }

  if (entry.width < 20 || entry.depth < 20 || entry.height < 20) {
    return "障碍物的宽、深、高都不能小于 20。";
  }

  if (entry.width > 180 || entry.depth > 180 || entry.height > 160) {
    return "障碍物尺寸对当前地图来说过大。";
  }

  const bounds = getObstacleBounds(entry);

  const overlapsExisting = existingEntries.some((item) =>
    boxesOverlap2D(bounds, getObstacleBounds(item))
  );
  if (overlapsExisting) {
    return "障碍物与现有障碍物发生重叠。";
  }

  if (circleIntersectsRect(robotState.x, robotState.z, ROBOT_RADIUS, bounds)) {
    return "障碍物与机器人当前位置重叠。";
  }

  return "";
}

function validateObstacleCollection(entries) {
  for (let index = 0; index < entries.length; index += 1) {
    const current = entries[index];
    const message = validateObstacleEntry(current, entries.slice(0, index));

    if (message) {
      return message;
    }
  }

  return "";
}

function parseImportedLayoutPayload(payload, fallbackName = IMPORTED_LAYOUT_FALLBACK_NAME) {
  let layoutName = fallbackName;
  let axesValue = true;
  let rawObstacles = null;

  if (Array.isArray(payload)) {
    rawObstacles = payload;
  } else {
    if (!payload || typeof payload !== "object") {
      throw new Error("布局 JSON 必须是对象，或者直接是障碍物数组。");
    }

    if ("type" in payload && payload.type !== OBSTACLE_LAYOUT_EXPORT_TYPE) {
      throw new Error("这不是 Robot Script Studio 导出的障碍布局文件。");
    }

    if (
      "version" in payload &&
      !SUPPORTED_OBSTACLE_LAYOUT_IMPORT_VERSIONS.has(Number(payload.version))
    ) {
      throw new Error(`暂不支持导入版本 ${payload.version} 的障碍布局文件。`);
    }

    if (!Array.isArray(payload.obstacles)) {
      throw new Error("布局 JSON 中必须包含 `obstacles` 数组。");
    }

    layoutName = payload.name ?? fallbackName;
    axesValue = "axesVisible" in payload ? Boolean(payload.axesVisible) : true;
    rawObstacles = payload.obstacles;
  }

  const obstacles = normalizeObstacleEntries(rawObstacles);
  if (obstacles.length !== rawObstacles.length) {
    throw new Error(
      "导入文件中存在无法识别的障碍物数据，请检查 x、z、width、depth、height 是否都是数字。"
    );
  }

  return {
    name: normalizeObstacleLayoutName(layoutName, IMPORTED_LAYOUT_FALLBACK_NAME),
    axesVisible: axesValue,
    obstacles
  };
}

async function importObstacleLayout(file) {
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const layout = parseImportedLayoutPayload(payload, file.name.replace(/\.json$/i, ""));
    const validationMessage = validateObstacleCollection(layout.obstacles);

    if (validationMessage) {
      layoutStatus.value = validationMessage;
      emitSceneLog(validationMessage);
      return;
    }

    applyObstacleLayoutState({
      layoutId: null,
      layoutName: layout.name,
      nextAxesVisible: layout.axesVisible,
      obstacles: layout.obstacles
    });
    layoutStatus.value = `已导入障碍布局 ${layout.name}，共 ${layout.obstacles.length} 个障碍物。`;
    emitSceneLog(`已从 ${file.name} 导入障碍布局，当前以草稿方式打开。`);
  } catch (error) {
    layoutStatus.value = `障碍布局导入失败：${error.message}`;
    emitSceneLog(error.message);
  }
}

function handleLayoutFileChange(event) {
  const file = event.target.files?.[0];

  if (file) {
    importObstacleLayout(file);
  }

  event.target.value = "";
}

function exportCurrentLayout() {
  const snapshot = getCurrentLayoutSnapshot();
  const payload = buildLayoutExportPayload(snapshot);
  const fileName = `${sanitizeLayoutExportFileName(snapshot.currentLayoutName)}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
  layoutStatus.value = `已导出障碍布局 ${fileName}`;
  emitSceneLog(`已导出障碍布局到 ${fileName}，共 ${snapshot.obstacles.length} 个障碍物。`);
}

function openSavedLayout(layoutId) {
  const target = savedObstacleLayouts.value.find((item) => item.id === layoutId);
  if (!target) {
    return;
  }

  const validationMessage = validateObstacleCollection(target.obstacles);
  if (validationMessage) {
    layoutStatus.value = validationMessage;
    emitSceneLog(validationMessage);
    return;
  }

  applyObstacleLayoutState({
    layoutId: target.id,
    layoutName: target.name,
    nextAxesVisible: target.axesVisible,
    obstacles: target.obstacles
  });
  layoutStatus.value = `已打开障碍布局 ${target.name}`;
  emitSceneLog(`已从浏览器打开障碍布局 ${target.name}。`);
}

function deleteSavedLayout(layoutId) {
  const target = savedObstacleLayouts.value.find((item) => item.id === layoutId);
  if (!target) {
    return;
  }

  const shouldDelete = window.confirm(
    `确定要从浏览器中删除障碍布局“${target.name}”吗？`
  );
  if (!shouldDelete) {
    return;
  }

  try {
    savedObstacleLayouts.value = writeObstacleLayouts(
      savedObstacleLayouts.value.filter((item) => item.id !== layoutId)
    );

    if (currentLayoutId.value === layoutId) {
      currentLayoutId.value = null;
      persistLayoutWorkspaceNow({ updateStatus: false, logError: false });
      layoutStatus.value = "已删除关联布局，当前障碍场景已转为草稿。";
    } else {
      layoutStatus.value = `已删除障碍布局 ${target.name}`;
    }

    emitSceneLog(`已从浏览器删除障碍布局 ${target.name}。`);
  } catch (error) {
    layoutStatus.value = `障碍布局删除失败：${error.message}`;
    emitSceneLog(error.message);
  }
}

function buildObstacleEntryFromForm() {
  return {
    x: Number(obstacleForm.x),
    z: Number(obstacleForm.z),
    width: Number(obstacleForm.width),
    depth: Number(obstacleForm.depth),
    height: Number(obstacleForm.height)
  };
}

function addObstacle() {
  const obstacle = buildObstacleEntryFromForm();
  const validationMessage = validateObstacleEntry(obstacle);

  if (validationMessage) {
    layoutStatus.value = validationMessage;
    emitSceneLog(validationMessage);
    return;
  }

  setObstacleEntries([
    ...obstacleEntries.value,
    {
      id: obstacleIdSeed,
      ...obstacle
    }
  ]);
  emitSceneLog(
    `已添加障碍物，中心点 (${obstacle.x}, ${obstacle.z})，尺寸 ${obstacle.width} × ${obstacle.depth} × ${obstacle.height}。`
  );
}

function removeObstacle(id) {
  const target = obstacleEntries.value.find((entry) => entry.id === id);
  if (!target) {
    return;
  }

  setObstacleEntries(obstacleEntries.value.filter((entry) => entry.id !== id));
  emitSceneLog(`已删除障碍物 #${id}。`);
}

function clearObstacles() {
  if (!obstacleEntries.value.length) {
    return;
  }

  setObstacleEntries([]);
  emitSceneLog("已清空全部障碍物。");
}

defineExpose({
  animateMove,
  animateTurn,
  wait,
  stopMotion,
  readSensor,
  resetRobot,
  applySensorData,
  getAiSceneContext
});

watch(
  [obstacleEntries, axesVisible, currentLayoutId, currentLayoutName],
  () => {
    scheduleLayoutAutosave();
  },
  { deep: true }
);

onMounted(() => {
  layoutStorageReady = restoreObstacleWorkspace();
  createScene();
  window.addEventListener("pointerdown", handleSceneHudOutsidePointerDown);
  animationId = window.requestAnimationFrame(renderFrame);
});

onBeforeUnmount(() => {
  clearLayoutAutosaveTimer();
  persistLayoutWorkspaceNow({ updateStatus: false, logError: false });
  window.cancelAnimationFrame(animationId);
  window.removeEventListener("pointerdown", handleSceneHudOutsidePointerDown);
  window.removeEventListener("resize", resize);
  controls?.dispose();
  disposeObject(groundGroup);
  disposeObject(robotGroup);
  obstacleMeshes.forEach((mesh) => disposeObject(mesh));
  renderer?.dispose();
});
</script>

<template>
  <section class="panel simulator-panel">
    <header class="panel-header">
      <div>
        <h2>3D 仿真</h2>
        <p>
          支持无限延展的地面视图、距离传感，以及障碍布局的浏览器保存、导入和导出。
        </p>
      </div>
    </header>

    <div class="simulator-panel-body">
      <div class="simulator-toolbar">
        <label class="simulator-toggle">
          <input v-model="axesVisible" type="checkbox" @change="setAxesVisibility" />
          <span>显示坐标轴辅助线</span>
        </label>
        <span class="chip">障碍物 {{ obstacleEntries.length }}</span>
        <span class="chip">已保存布局 {{ savedObstacleLayouts.length }}</span>
      </div>

      <section class="panel simulator-management-panel">
        <div class="collapsible-panel-head simulator-management-head">
          <div>
            <h3>障碍与布局管理</h3>
            <p>
              {{
                managementExpanded
                  ? "管理当前布局名称、浏览器保存列表，以及障碍物的添加和删除。"
                  : managementCollapsedSummary
              }}
            </p>
          </div>

          <div class="collapsible-panel-actions">
            <span class="badge">{{ obstacleEntries.length }} 个障碍物</span>
            <button
              class="secondary panel-toggle-button"
              type="button"
              @click="managementExpanded = !managementExpanded"
            >
              {{ managementExpanded ? "收起管理" : "展开管理" }}
            </button>
          </div>
        </div>

        <div v-if="managementExpanded" class="collapsible-panel-body simulator-management-body">
          <div class="simulator-layout-manager">
            <label class="file-name-field">
              <span>当前布局名称</span>
              <input
                v-model="currentLayoutName"
                class="text-input"
                type="text"
                placeholder="输入布局名称"
              />
            </label>

            <div class="storage-actions">
              <button class="secondary" type="button" @click="createNewLayoutDraft">
                新建草稿
              </button>
              <button class="secondary" type="button" @click="triggerLayoutImport">
                导入 JSON
              </button>
              <button class="secondary" type="button" @click="exportCurrentLayout">
                导出 JSON
              </button>
              <button class="primary" type="button" @click="saveCurrentLayoutToBrowser">
                保存到浏览器
              </button>
            </div>

            <div class="storage-status-row">
              <span class="chip">{{ layoutStatus }}</span>
              <span class="muted">{{ currentLayoutBindingLabel }}</span>
            </div>

            <div class="saved-file-directory">
              <div v-if="!savedObstacleLayouts.length" class="saved-file-empty">
                还没有保存到浏览器的障碍布局。将当前场景保存后，它会出现在这里。
              </div>

              <template v-else>
                <article
                  v-for="layout in savedObstacleLayouts"
                  :key="layout.id"
                  class="saved-file-card"
                  :class="{ active: layout.id === currentLayoutId }"
                >
                  <div class="saved-file-main">
                    <div class="saved-file-meta">
                      <strong>{{ layout.name }}</strong>
                      <span>{{ formatLayoutUpdatedAt(layout.updatedAt) }}</span>
                    </div>
                    <p class="muted">{{ formatLayoutSummary(layout) }}</p>
                  </div>

                  <div class="saved-file-actions">
                    <button class="secondary action-button" type="button" @click="openSavedLayout(layout.id)">
                      打开
                    </button>
                    <button class="secondary action-button danger-button" type="button" @click="deleteSavedLayout(layout.id)">
                      删除
                    </button>
                  </div>
                </article>
              </template>
            </div>

            <input
              ref="layoutFileInputRef"
              class="hidden-file-input"
              type="file"
              accept=".json,application/json"
              @change="handleLayoutFileChange"
            />
          </div>

          <div class="simulator-obstacle-editor">
            <div class="simulator-obstacle-grid">
              <label class="simulator-field">
                <span>X</span>
                <input v-model.number="obstacleForm.x" class="text-input" type="number" step="1" />
              </label>
              <label class="simulator-field">
                <span>Z</span>
                <input v-model.number="obstacleForm.z" class="text-input" type="number" step="1" />
              </label>
              <label class="simulator-field">
                <span>宽度</span>
                <input
                  v-model.number="obstacleForm.width"
                  class="text-input"
                  type="number"
                  min="20"
                  step="1"
                />
              </label>
              <label class="simulator-field">
                <span>深度</span>
                <input
                  v-model.number="obstacleForm.depth"
                  class="text-input"
                  type="number"
                  min="20"
                  step="1"
                />
              </label>
              <label class="simulator-field">
                <span>高度</span>
                <input
                  v-model.number="obstacleForm.height"
                  class="text-input"
                  type="number"
                  min="20"
                  step="1"
                />
              </label>
            </div>

            <div class="simulator-obstacle-actions">
              <button class="primary" type="button" @click="addObstacle">添加障碍物</button>
              <button
                class="secondary"
                type="button"
                :disabled="!obstacleEntries.length"
                @click="clearObstacles"
              >
                清空障碍物
              </button>
            </div>

            <div class="simulator-obstacle-list">
              <div v-if="!obstacleEntries.length" class="saved-file-empty">
                当前布局还没有障碍物，距离传感器会显示为无遮挡。
              </div>

              <div
                v-for="entry in obstacleEntries"
                :key="entry.id"
                class="simulator-obstacle-card"
              >
                <div class="simulator-obstacle-main">
                  <strong>障碍物 #{{ entry.id }}</strong>
                  <span>中心点：({{ entry.x }}, {{ entry.z }})</span>
                  <span>尺寸：{{ entry.width }} × {{ entry.depth }} × {{ entry.height }}</span>
                </div>

                <button
                  class="secondary action-button danger-button"
                  type="button"
                  @click="removeObstacle(entry.id)"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="simulator-scene-shell">
        <div ref="mountRef" class="simulator-canvas"></div>

        <div class="simulator-scene-statusbar" :class="{ collapsed: sceneHudCollapsed }">
          <button
            class="simulator-status-caret"
            type="button"
            :aria-label="sceneHudCollapsed ? '展开场景信息' : '收起场景信息'"
            @click.stop="toggleSceneHudCollapsed"
          >
            {{ sceneHudCollapsed ? "▸" : "▾" }}
          </button>

          <template v-if="!sceneHudCollapsed">
            <div ref="sceneHudSwitchRef" class="simulator-status-switch">
              <button
              class="simulator-status-title"
              type="button"
              @click.stop="toggleSceneHudMenu"
            >
              <span>{{ sceneHudTitle }}</span>
              <small>{{ sceneHudMenuOpen ? "▴" : "▾" }}</small>
            </button>

              <div v-if="sceneHudMenuOpen" class="simulator-status-menu">
                <button
                  v-for="option in sceneHudOptions"
                  :key="option.value"
                  class="simulator-status-menu-item"
                  :class="{ active: option.value === sceneHudMode }"
                  type="button"
                  @click.stop="selectSceneHudMode(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="simulator-status-values">
              <div
                v-for="entry in sceneHudEntries"
                :key="entry.label"
                class="simulator-status-item"
              >
                <span>{{ entry.label }}</span>
                <strong>{{ entry.value }}</strong>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
