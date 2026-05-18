<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import AICodeAssistantPanel from "./components/AICodeAssistantPanel.vue";
import BrowserStoragePanel from "./components/BrowserStoragePanel.vue";
import CCommandReference from "./components/CCommandReferenceClean.vue";
import CodeEditor from "./components/CodeEditor.vue";
import DebuggerPanel from "./components/DebuggerPanel.vue";
import SimulatorPanel from "./components/SimulatorPanel.vue";
import {
  generateSavedFileId,
  normalizeFileName,
  readSavedFiles,
  readWorkspace,
  upsertSavedFile,
  writeSavedFiles,
  writeWorkspace
} from "./core/browserCodeStorage";
import { validateCSource } from "./core/cSyntaxDiagnostics";
import { generateRobotCode } from "./core/ollamaClient";
import { PicoCAdapter } from "./core/picocAdapter";
import { RobotBridge } from "./core/simulatorBridge";

const DEFAULT_C = `#include <stdio.h>

int main() {
    printf("PicoC robot demo start\\n");
    robot_reset();
    robot_move_forward(80, 40);
    robot_turn_right(90, 120);
    robot_move_forward(60, 36);
    printf("distance=%d\\n", robot_read_distance());
    printf("temperature=%.1f\\n", robot_read_temperature());
    robot_say("C demo finished");
    robot_stop();
    return 0;
}`;

const DEFAULT_BROWSER_FILE_NAME = "未命名程序.c";
const AUTOSAVE_DELAY_MS = 700;
const DEFAULT_AI_PROVIDER = "ollama";
const DEFAULT_OLLAMA_MODEL = "deepseek-coder:6.7b";
const DEFAULT_OPENAI_MODEL = "gpt-5.4";

function getDefaultOllamaEndpoint() {
  if (typeof window !== "undefined" && window.location.port === "5173") {
    return "/api/ollama/chat";
  }

  return "http://127.0.0.1:11434/api/chat";
}

function getDefaultOpenAiEndpoint() {
  return "http://new.xem8k5.top:3000/v1/chat/completions";
}

const activeView = ref("studio");
const cCode = ref(DEFAULT_C);
const currentFileId = ref(null);
const currentFileName = ref(DEFAULT_BROWSER_FILE_NAME);
const simulatorRef = ref(null);
const logEntries = ref([]);
const picocErrors = ref([]);
const staticSyntaxErrors = ref([]);
const picocStatus = ref("未加载");
const debugStatus = ref("未启用");
const autosaveStatus = ref("当前草稿会自动保存到浏览器");
const isRunningC = ref(false);
const isDebugSession = ref(false);
const isDebugPaused = ref(false);
const currentTraceLine = ref(null);
const traceEntries = ref([]);
const watchedVariables = ref([]);
const breakpoints = ref([]);
const savedBrowserFiles = ref([]);
const aiPanelExpanded = ref(false);
const aiPrompt = ref("");
const aiGeneratedCode = ref("");
const aiStatus = ref("等待生成");
const aiError = ref("");
const aiWarning = ref("");
const aiConversationHistory = ref([]);
const isGeneratingAi = ref(false);
const aiProvider = ref(DEFAULT_AI_PROVIDER);
const aiModelName = ref(DEFAULT_OLLAMA_MODEL);
const aiEndpoint = ref(getDefaultOllamaEndpoint());
const aiApiKey = ref("");
const editorErrors = computed(() =>
  mergeEditorErrors(staticSyntaxErrors.value, picocErrors.value)
);

let pendingTraceSnapshot = null;
let traceStepCounter = 0;
let pendingDebugControl = null;
let debugResumeMode = "continue";
let autosaveTimer = 0;
let syntaxValidationTimer = 0;
let storageReady = false;

const DEBUG_ABORT_CODE = 130;
const MAX_AI_HISTORY_TURNS = 8;
const EXECUTION_ABORT_MESSAGES = new Set([
  "仿真已重置，当前运行已停止。",
  "机器人碰到障碍物，当前运行已停止。",
  "当前运行已停止。"
]);

