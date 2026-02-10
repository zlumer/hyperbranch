# Specification: Hyperbranch CLI (`hb.ts`)

## 1. Environment & Setup
*   **Runtime:** Deno.
*   **File:** Single file `hb.ts` (executable via `chmod +x`).
*   **Location:** Repository root (wrapper script) or directly in path.
*   **Dependencies:**
    *   `jsr:@std/flags` (Argument parsing)
    *   `jsr:@std/yaml` (Frontmatter parsing/stringifying)
    *   `jsr:@std/path` (Path manipulation)
    *   `jsr:@std/fs` (File checks)

## 2. Data Structures

### Task ID
*   **Format:** Base36, 9 characters, dash-separated (`xxx-xxx-xxx`).
*   **Algorithm:**
    ```typescript
    const now = Date.now();
    const rnd = Math.floor(Math.random() * 10);
    const numId = now * 10 + rnd;
    const id = numId.toString(36).padStart(9, '0').replace(/.{3}(?!$)/g, '$&-');
    ```

### File System
*   **Directory:** `.hyperbranch/tasks/`
*   **Filename:** `task-{id}.md`
*   **Format:**
    ```markdown
    ---
    id: 01i-qre-70w
    status: todo
    parent: null
    dependencies: []
    ---
    # Task Title From Argument

    User content...
    ```

## 3. Commands

### `create`
**Usage:** `./hb.ts create [options] <title>`
*   **Arguments:**
    *   `title`: String (required). Becomes the H1 header in the file body.
*   **Options:**
    *   `--parent <id>`: Sets `parent: <id>` in frontmatter. Validates parent exists.
    *   `--edit`: Opens the generated file in `$EDITOR` after creation.
*   **Logic:**
    1. Generate ID.
    2. Check if parent exists (if provided).
    3. Write file to `.hyperbranch/tasks/task-{id}.md`.
    4. If `--edit`, spawn child process for `$EDITOR`.

### `connect`
**Usage:** `./hb.ts connect <task-id> [options]`
*   **Options:**
    *   `--depends-on <id>`: Appends `<id>` to `dependencies` list.
    *   `--child-of <id>`: Sets/Overwrites `parent: <id>`.
*   **Logic:**
    1. Load `<task-id>`.
    2. **Validation:** Ensure target IDs exist.
    3. **Cycle Detection (Recursive):**
        *   If adding dependency B to A: Traverse dependencies of B. If A is reached -> Error.
        *   If setting parent B for A: Traverse parent chain of B. If A is reached -> Error.
    4. Update frontmatter and save.

### `move`
**Usage:** `./hb.ts move <task-id> <new-status> [options]`
*   **Arguments:**
    *   `task-id`: Target task.
    *   `new-status`: One of `todo`, `plan`, `build`, `review`, `done`, `cancelled`.
*   **Options:**
    *   `--from-status <old-status>`: (Optional) Optimistic locking guard.
*   **Logic:**
    1. Load task.
    2. If `--from-status` is present, check if `current_status === from_status`. If not, exit with error.
    3. Update `status` field.
    4. Save file.

## 4. Implementation Details
*   **Frontmatter Preservation:** The script must read the raw file, separate YAML from Markdown, parse YAML, modify the object, and reconstruct the file without losing the Markdown body.
*   **Error Handling:**
    *   Missing `.hyperbranch/tasks` directory (create if missing? or error? *Assumption: Create recursively*).
    *   Task not found (Error).
    *   Circular dependency (Error with trace).

