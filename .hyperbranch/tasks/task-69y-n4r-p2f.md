---
id: 69y-n4r-p2f
status: todo
parent: null
dependencies: []
---
# Frontend Implementation Spec

### **1. Architecture**

*   **Frontend:** Single Page Application (SPA) built with **React** (Vite), **TypeScript**, and **Tailwind CSS**.
*   **Location:** `/frontend` directory in the project root (initialized as a standard Node.js/npm project).
*   **Backend:** Existing Deno/Hono server (`cli/server`) extended with new endpoints.
*   **Communication:** REST API for data, WebSocket for real-time logs.
*   **Authentication:** User-provided `HB_API_KEY` (stored in `localStorage`).
*   **Component Library:** **shadcn/ui**.

### **2. Data Model & Hierarchy**
The application follows this hierarchy:
1.  **Board:** The high-level view of all work.
    *   **Columns:** Mapped to `TaskStatus` (`todo`, `in_progress`, `review`, `done`, `cancelled`).
    *   **Cards:** Represent **Tasks**.
2.  **Task:** A unit of work defined by a Markdown file.
    *   **Properties:** Title, Status, Parent/Dependencies.
    *   **Content:** Description/Spec (Markdown).
    *   **Runs:** A history of agent executions attempting to complete the task.
3.  **Run:** A specific execution instance (git branch + container).
    *   **State:** Active (Running) or Stopped.
    *   **Workspace:** A dedicated file system (git worktree).
    *   **Artifacts:** Logs (stored in predictable locations), modified files.

### **3. Features**

**A. Kanban Board (Home)**
*   **Columns:** 5 standard columns.
*   **Drag & Drop:** Move tasks between columns to update status (`PATCH /tasks/:id`).
*   **Create Task:** "New Task" button to create a task (`POST /tasks`).
*   **Indicators:** Visual cues for "Active Run" (e.g., a spinning icon) and "Dependencies" (list view).

**B. Task Details (Modal/Page)**
*   **Overview Tab:** Edit title, description, and manage dependencies.
*   **Runs Tab:** List of all runs (past and present).
    *   Shows Run ID (Branch Name).
    *   Actions: "New Run" (Start Agent), "Stop" (if active), "Merge" (if successful).

**C. Run Workspace (Deep View)**
*   **Log Viewer:** Real-time stream of the agent's output (via WebSocket). Reads from the standard log file location.
*   **File Browser:** Tree view of the files in that specific run's worktree.
    *   Clicking a file displays its content (Read-only syntax highlighted).
*   **Merge Action:** Button to merge the run's worktree/branch back to the main branch.
    *   **Options:** Rebase, Squash, or Standard Merge.
    *   **Cleanup:** Checkbox to delete the run branch/worktree after merge.

### **4. Backend Implementation Plan**

I will extend the existing `cli/server` with the following:

**New Service Methods (`cli/services/runs.ts` & `cli/utils/git.ts`):**
*   `listRuns(taskId)`: Returns all run branches for a task. No extra metadata persistence required.
*   `getRunFiles(runId, path)`: Lists files or returns content from the run's worktree.
*   `mergeRun(runId, strategy, cleanup)`: Merges the run branch into the base branch with the chosen strategy and optional cleanup.

**New API Endpoints (`cli/server/routes/tasks.ts`):**
*   `GET /tasks/:id/runs`: List history.
*   `GET /tasks/:id/runs/:runId/files`: Browse workspace.
*   `POST /tasks/:id/runs/:runId/merge`: Merge code (payload: `{ strategy: 'rebase'|'squash'|'merge', cleanup: boolean }`).
*   `GET /tasks/:id/runs/:runId/logs`: WebSocket (parameterized for specific runs, reading from existing log files).

---

### **Execution Plan**

1.  **Backend Expansion:**
    *   Implement the missing Service methods in `cli/services/runs.ts` and `cli/utils/git.ts`.
    *   Add the new routes in `cli/server/routes/tasks.ts`.
    *   Verify with `deno test`.

2.  **Frontend Initialization:**
    *   Scaffold React+Vite app in `frontend/` (Node.js).
    *   Install dependencies (`axios`, `react-router-dom`, `dnd-kit` or `react-beautiful-dnd`, `lucide-react`, `tailwindcss`, `shadcn/ui`).
    *   Configure Proxy in Vite to point to `http://localhost:8000`.

3.  **Frontend Implementation:**
    *   **Phase 1:** API Client & Auth (Key input).
    *   **Phase 2:** Kanban Board (List, Create, Move).
    *   **Phase 3:** Task Details & Run Management.
    *   **Phase 4:** Log Viewer & File Browser.

4.  **Integration & Polish:**
    *   Ensure Drag & Drop updates backend.
    *   Verify WebSocket connection for logs (live and historical).
    *   Style with Tailwind and shadcn/ui for a clean, dark-mode-ready aesthetic.