const bridge = new RobotBridge({
  getController: () => simulatorRef.value,
  onLog: (message) => addLog(message)
});

const picoc = shallowRef(
  new PicoCAdapter({
    onStdout: (text) => {
      addLog(`[PicoC] ${text}`);
      addPicocErrorFromText(text);
    },
    onStderr: (text) => {
      addLog(`[PicoC 错误] ${text}`);
      addPicocErrorFromText(text);
    }
  })
);

function getSourceLine(lineNumber) {
  const lines = cCode.value.split(/\r?\n/);
  return lines[lineNumber - 1]?.trim() ?? "";
}

function normalizePicocErrorMessage(message) {
  return message.replace(/^error:\s*/i, "").trim();
}

function addPicocErrorFromText(text) {
  const lines = String(text).split(/\r?\n/);

  lines.forEach((lineText) => {
    const line = lineText.trim();
    if (!line) {
      return;
    }

    const match = line.match(/^web_input\.c:(\d+):(\d+)\s+(.*)$/);
    if (!match) {
      return;
    }

    const [, row, column, message] = match;
    const error = {
      line: Number(row),
      column: Number(column),
      endLine: Number(row),
      endColumn: Number(column) + 1,
      message: normalizePicocErrorMessage(message),
      suggestion: "请检查这一行附近的分号、括号、变量声明或函数调用写法。",
      type: "syntax",
      source: "picoc",
      severity: "error"
    };

    const exists = picocErrors.value.some(
      (item) =>
        item.line === error.line &&
        item.column === error.column &&
        item.message === error.message
    );

    if (!exists) {
      picocErrors.value = [...picocErrors.value, error];
    }
  });
}

function mergeEditorErrors(...collections) {
  const merged = new Map();

  collections.flat().forEach((error) => {
    if (!error) {
      return;
    }

    const key = [
      error.line ?? 1,
      error.column ?? 1,
      error.endLine ?? error.line ?? 1,
      error.endColumn ?? (error.column ?? 1) + 1,
      error.message ?? "",
      error.type ?? "syntax",
      error.source ?? "editor"
    ].join(":");

    if (!merged.has(key)) {
      merged.set(key, {
        severity: "error",
        source: "editor",
        ...error
      });
    }
  });

  return [...merged.values()].sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }

    if (left.column !== right.column) {
      return left.column - right.column;
    }

    if (left.severity !== right.severity) {
      return left.severity === "error" ? -1 : 1;
    }

    return left.message.localeCompare(right.message);
  });
}

function addLog(message) {
  logEntries.value = [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      message
    },
    ...logEntries.value
  ].slice(0, 120);
}

function findSavedBrowserFileByName(name, excludeId = null) {
  const normalizedTargetName = normalizeFileName(name, DEFAULT_BROWSER_FILE_NAME).toLocaleLowerCase();

  return (
    savedBrowserFiles.value.find((item) => {
      if (excludeId && item.id === excludeId) {
        return false;
      }

      return (
        normalizeFileName(item.name, DEFAULT_BROWSER_FILE_NAME).toLocaleLowerCase() ===
        normalizedTargetName
      );
    }) ?? null
  );
}

function formatShortTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString("zh-CN", {
    hour12: false
  });
}

function clearLogs() {
  logEntries.value = [];
}

function isExecutionAbortError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return EXECUTION_ABORT_MESSAGES.has(message);
}

function resetDebugState() {
  currentTraceLine.value = null;
  traceEntries.value = [];
  watchedVariables.value = [];
  pendingTraceSnapshot = null;
  traceStepCounter = 0;
}

function clearDebugControlState() {
  isDebugSession.value = false;
  isDebugPaused.value = false;
  pendingDebugControl = null;
  debugResumeMode = "continue";
}

