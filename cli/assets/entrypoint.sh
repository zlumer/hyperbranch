#!/bin/sh
# exec npx -y opencode-ai run --file "${HYPERBRANCH_TASK_FILE}" -- "${HYPERBRANCH_PROMPT}"
npx -y opencode-ai web --port 4096 --hostname 0.0.0.0 --print-logs
