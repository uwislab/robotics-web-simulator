function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export class RobotBridge {
  constructor({ getController, onLog }) {
    this.getController = getController;
    this.onLog = onLog;
    this.activeExecutionToken = 0;
    this.lastCancelReason = "";
  }

  get controller() {
    return this.getController?.() ?? null;
  }

  beginExecution() {
    this.activeExecutionToken = Date.now() + Math.random();
    this.lastCancelReason = "";
    return this.activeExecutionToken;
  }

  completeExecution(token) {
    if (token && this.activeExecutionToken === token) {
      this.activeExecutionToken = 0;
      this.lastCancelReason = "";
    }
  }

  async cancelExecution(reason = "仿真已重置，当前运行已停止。") {
    this.lastCancelReason = reason;
    this.activeExecutionToken = 0;

    if (this.controller?.stopMotion) {
      await this.controller.stopMotion(reason);
    }
  }

  ensureExecutionActive(token) {
    if (!token || token !== this.activeExecutionToken) {
      throw new Error(this.lastCancelReason || "当前运行已停止。");
    }
  }

  async move(direction, distance, speed) {
    const token = this.activeExecutionToken;
    this.ensureExecutionActive(token);

    if (!this.controller?.animateMove) {
      await delay(100);
      this.ensureExecutionActive(token);
      return;
    }

    await this.controller.animateMove(direction, distance, speed);
    this.ensureExecutionActive(token);
  }

  async turn(direction, angle, speed) {
    const token = this.activeExecutionToken;
    this.ensureExecutionActive(token);

    if (!this.controller?.animateTurn) {
      await delay(100);
      this.ensureExecutionActive(token);
      return;
    }

    await this.controller.animateTurn(direction, angle, speed);
    this.ensureExecutionActive(token);
  }

  async wait(seconds) {
    const token = this.activeExecutionToken;
    this.ensureExecutionActive(token);

    if (!this.controller?.wait) {
      await delay(seconds * 1000);
      this.ensureExecutionActive(token);
      return;
    }

    await this.controller.wait(seconds);
    this.ensureExecutionActive(token);
  }

  async stop() {
    const token = this.activeExecutionToken;
    this.ensureExecutionActive(token);

    if (this.controller?.stopMotion) {
      await this.controller.stopMotion();
    }

    this.ensureExecutionActive(token);
  }

  async reset() {
    const token = this.activeExecutionToken;
    this.ensureExecutionActive(token);

    if (this.controller?.resetRobot) {
      await this.controller.resetRobot();
    }

    this.ensureExecutionActive(token);
  }

  readSensor(sensor) {
    const token = this.activeExecutionToken;
    this.ensureExecutionActive(token);

    if (!this.controller?.readSensor) {
      return 0;
    }

    return this.controller.readSensor(sensor);
  }

  say(message) {
    this.ensureExecutionActive(this.activeExecutionToken);
    this.onLog?.(message);
  }

  attachHostBridge(globalScope = window) {
    globalScope.robotHostBridge = {
      moveForward: async (distance, speed) => this.move("FORWARD", distance, speed),
      moveBackward: async (distance, speed) => this.move("BACKWARD", distance, speed),
      turnLeft: async (angle, speed) => this.turn("LEFT", angle, speed),
      turnRight: async (angle, speed) => this.turn("RIGHT", angle, speed),
      waitSeconds: async (seconds) => this.wait(seconds),
      stop: async () => this.stop(),
      readSensor: (sensor) => this.readSensor(sensor),
      say: (message) => this.say(message),
      reset: async () => this.reset()
    };
  }
}