function toggleBreakpoint(line) {
  if (!line || line < 1) {
    return;
  }

  if (breakpoints.value.includes(line)) {
    breakpoints.value = breakpoints.value.filter((item) => item !== line);
    return;
  }

  breakpoints.value = [...breakpoints.value, line].sort((left, right) => left - right);
}

function clearBreakpoints() {
  breakpoints.value = [];
}

function clearAutosaveTimer() {
  if (autosaveTimer) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = 0;
  }
}

function clearSyntaxValidationTimer() {
  if (syntaxValidationTimer) {
    window.clearTimeout(syntaxValidationTimer);
    syntaxValidationTimer = 0;
  }
}

function runSyntaxValidation() {
  staticSyntaxErrors.value = validateCSource(cCode.value);
}

function scheduleSyntaxValidation() {
  clearSyntaxValidationTimer();
  syntaxValidationTimer = window.setTimeout(() => {
    runSyntaxValidation();
  }, 160);
}

function persistWorkspaceNow({ updateStatus = true, logError = true } = {}) {
  if (!storageReady) {
    return false;
  }

  try {
    const timestamp = new Date().toISOString();
    const normalizedName = normalizeFileName(
      currentFileName.value,
      DEFAULT_BROWSER_FILE_NAME
    );
    const workspacePayload = {
      currentFileId: currentFileId.value,
      currentFileName: normalizedName,
      code: cCode.value,
      breakpoints: breakpoints.value,
      updatedAt: timestamp
    };

    currentFileName.value = normalizedName;
    writeWorkspace(workspacePayload);

    let syncedDirectory = false;
    let hasNameConflict = false;
    if (currentFileId.value) {
      const existing = savedBrowserFiles.value.find(
        (item) => item.id === currentFileId.value
      );
      const conflictingFile = findSavedBrowserFileByName(normalizedName, currentFileId.value);

      if (existing && !conflictingFile) {
        savedBrowserFiles.value = writeSavedFiles(
          upsertSavedFile(savedBrowserFiles.value, {
            ...existing,
            id: currentFileId.value,
            name: normalizedName,
            code: cCode.value,
            breakpoints: breakpoints.value,
            createdAt: existing.createdAt,
            updatedAt: timestamp
          })
        );
        syncedDirectory = true;
      }

      if (existing && conflictingFile && updateStatus) {
        hasNameConflict = true;
        autosaveStatus.value = `草稿已自动保存，但文件名与浏览器目录中的 ${conflictingFile.name} 重名，请改名或手动确认覆盖。`;
      }
    }

    if (updateStatus && !hasNameConflict) {
      autosaveStatus.value = syncedDirectory
        ? `已自动保存到浏览器 ${formatShortTime(timestamp)}`
        : `草稿已自动保存 ${formatShortTime(timestamp)}`;
    }

    return true;
  } catch (error) {
    if (updateStatus) {
      autosaveStatus.value = `保存失败：${error.message}`;
    }

    if (logError) {
      addLog(error.message);
    }

    return false;
  }
}

function scheduleAutosave() {
  if (!storageReady) {
    return;
  }

  clearAutosaveTimer();
  autosaveStatus.value = currentFileId.value
    ? "正在自动保存到浏览器..."
    : "正在自动保存草稿...";
  autosaveTimer = window.setTimeout(() => {
    persistWorkspaceNow();
  }, AUTOSAVE_DELAY_MS);
}

function restoreBrowserWorkspace() {
  try {
    savedBrowserFiles.value = readSavedFiles();
    const workspace = readWorkspace();

    if (!workspace) {
      autosaveStatus.value = "当前草稿会自动保存到浏览器";
      return true;
    }

    cCode.value = workspace.code ?? DEFAULT_C;
    breakpoints.value = workspace.breakpoints;
    currentFileName.value = normalizeFileName(
      workspace.currentFileName,
      DEFAULT_BROWSER_FILE_NAME
    );
    currentFileId.value = workspace.currentFileId;

    if (currentFileId.value) {
      const linkedFileExists = savedBrowserFiles.value.some(
        (item) => item.id === currentFileId.value
      );

      if (!linkedFileExists) {
        currentFileId.value = null;
      }
    }

    autosaveStatus.value = workspace.updatedAt
      ? `已恢复草稿 ${formatShortTime(workspace.updatedAt)}`
      : "已恢复草稿";
    addLog("已从浏览器恢复上次编辑的代码。");
    return true;
  } catch (error) {
    autosaveStatus.value = `浏览器存储不可用：${error.message}`;
    addLog(error.message);
    return false;
  }
}

