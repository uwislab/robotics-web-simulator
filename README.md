# robotics-web-simulator
机器人编程Web仿真系统：机器人脚本子系统、机器人世界子系统、传感器仿真子系统
Container and quick-start

Build the Docker image (uses emscripten image to provide Emscripten toolchain when a native build is present):

```bash
docker build -t robotics-web-simulator .
```

Run locally:

```bash
docker run --rm -p 8080:8080 robotics-web-simulator
# open http://localhost:8080
```

Notes for Coolify CI/CD

- Coolify can build the image from this repository directly. The Dockerfile uses a multi-stage build: the first stage uses an Emscripten SDK image to allow compiling projects that require emscripten; the final stage serves static files from `/dist` using `http-server`.
- The provided `public/index.html` is a simple test page that loads `picoc-js` from unpkg and runs a Hello World C program — useful to validate the container in CI.
