import { validateCSource } from "./cSyntaxDiagnostics.js";

const ROBOT_API_SPECS = [
  "void robot_reset(void);",
  "void robot_move_forward(int distance, int speed);",
  "void robot_move_backward(int distance, int speed);",
  "void robot_turn_left(int angle, int speed);",
  "void robot_turn_right(int angle, int speed);",
  "void robot_wait(double seconds);",
  "void robot_stop(void);",
  "int robot_read_distance(void);",
  "double robot_read_temperature(void);",
  "int robot_read_light(void);",
  "int robot_read_battery(void);",
  'double robot_read_sensor(char *name); // DISTANCE, TEMPERATURE, LIGHT, BATTERY',
  'void robot_say(char *message);',
  'int printf(char *format, ...);'
];

const ALLOWED_ROBOT_APIS = new Set([
  "robot_reset",
  "robot_move_forward",
  "robot_move_backward",
  "robot_turn_left",
  "robot_turn_right",
  "robot_wait",
  "robot_stop",
  "robot_read_distance",
  "robot_read_temperature",
  "robot_read_light",
  "robot_read_battery",
  "robot_read_sensor",
  "robot_say"
]);

const DEFAULT_OLLAMA_OPTIONS = {
  temperature: 0,
  top_p: 0.85,
  repeat_penalty: 1.08,
  num_predict: 960,
  num_ctx: 4096
};

const DEFAULT_OPENAI_OPTIONS = {
  temperature: 0,
  top_p: 0.85,
  max_tokens: 960
};

const REVIEW_ISSUE_LIMIT = 6;
const ROBOT_SAFETY_RADIUS = 18;

function summarizeErrors(errors = []) {
  if (!errors.length) {
    return "无";
  }

  return errors
    .slice(0, 8)
    .map((error) => {
      const line = error?.line ?? 1;
      const column = error?.column ?? 1;
      const message = error?.message ?? "未知错误";
      return `- 第 ${line} 行，第 ${column} 列：${message}`;
    })
    .join("\n");
}

function formatSceneNumber(value, digits = 1) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return "-";
  }

  return normalized.toFixed(digits);
}

function formatSceneContext(sceneContext) {
  if (!sceneContext) {
    return "未提供地图数据。";
  }

  const obstacles = Array.isArray(sceneContext.obstacles)
    ? [...sceneContext.obstacles].sort((left, right) => Number(left.id) - Number(right.id))
    : [];
  const robot = sceneContext.robot ?? {};
  const sensors = sceneContext.sensors ?? {};
  const notes = Array.isArray(sceneContext.notes) ? sceneContext.notes : [];
  const obstacleSummary = obstacles.length
    ? obstacles
        .map((entry) => {
          const halfWidth = Number(entry.width) / 2;
          const halfDepth = Number(entry.depth) / 2;
          const minX = Number(entry.x) - halfWidth;
          const maxX = Number(entry.x) + halfWidth;
          const minZ = Number(entry.z) - halfDepth;
          const maxZ = Number(entry.z) + halfDepth;

          return [
            `- 障碍物 ${entry.id}：中心 (x=${formatSceneNumber(entry.x)}, z=${formatSceneNumber(entry.z)})`,
            `尺寸 宽=${formatSceneNumber(entry.width)} 深=${formatSceneNumber(entry.depth)} 高=${formatSceneNumber(entry.height)}`,
            `占用范围 x=[${formatSceneNumber(minX)}, ${formatSceneNumber(maxX)}]`,
            `z=[${formatSceneNumber(minZ)}, ${formatSceneNumber(maxZ)}]`
          ].join("；");
        })
        .join("\n")
    : "- 当前地图中没有障碍物。";

  const noteText = notes.length ? notes.join(" ") : "无额外说明。";

  return [
    `布局名称：${sceneContext.layoutName ?? "未命名布局"}`,
    `坐标轴显示：${Boolean(sceneContext.axesVisible) ? "是" : "否"}`,
    `机器人当前位置：x=${formatSceneNumber(robot.x)}，z=${formatSceneNumber(robot.z)}，朝向=${formatSceneNumber(robot.heading)}°，累计移动=${formatSceneNumber(robot.travelled)}`,
    [
      "当前传感器：",
      `DISTANCE=${formatSceneNumber(sensors.DISTANCE)}`,
      `TEMPERATURE=${formatSceneNumber(sensors.TEMPERATURE)}`,
      `LIGHT=${formatSceneNumber(sensors.LIGHT, 0)}`,
      `BATTERY=${formatSceneNumber(sensors.BATTERY, 0)}`
    ].join(" "),
    "障碍物编号规则：以下“障碍物 N”中的 N 就是障碍物 id，请严格按这个编号理解地图。",
    `障碍物数量：${Number(sceneContext.obstacleCount ?? obstacles.length)}`,
    `地图说明：${noteText}`,
    "障碍物列表（按 id 升序）：",
    obstacleSummary
  ].join("\n");
}

