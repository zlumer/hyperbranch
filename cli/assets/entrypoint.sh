#!/bin/sh
# exec npx -y opencode-ai run --file "${HYPERBRANCH_TASK_FILE}" -- "${HYPERBRANCH_PROMPT}"
git config --global --add safe.directory /app
opencode web --port 4096 --hostname 0.0.0.0 --print-logs
