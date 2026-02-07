---
id: 69x-afh-zd5
status: todo
parent: null
dependencies: []
---
# hb extract

Implement `hb extract` command.

Extracts a subtask from the main task.

1. Create a new task with parent set to the main task.
2. Title the new task based on the subtask description, make sure to follow the convention for task titles (short, descriptive).
3. Add a task description that includes:
   - the context of the subtask within the main task
   - any relevant details or requirements for completing the subtask
   - extract quotes from the main task that are relevant to the subtask verbatim
4. Update the main task to reference the new subtask, indicating that it has been extracted -- using a markdown link (`#<task-id>` or `[<task-id>]` connection).
5. If `--commit` is provided, commit the changes to both tasks with a message indicating the extraction of the subtask
