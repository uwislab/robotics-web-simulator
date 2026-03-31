#!/bin/sh
# Simple healthcheck: request homepage and verify demo output exists
URL="http://127.0.0.1:8080/"
# We can't execute JS in the healthcheck, so look for a static marker present in the served HTML
EXPECTED_PATTERN="Loading picoc-js|picoc-js demo|Robotics Web Simulator"

out=$(curl -s --max-time 3 "$URL" || true)
if echo "$out" | grep -E -q "$EXPECTED_PATTERN"; then
  exit 0
fi
echo "healthcheck failed: expected pattern '$EXPECTED_PATTERN' not found" >&2
exit 1