function stripReasoningArtifacts(text) {
  return String(text ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
}

function extractCodeBlock(text) {
  const normalized = stripReasoningArtifacts(text);
  if (!normalized) {
    return "";
  }

  const fencedMatch = normalized.match(/```(?:c|cpp)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const mainIndex = normalized.search(/#include|int\s+main\s*\(/);
  if (mainIndex > 0) {
    return normalized.slice(mainIndex).trim();
  }

  return normalized;
}

function normalizeGeneratedCode(code) {
  let normalized = String(code ?? "")
    .replace(/\r\n/g, "\n")
    .trim();

  if (!normalized) {
    return "";
  }

  if (
    /printf\s*\(/.test(normalized) &&
    !/#include\s*<stdio\.h>/.test(normalized)
  ) {
    normalized = `#include <stdio.h>\n\n${normalized}`;
  }

  return normalized;
}

function findHallucinatedRobotApis(code) {
  const matches = [...String(code ?? "").matchAll(/\b(robot_[A-Za-z_]\w*)\s*\(/g)];
  const names = [...new Set(matches.map((match) => match[1]))];

  return names.filter((name) => !ALLOWED_ROBOT_APIS.has(name));
}

function formatDiagnostics(errors = []) {
  return errors
    .slice(0, REVIEW_ISSUE_LIMIT)
    .map((error) => {
      const line = error?.line ?? 1;
      const column = error?.column ?? 1;
      return `- 第 ${line} 行，第 ${column} 列：${error.message}`;
    });
}

function inspectGeneratedCode(code) {
  const issues = [];

  if (!/\bint\s+main\s*\(/.test(code)) {
    issues.push("缺少 `int main()` 入口函数。");
  }

  const hallucinatedApis = findHallucinatedRobotApis(code);
  if (hallucinatedApis.length) {
    issues.push(`使用了不存在的机器人 API：${hallucinatedApis.join("、")}。`);
  }

  const diagnostics = validateCSource(code);
  const blockingDiagnostics = diagnostics.filter((error) => {
    if (error?.severity === "error") {
      return true;
    }

    return /没有声明|不支持的传感器名称|参数/.test(String(error?.message ?? ""));
  });

  issues.push(...formatDiagnostics(blockingDiagnostics));

  return {
    issues,
    hallucinatedApis,
    diagnostics: blockingDiagnostics
  };
}

function buildMessages({
  requirement,
  currentCode,
  errors,
  sceneContext,
  conversationHistory = []
}) {
  const codeContext = currentCode?.trim() ? currentCode.trim() : "// 当前编辑器为空";
  const errorContext = summarizeErrors(errors);
  const mapContext = [
    formatSceneContext(sceneContext),
    "地图理解提醒：障碍物不是点，而是有长、宽、高和占用范围的 3D 实体。",
    `避障提醒：规划路径时要给障碍物边缘预留安全余量，至少按机器人半径约 ${ROBOT_SAFETY_RADIUS} +10进行避障。`
  ].join("\n");
  const collisionGuidance = [
    "转向与朝向公式：heading = 0° 表示朝 +Z 方向；robot_turn_left(angle, speed) 后新朝向 = heading + angle；robot_turn_right(angle, speed) 后新朝向 = heading - angle。",
    "移动计算公式：前进时 deltaX = sin(heading * π / 180) * distance，deltaZ = cos(heading * π / 180) * distance；后退时取相反方向。90° 对应 +X，180° 对应 -Z，-90° 对应 -X。",
    "避障约束：除非用户在需求中明确要求“故意碰撞”“允许碰撞”或进行碰撞测试，否则生成的代码必须默认避开所有障碍物。",
    "障碍物理解：每个障碍物都有长、宽、高，不是一个坐标点；移动路线不能穿过障碍物的占用范围。",
    `安全余量：机器人本体有尺寸，规划移动时至少按约 ${ROBOT_SAFETY_RADIUS} 的半径给障碍物预留余量。`
  ].join("\n");

  const messages = [
    {
      role: "system",
      content: [
        "你是机器人仿真平台的 C 代码助手。",
        "输出可在 PicoC 环境运行的完整 C 文件。",
        "必须包含 int main()。",
        "只能使用给定的 robot_* API 和 printf，禁止编造新函数。",
        "如果提供地图快照，请按“障碍物 N”的编号和坐标范围理解地图，不要虚构障碍物。",
        "障碍物是有长、宽、高和占用范围的 3D 实体，不是一个坐标点。",
        "除非用户明确要求故意碰撞、允许碰撞或进行碰撞测试，否则生成的移动代码必须默认避开所有障碍物。",
        "只返回代码，不要解释，不要 Markdown 代码围栏。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `避障要求：\n${collisionGuidance}`,
        `需求：\n${requirement.trim()}`,
        `可用 API：\n${ROBOT_API_SPECS.join("\n")}`,
        `地图快照：\n${mapContext}`,
        `当前代码：\n${codeContext}`,
        `当前错误：\n${errorContext}`,
        [
          "要求：",
          "1. 返回完整 C 源码，不要只给片段。",
          "2. 优先在当前代码基础上修改；如果不合适，再重写完整文件。",
          "3. 如果使用 printf，请保留 #include <stdio.h>。",
          "4. 如果读取传感器，请用 printf 或 robot_say 输出结果。",
          "5. 代码保持简洁、稳定、可运行。"
        ].join("\n")
      ].join("\n\n")
    }
  ];

  if (Array.isArray(conversationHistory) && conversationHistory.length) {
    const historyMessages = conversationHistory
      .filter((entry) => entry && (entry.role === "user" || entry.role === "assistant"))
      .map((entry) => ({
        role: entry.role,
        content: String(entry.content ?? "").trim()
      }))
      .filter((entry) => entry.content);

    if (historyMessages.length) {
      messages.splice(1, 0, ...historyMessages);
    }
  }

  return messages;
}

async function requestOllamaChat({
  endpoint,
  model,
  messages,
  timeoutMs = 180000
}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: DEFAULT_OLLAMA_OPTIONS
      }),
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "string"
          ? payload
          : payload?.error ?? payload?.message ?? `请求失败（${response.status}）`;
      throw new Error(`Ollama 请求失败：${message}`);
    }

    const content =
      (typeof payload === "object" && payload?.message?.content) ||
      (typeof payload === "object" && payload?.response) ||
      "";

    if (!String(content).trim()) {
      throw new Error("Ollama 没有返回可用内容。");
    }

    return {
      content: String(content),
      payload: typeof payload === "object" ? payload : null
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Ollama 响应超时，请确认服务和模型已启动。");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "无法连接到本机 Ollama。请确认 11434 端口可访问；如果页面运行在 localhost，可改用 127.0.0.1 或配置 OLLAMA_ORIGINS。"
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function requestOpenAICompatibleChat({
  endpoint,
  model,
  apiKey,
  messages,
  timeoutMs = 180000
}) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json"
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...DEFAULT_OPENAI_OPTIONS
      }),
      signal: controller.signal
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "string"
          ? payload
          : payload?.error?.message ??
            payload?.error ??
            payload?.message ??
            `请求失败：${response.status}`;
      throw new Error(`GPT 接口请求失败：${message}`);
    }

    const content =
      (typeof payload === "object" && payload?.choices?.[0]?.message?.content) ||
      (typeof payload === "object" && payload?.choices?.[0]?.text) ||
      "";

    if (!String(content).trim()) {
      throw new Error("GPT 接口没有返回可用内容。");
    }

    return {
      content: String(content),
      payload: typeof payload === "object" ? payload : null
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("GPT 接口响应超时，请检查中转服务或模型状态。");
    }

    if (error instanceof TypeError) {
      throw new Error(
        "无法连接到 GPT 接口。请检查接口地址、网络连通性以及浏览器跨域配置。"
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function requestAiChat({
  provider = "ollama",
  endpoint,
  model,
  apiKey,
  messages,
  timeoutMs = 180000
}) {
  const normalizedEndpoint = String(endpoint ?? "").trim();
  const normalizedModel = String(model ?? "").trim();

  if (!normalizedEndpoint) {
    throw new Error(provider === "ollama" ? "请先填写 Ollama 接口地址。" : "请先填写 GPT 接口地址。");
  }

  if (!normalizedModel) {
    throw new Error(provider === "ollama" ? "请先填写 Ollama 模型名称。" : "请先填写 GPT 模型名称。");
  }

  if (provider === "openai" && !String(apiKey ?? "").trim()) {
    throw new Error("GPT 接口模式下必须填写 API Key。");
  }

  if (provider === "openai") {
    return requestOpenAICompatibleChat({
      endpoint: normalizedEndpoint,
      model: normalizedModel,
      apiKey: String(apiKey ?? "").trim(),
      messages,
      timeoutMs
    });
  }

  return requestOllamaChat({
    endpoint: normalizedEndpoint,
    model: normalizedModel,
    messages,
    timeoutMs
  });
}

export async function generateRobotCode({
  provider = "ollama",
  endpoint,
  model,
  apiKey = "",
  requirement,
  currentCode,
  errors,
  sceneContext = null,
  conversationHistory = []
}) {
  const firstPass = await requestAiChat({
    provider,
    endpoint,
    model,
    apiKey,
    messages: buildMessages({
      requirement,
      currentCode,
      errors,
      sceneContext,
      conversationHistory
    })
  });

  const candidate = {
    raw: firstPass.content,
    code: normalizeGeneratedCode(extractCodeBlock(firstPass.content)),
    report: null
  };
  candidate.report = inspectGeneratedCode(candidate.code);

  if (!candidate.code) {
    throw new Error("AI 返回为空，请调整需求后重试。");
  }

  return {
    raw: candidate.raw,
    code: candidate.code,
    issues: candidate.report.issues.slice(0, REVIEW_ISSUE_LIMIT),
    truncated:
      firstPass.payload?.done_reason === "length" ||
      firstPass.payload?.choices?.[0]?.finish_reason === "length"
  };
}

export async function generateRobotCodeWithOllama(options) {
  return generateRobotCode({
    provider: "ollama",
    ...options
  });
}
