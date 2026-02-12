#!/bin/sh
exec npx -y opencode-ai run --file ".hyperbranch/tasks/task-${HB_TASK_ID}.md" -- "Please complete this task."