function createNewDraft() {
  currentFileId.value = null;
  currentFileName.value = DEFAULT_BROWSER_FILE_NAME;
  cCode.value = DEFAULT_C;
  breakpoints.value = [];
  picocErrors.value = [];
  clearAiGeneratedCode();
  resetDebugState();
  clearDebugControlState();
  autosaveStatus.value = "新的临时草稿已创建";
  addLog("已创建新的临时草稿。");
}

function saveCurrentCodeToBrowser() {
  try {
    const timestamp = new Date().toISOString();
    const normalizedName = normalizeFileName(
      currentFileName.value,
      DEFAULT_BROWSER_FILE_NAME
    );
    const linkedFile =
      savedBrowserFiles.value.find((item) => item.id === currentFileId.value) ?? null;
    const sameNameFile = findSavedBrowserFileByName(normalizedName, currentFileId.value);

    let targetFile = linkedFile;
    let overwroteByName = false;

    if (sameNameFile) {
      const shouldOverwrite = window.confirm(
        `浏览器目录中已存在名为 ${sameNameFile.name} 的代码文件。是否用当前内容覆盖它？`
      );
      if (!shouldOverwrite) {
        autosaveStatus.value = "已取消保存，请修改文件名后重试。";
        addLog("已取消覆盖同名代码文件。");
        return;
      }

      targetFile = sameNameFile;
      overwroteByName = true;
    }

    const nextId = targetFile?.id ?? currentFileId.value ?? generateSavedFileId();

    savedBrowserFiles.value = writeSavedFiles(
      upsertSavedFile(savedBrowserFiles.value, {
        id: nextId,
        name: normalizedName,
        code: cCode.value,
        breakpoints: breakpoints.value,
        createdAt: targetFile?.createdAt ?? linkedFile?.createdAt ?? timestamp,
        updatedAt: timestamp
      })
    );

    currentFileId.value = nextId;
    currentFileName.value = normalizedName;
    persistWorkspaceNow({ updateStatus: false, logError: false });
    autosaveStatus.value = `已保存到浏览器 ${formatShortTime(timestamp)}`;
    addLog(
      overwroteByName
        ? `已覆盖浏览器目录中的同名代码 ${normalizedName}。`
        : `已保存 ${normalizedName} 到浏览器目录。`
    );
  } catch (error) {
    autosaveStatus.value = `保存失败：${error.message}`;
    addLog(error.message);
  }
}

async function importLocalCode(file) {
  try {
    const text = await file.text();
    currentFileId.value = null;
    currentFileName.value = normalizeFileName(file.name, DEFAULT_BROWSER_FILE_NAME);
    cCode.value = text;
    breakpoints.value = [];
    picocErrors.value = [];
    clearAiGeneratedCode();
    resetDebugState();
    clearDebugControlState();
    autosaveStatus.value = `已导入 ${file.name}`;
    addLog(`已从本地导入 ${file.name}。`);
  } catch (error) {
    autosaveStatus.value = `导入失败：${error.message}`;
    addLog(error.message);
  }
}

