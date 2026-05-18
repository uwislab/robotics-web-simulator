export class PicoCAdapter {
  constructor({ onStdout, onStderr }) {
    this.onStdout = onStdout;
    this.onStderr = onStderr;
    this.module = null;
    this.ready = false;
    this.loadPromise = null;
    this.loadStage = "idle";
    this.cacheToken = `${Date.now()}`;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
  }

  async load() {
    if (this.ready && this.module) {
      return this.module;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.loadInternal();

    try {
      return await this.loadPromise;
    } catch (error) {
      const detail = this.formatErrorDetail(error);
      throw new Error(`PicoC WASM is not ready at ${this.loadStage}: ${detail}`);
    } finally {
      this.loadPromise = null;
    }
  }

  async loadInternal() {
    const moduleUrl = new URL("/wasm/picoc.js", window.location.origin);
    moduleUrl.searchParams.set("t", this.cacheToken);

    this.loadStage = "import";
    const imported = await import(/* @vite-ignore */ moduleUrl.href);
    const factory =
      imported.default ??
      imported.createPicoCModule ??
      window.createPicoCModule ??
      null;

    if (typeof factory !== "function") {
      throw new Error("PicoC Emscripten factory was not found.");
    }

    this.loadStage = "instantiate";
    this.module = await factory({
      noFSInit: true,
      locateFile: (path) => {
        const assetUrl = new URL(`/wasm/${path}`, window.location.origin);
        assetUrl.searchParams.set("t", this.cacheToken);
        return assetUrl.href;
      },
      preRun: [
        (module) => {
          this.installStdioBridge(module);
        }
      ],
      print: (text) => this.onStdout?.(String(text)),
      printErr: (text) => this.onStderr?.(String(text))
    });

    this.loadStage = "ready";
    this.ready = true;
    return this.module;
  }

  formatErrorDetail(error) {
    if (error instanceof Error) {
      return error.stack || error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  installStdioBridge(module) {
    if (!module?.FS?.init) {
      throw new Error("Emscripten FS.init is unavailable.");
    }

    module.FS.init(
      null,
      (charCode) => this.handleStdoutChar(charCode),
      (charCode) => this.handleStderrChar(charCode)
    );
  }

  handleStdoutChar(charCode) {
    this.stdoutBuffer = this.consumeChar(this.stdoutBuffer, charCode, this.onStdout);
  }

  handleStderrChar(charCode) {
    this.stderrBuffer = this.consumeChar(this.stderrBuffer, charCode, this.onStderr);
  }

  consumeChar(buffer, charCode, emitter) {
    if (charCode === null || charCode === undefined) {
      if (buffer) {
        emitter?.(buffer);
      }
      return "";
    }

    if (charCode === 10) {
      emitter?.(buffer);
      return "";
    }

    if (charCode !== 0) {
      return buffer + String.fromCharCode(charCode);
    }

    return buffer;
  }

  flushPendingOutput() {
    if (this.stdoutBuffer) {
      this.onStdout?.(this.stdoutBuffer);
      this.stdoutBuffer = "";
    }

    if (this.stderrBuffer) {
      this.onStderr?.(this.stderrBuffer);
      this.stderrBuffer = "";
    }
  }

  invalidateModule() {
    this.module = null;
    this.ready = false;
    this.loadStage = "idle";
    this.cacheToken = `${Date.now()}`;
  }

  async run(source, options = {}) {
    const module = await this.load();
    if (!module?.ccall) {
      throw new Error("PicoC module is missing ccall.");
    }
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    const debug = Boolean(options.debug);
    const functionName = debug ? "run_source_debug" : "run_source";

    try {
      return await module.ccall(functionName, "number", ["string"], [source], {
        async: true
      });
    } catch (error) {
      this.invalidateModule();
      throw error;
    } finally {
      this.flushPendingOutput();
    }
  }
}
