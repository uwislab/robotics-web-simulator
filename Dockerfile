# Multi-stage Dockerfile that supports two build strategies:
# - builder_node: normal Node.js build (default)
# - builder_emsdk: uses Emscripten SDK image for projects that need emscripten

# Node.js builder (fast, small) - used when no native/emscripten build is required
FROM node:18-alpine as builder_node
WORKDIR /app

# copy package files first for caching
COPY package.json package-lock.json* ./
# Prefer npm; if package-lock.json is present use npm ci for reproducible installs
RUN if [ -f package-lock.json ]; then npm ci --omit=dev || npm install; else npm install || true; fi

# copy project
COPY . .

# If project defines a build script, run it. Otherwise copy the static public/ to dist/
RUN if grep -q "\"build\"" package.json 2>/dev/null; then \
      yarn build; \
    else \
      mkdir -p dist && cp -R public/* dist/ || true; \
    fi

# Emscripten builder (optional). Use by setting build arg BUILD_FROM=builder_emsdk
FROM emscripten/emsdk:3.1.39 as builder_emsdk
WORKDIR /app
# emsdk images already include node/npm
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev || npm install; else npm install || true; fi
COPY . .
RUN if grep -q "\"build\"" package.json 2>/dev/null; then \
      npm run build; \
    else \
      mkdir -p dist && cp -R public/* dist/ || true; \
    fi

# Final runtime image (small)
FROM node:18-alpine as runner
WORKDIR /app
RUN npm i -g http-server
RUN apk add --no-cache curl

# Copy build artifacts from the Node builder stage by default.
# To use the emscripten builder, build with Dockerfile.emsdk (provided alongside this Dockerfile)
COPY --from=builder_node /app/dist ./dist

# add a simple healthcheck script used by Docker/Coolify to verify the homepage contains expected demo output
COPY scripts/healthcheck.sh /usr/local/bin/healthcheck.sh
RUN chmod +x /usr/local/bin/healthcheck.sh

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD curl -f http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
CMD ["http-server", "dist", "-p", "8080", "--cors"]