function downloadCurrentCode() {
  const fileName = normalizeFileName(currentFileName.value, DEFAULT_BROWSER_FILE_NAME);
  const blob = new Blob([cCode.value], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
  addLog(`已下载当前代码为 ${fileName}。`);
}

function openBrowserFile(fileId) {
  const target = savedBrowserFiles.value.find((item) => item.id === fileId);
  if (!target) {
    return;
  }

  currentFileId.value = target.id;
  currentFileName.value = target.name;
  cCode.value = target.code;
  breakpoints.value = [...target.breakpoints];
  picocErrors.value = [];
  clearAiGeneratedCode();
  resetDebugState();
  clearDebugControlState();
  autosaveStatus.value = `已打开 ${target.name}`;
  addLog(`已从浏览器目录打开 ${target.name}。`);
}

function deleteBrowserFile(fileId) {
  const target = savedBrowserFiles.value.find((item) => item.id === fileId);
  if (!target) {
    return;
  }

  const shouldDelete = window.confirm(`确定删除浏览器目录中的 ${target.name} 吗？`);
  if (!shouldDelete) {
    return;
  }

  try {
    savedBrowserFiles.value = writeSavedFiles(
      savedBrowserFiles.value.filter((item) => item.id !== fileId)
    );

    if (currentFileId.value === fileId) {
      currentFileId.value = null;
      persistWorkspaceNow({ updateStatus: false, logError: false });
      autosaveStatus.value = "已删除目录文件，当前编辑器内容已转为临时草稿";
    } else {
      autosaveStatus.value = `已删除 ${target.name}`;
    }

    addLog(`已从浏览器目录删除 ${target.name}。`);
  } catch (error) {
    autosaveStatus.value = `删除失败：${error.message}`;
    addLog(error.message);
  }
}

function clearAiGeneratedCode() {
  aiGeneratedCode.value = "";
  aiError.value = "";
  aiWarning.value = "";
  aiStatus.value = "等待生成";
}

function clearAiConversationMemory() {
  aiConversationHistory.value = [];
  aiStatus.value = "已清空记忆";
  aiError.value = "";
  aiWarning.value = "";
  addLog("[AI] 已清空当前会话记忆。");
}

function appendAiConversationTurn(role, content) {
  const normalized = String(content ?? "").trim();
  if (!normalized) {
    return;
  }

  aiConversationHistory.value = [
    ...aiConversationHistory.value,
    { role, content: normalized }
  ].slice(-MAX_AI_HISTORY_TURNS * 2);
}

function syncAiProviderDefaults(provider) {
  if (provider === "openai") {
    if (!aiModelName.value.trim() || aiModelName.value === DEFAULT_OLLAMA_MODEL) {
      aiModelName.value = DEFAULT_OPENAI_MODEL;
    }

    if (!aiEndpoint.value.trim() || aiEndpoint.value === getDefaultOllamaEndpoint()) {
      aiEndpoint.value = getDefaultOpenAiEndpoint();
    }
    return;
  }

  if (!aiModelName.value.trim() || aiModelName.value === DEFAULT_OPENAI_MODEL) {
    aiModelName.value = DEFAULT_OLLAMA_MODEL;
  }

  if (!aiEndpoint.value.trim() || aiEndpoint.value === getDefaultOpenAiEndpoint()) {
    aiEndpoint.value = getDefaultOllamaEndpoint();
  }
}

function toggleAiPanel() {
  aiPanelExpanded.value = !aiPanelExpanded.value;
}

async function generateAiCode() {
  if (isRunningC.value || isGeneratingAi.value) {
    return;
  }

  if (!aiPrompt.value.trim()) {
    aiError.value = "请先输入想让 AI 生成或修改的代码需求。";
    aiStatus.value = "需求为空";
    aiPanelExpanded.value = true;
    return;
  }

  isGeneratingAi.value = true;
  aiGeneratedCode.value = "";
  aiError.value = "";
  aiWarning.value = "";
  aiStatus.value =
    aiProvider.value === "openai" ? "正在连接 GPT 接口..." : "正在连接本机 Ollama...";
  aiPanelExpanded.value = true;

  try {
    const sceneContext = simulatorRef.value?.getAiSceneContext?.() ?? null;
    const result = await generateRobotCode({
      provider: aiProvider.value,
      endpoint: aiEndpoint.value.trim(),
      model:
        aiModelName.value.trim() ||
        (aiProvider.value === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_OLLAMA_MODEL),
      apiKey: aiApiKey.value,
      requirement: aiPrompt.value,
      currentCode: cCode.value,
      errors: editorErrors.value,
      sceneContext,
      conversationHistory: aiConversationHistory.value
    });

    aiGeneratedCode.value = result.code;
    const reviewNotes = [];
    if (result.truncated) {
      reviewNotes.push("本次输出可能被截断");
    }
    if (result.issues?.length) {
      reviewNotes.push(...result.issues);
    }

    aiWarning.value = reviewNotes.join("；");
    aiStatus.value = reviewNotes.length
      ? `生成完成，但建议人工复核（${reviewNotes.length} 项提示）`
      : `生成完成，已得到 ${result.code.split(/\r?\n/).length} 行代码`;
    appendAiConversationTurn("user", aiPrompt.value);
    appendAiConversationTurn("assistant", result.code);
    addLog(
      `[AI] 已通过 ${
        aiProvider.value === "openai" ? "GPT 接口" : "本地 Ollama"
      } 从 ${aiModelName.value.trim() || (aiProvider.value === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_OLLAMA_MODEL)} 生成候选代码。`
    );
  } catch (error) {
    aiError.value = error.message;
    aiStatus.value = "生成失败";
    addLog(`[AI 错误] ${error.message}`);
  } finally {
    isGeneratingAi.value = false;
  }
}

function applyAiGeneratedCode() {
  if (!aiGeneratedCode.value.trim() || isRunningC.value) {
    return;
  }

  const shouldReplace = window.confirm("将用 AI 生成的代码覆盖当前编辑器内容，是否继续？");
  if (!shouldReplace) {
    return;
  }

  cCode.value = aiGeneratedCode.value;
  breakpoints.value = [];
  picocErrors.value = [];
  resetDebugState();
  clearDebugControlState();
  aiWarning.value = "";
  aiStatus.value = "已应用到编辑器";
  addLog("[AI] 已将生成结果应用到当前编辑器。");
}

function resolveDebugControl(action = 0) {
  if (!pendingDebugControl) {
    return false;
  }

  const resolve = pendingDebugControl;
  pendingDebugControl = null;
  isDebugPaused.value = false;
  resolve(action);
  return true;
}

function abortPausedDebug() {
  resolveDebugControl(DEBUG_ABORT_CODE);
}

function attachDebugBridge(globalScope = window) {
  globalScope.robotDebugBridge = {
    beginSnapshot: (line) => {
      const normalizedLine = Number(line);
      traceStepCounter += 1;
      currentTraceLine.value = normalizedLine;
      pendingTraceSnapshot = {
        line: normalizedLine,
        variables: []
      };
      traceEntries.value = [
        {
          id: `${traceStepCounter}-${normalizedLine}-${Date.now()}`,
          step: traceStepCounter,
          line: normalizedLine,
          code: getSourceLine(normalizedLine)
        },
        ...traceEntries.value
      ].slice(0, 80);
    },
    pushVariable: (scope, name, type, value) => {
      if (!pendingTraceSnapshot) {
        return;
      }

      pendingTraceSnapshot.variables.push({
        id: `${scope}-${name}`,
        scope,
        name,
        type,
        value
      });
    },
    commitSnapshot: () => {
      if (!pendingTraceSnapshot) {
        return;
      }

      watchedVariables.value = [...pendingTraceSnapshot.variables].sort((left, right) => {
        if (left.scope !== right.scope) {
          return left.scope === "local" ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
      pendingTraceSnapshot = null;
    },
    waitForControl: async (line) => {
      if (!isDebugSession.value) {
        return 0;
      }

      const normalizedLine = Number(line);
      const hitBreakpoint = breakpoints.value.includes(normalizedLine);
      const shouldPause = debugResumeMode === "step" || hitBreakpoint;

      if (!shouldPause) {
        return 0;
      }

      isDebugPaused.value = true;
      debugStatus.value =
        debugResumeMode === "step"
          ? `单步暂停于第 ${normalizedLine} 行`
          : `命中断点，第 ${normalizedLine} 行`;

      return await new Promise((resolve) => {
        pendingDebugControl = resolve;
      });
    },
    reset: () => {
      abortPausedDebug();
      resetDebugState();
      clearDebugControlState();
    }
  };
}

async function runProgram({ debug = false } = {}) {
  if (isRunningC.value) {
    return;
  }

  clearLogs();
  resetDebugState();
  picocErrors.value = [];
  clearDebugControlState();
  picocStatus.value = debug ? "调试运行中" : "运行中";
  debugStatus.value = debug ? "等待首个可执行语句" : "未启用";
  isDebugSession.value = debug;
  debugResumeMode = debug ? "step" : "continue";
  isRunningC.value = true;
  const executionToken = bridge.beginExecution();

  try {
    bridge.attachHostBridge(window);
    await simulatorRef.value?.resetRobot?.();
    const exitCode = await picoc.value.run(cCode.value, { debug });

    if (exitCode === DEBUG_ABORT_CODE) {
      picocStatus.value = "已中止";
      debugStatus.value = debug ? "已中止" : "未启用";
      return;
    }

    picocStatus.value = exitCode === 0 ? (debug ? "调试完成" : "运行完成") : "执行错误";
    debugStatus.value =
      debug ? (exitCode === 0 ? "已结束" : "调试出错") : "未启用";

    if (exitCode !== 0 && picocErrors.value.length === 0) {
      picocErrors.value = [
        {
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 2,
          message: `PicoC 运行失败，返回码 ${exitCode}`,
          suggestion: "请检查调试输出区中的 PicoC 报错信息。",
          type: "runtime",
          source: "picoc",
          severity: "error"
        }
      ];
    }
  } catch (error) {
    const aborted = isExecutionAbortError(error);

    picocStatus.value = aborted ? "已中止" : "未就绪";
    debugStatus.value = aborted ? "已中止" : debug ? "调试不可用" : "未启用";
    picocErrors.value = [
      {
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 2,
        message: error.message,
        suggestion: aborted
          ? "请调整路径、障碍物或重置仿真后重新运行。"
          : "请检查 PicoC WASM 是否已重新编译，或查看调试输出区获取更多信息。",
        type: "runtime",
        source: "picoc",
        severity: "error"
      }
    ];
    addLog(error.message);
  } finally {
    clearDebugControlState();
    bridge.completeExecution(executionToken);
    isRunningC.value = false;
  }
}

async function runC() {
  await runProgram({ debug: false });
}

async function debugC() {
  await runProgram({ debug: true });
}

function continueDebug() {
  if (!isDebugPaused.value) {
    return;
  }

  debugResumeMode = "continue";
  debugStatus.value = "继续运行中";
  resolveDebugControl(0);
}

function stepDebug() {
  if (!isDebugPaused.value) {
    return;
  }

  debugResumeMode = "step";
  debugStatus.value = "单步运行中";
  resolveDebugControl(0);
}

async function resetSimulatorOnly() {
  if (isRunningC.value) {
    abortPausedDebug();
    await bridge.cancelExecution("仿真已重置，当前运行已停止。");
  }
  await simulatorRef.value?.resetRobot?.();
  resetDebugState();
  clearDebugControlState();
  debugStatus.value = "未启用";
  addLog("仿真场景已恢复初始状态。");
}

watch([cCode, breakpoints, currentFileId, currentFileName], () => {
  scheduleAutosave();
});

watch(
  cCode,
  (nextCode, previousCode) => {
    if (previousCode !== undefined && nextCode !== previousCode && picocErrors.value.length) {
      picocErrors.value = [];
    }

    scheduleSyntaxValidation();
  },
  { immediate: true }
);

watch(
  aiProvider,
  (provider) => {
    syncAiProviderDefaults(provider);
  },
  { immediate: true }
);

onMounted(() => {
  storageReady = restoreBrowserWorkspace();
  bridge.attachHostBridge(window);
  attachDebugBridge(window);
});

onBeforeUnmount(() => {
  clearAutosaveTimer();
  clearSyntaxValidationTimer();
  persistWorkspaceNow({ updateStatus: false, logError: false });
});
</script>

<template>
  <div class="app-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Robot Script Studio</p>
        <h1>面向教学场景的机器人编程与 3D 仿真平台</h1>
        <p class="hero-copy">
          采用 Vue 3 + WebGL/Three.js 构建前端，使用 PicoC + Emscripten 提供基于 Web 的 C 语言解释执行，并与 3D 仿真机器人实时联动。
        </p>
      </div>
      <div class="hero-actions">
        <button
          class="primary"
          :class="{ secondary: activeView !== 'studio' }"
          @click="activeView = 'studio'"
        >
          编程工作台
        </button>
        <button
          class="secondary"
          :class="{ active: activeView === 'c-reference' }"
          @click="activeView = 'c-reference'"
        >
          C 命令说明
        </button>
      </div>
    </header>

    <main v-if="activeView === 'studio'" class="dashboard">
      <section class="workspace-column">
        <BrowserStoragePanel
          v-model:current-file-name="currentFileName"
          :autosave-status="autosaveStatus"
          :current-file-id="currentFileId"
          :saved-files="savedBrowserFiles"
          :disabled="isRunningC"
          @create-file="createNewDraft"
          @save-browser="saveCurrentCodeToBrowser"
          @download-file="downloadCurrentCode"
          @import-file="importLocalCode"
          @open-file="openBrowserFile"
          @delete-file="deleteBrowserFile"
        />

        <AICodeAssistantPanel
          v-model:expanded="aiPanelExpanded"
          v-model:prompt="aiPrompt"
          v-model:provider="aiProvider"
          v-model:model="aiModelName"
          v-model:endpoint="aiEndpoint"
          v-model:api-key="aiApiKey"
          :generated-code="aiGeneratedCode"
          :status="aiStatus"
          :error="aiError"
          :warning="aiWarning"
          :memory-size="aiConversationHistory.length"
          :loading="isGeneratingAi"
          :disabled="isRunningC"
          @generate="generateAiCode"
          @apply-generated="applyAiGeneratedCode"
          @clear-generated="clearAiGeneratedCode"
          @clear-memory="clearAiConversationMemory"
        />

        <CodeEditor
          v-model="cCode"
          :title="`${currentFileName}`"
          language="c"
          :errors="editorErrors"
          :breakpoints="breakpoints"
          :current-line="currentTraceLine"
          @toggle-breakpoint="toggleBreakpoint"
        >
          <template #header-actions>
            <div class="editor-toolbar">
              <span class="tab active">C 编辑器</span>
              <button class="secondary" :disabled="isRunningC || isGeneratingAi" @click="toggleAiPanel">
                AI 生成
              </button>
              <button class="primary" :disabled="isRunningC" @click="runC">运行 C</button>
              <button class="secondary" :disabled="isRunningC" @click="debugC">调试运行</button>
              <button class="secondary" :disabled="!isDebugPaused" @click="continueDebug">继续</button>
              <button class="secondary" :disabled="!isDebugPaused" @click="stepDebug">单步</button>
              <button class="secondary" @click="clearBreakpoints">清空断点</button>
              <button class="secondary" @click="resetSimulatorOnly">重置仿真</button>
            </div>
          </template>
        </CodeEditor>
      </section>

      <section class="preview-column">
        <SimulatorPanel
          ref="simulatorRef"
          @scene-log="addLog"
        />

        <DebuggerPanel
          :errors="editorErrors"
          :logs="logEntries"
          :picoc-status="picocStatus"
          :debug-status="debugStatus"
          :current-trace-line="currentTraceLine"
          :trace-entries="traceEntries"
          :watched-variables="watchedVariables"
          :breakpoints="breakpoints"
        />
      </section>
    </main>

    <main v-else>
      <CCommandReference />
    </main>
  </div>
</template>
