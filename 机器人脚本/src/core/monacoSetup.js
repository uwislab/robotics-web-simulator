import { registerCEditorIntelligence } from "./cEditorIntelligence.js";

let monacoBootstrapped = false;

function registerMonacoTheme(monaco) {
  monaco.editor.defineTheme("robot-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "7dd3fc" },
      { token: "identifier", foreground: "e5e7eb" },
      { token: "string", foreground: "86efac" },
      { token: "number", foreground: "f9a8d4" },
      { token: "comment", foreground: "6b7280", fontStyle: "italic" }
    ],
    colors: {
      "editor.background": "#0f172a",
      "editor.foreground": "#e2e8f0",
      "editorLineNumber.foreground": "#64748b",
      "editorLineNumber.activeForeground": "#e2e8f0",
      "editorCursor.foreground": "#f8fafc",
      "editor.selectionBackground": "#1d4ed8aa",
      "editor.inactiveSelectionBackground": "#334155aa",
      "editorSuggestWidget.background": "#111827",
      "editorSuggestWidget.border": "#334155",
      "editorSuggestWidget.foreground": "#e5e7eb",
      "editorSuggestWidget.selectedBackground": "#1e293b",
      "editorSuggestWidget.highlightForeground": "#67e8f9",
      "editorHoverWidget.background": "#111827",
      "editorHoverWidget.border": "#334155",
      "editorWidget.background": "#111827",
      "editorWidget.border": "#334155",
      "editorMarkerNavigation.background": "#111827",
      "editorInfo.foreground": "#67e8f9",
      "editorHint.foreground": "#86efac",
      "editorError.foreground": "#ef4444",
      "editorWarning.foreground": "#f59e0b",
      "editorOverviewRuler.errorForeground": "#ef4444",
      "editorOverviewRuler.warningForeground": "#f59e0b"
    }
  });
}

export async function loadMonaco() {
  const monaco = await import("monaco-editor/esm/vs/editor/editor.api");

  if (!monacoBootstrapped) {
    await import("monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution");
    const editorWorker = await import(
      "monaco-editor/esm/vs/editor/editor.worker?worker"
    );

    self.MonacoEnvironment = {
      getWorker() {
        return new editorWorker.default();
      }
    };

    registerMonacoTheme(monaco);
    monaco.editor.setTheme("robot-dark");
    registerCEditorIntelligence(monaco);
    monacoBootstrapped = true;
  }

  return monaco;
}
