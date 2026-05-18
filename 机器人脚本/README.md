# Robot Script Studio

基于 `Vue 3 + Monaco Editor + Three.js + PicoC/WASM` 的机器人编程教学平台。

当前版本主线能力：

- PicoC / C 在线编辑
- PicoC WASM 浏览器内执行
- 3D 仿真机器人运动演示
- 断点调试、单步调试、变量监视、行级追踪
- C 命令说明页面

## 运行方式

```powershell
npm install
npm run dev
```

默认访问：

```txt
http://localhost:5173
```

## 构建 PicoC WASM

先将 PicoC 源码放入：

```txt
third_party/picoc
```

然后执行：

```powershell
npm run build:picoc
```

生成文件位于：

- `public/wasm/picoc.js`
- `public/wasm/picoc.wasm`

## 主要模块

- `src/App.vue`
  - 页面总控，组织运行、调试、断点、日志、错误和追踪状态
- `src/components/CodeEditor.vue`
  - Monaco 编辑器组件
- `src/components/SimulatorPanel.vue`
  - Three.js 3D 仿真场景
- `src/components/DebuggerPanel.vue`
  - 调试信息展示面板
- `src/components/CCommandReferenceClean.vue`
  - C 命令说明页面
- `src/core/picocAdapter.js`
  - PicoC WASM 适配层
- `src/core/simulatorBridge.js`
  - 机器人动作桥接层
- `wasm/picoc_runner.c`
  - PicoC Web 入口
- `scripts/build-picoc.ps1`
  - PicoC WASM 构建脚本

## PicoC 内置机器人接口

示例：

```c
robot_reset();
robot_move_forward(80, 40);
robot_move_backward(30, 20);
robot_turn_left(90, 120);
robot_turn_right(45, 120);
robot_wait(0.5);
robot_stop();
robot_say("hello");

int distance = robot_read_distance();
int light = robot_read_light();
int battery = robot_read_battery();
double temperature = robot_read_temperature();
double any_sensor = robot_read_sensor("DISTANCE");
```

说明：

- 第 1 个参数通常是距离或角度
- 第 2 个参数通常是速度
- `robot_wait()` 单位为秒
- 传感器接口当前保留，数据可由外部注入
