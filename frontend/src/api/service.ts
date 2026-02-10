import { apiClient } from "./client";

export interface Task {
  id: string;
  title: string;
  status: "todo" | "plan" | "build" | "review" | "done" | "cancelled";
  description?: string;
  order: number;
}

export type TaskStatus = Task["status"];

export interface Run {
  id: string;
  taskId: string;
  status: string;
  createdAt: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "error" | "warn";
  message: string;
}

export const getTasks = async (): Promise<Task[]> => {
  const res = await apiClient.get("/tasks");
  return res.data.map((t: any, index: number) => ({
    id: t.id,
    title: t.title,
    status: t.frontmatter?.status || "todo",
    description: t.body,
    order: index,
  }));
};

export const getTask = async (id: string): Promise<Task> => {
  const res = await apiClient.get(`/tasks/${id}`);
  const t = res.data;
  return {
    id: t.id,
    title: t.title,
    status: t.frontmatter?.status || "todo",
    description: t.body,
    order: 0,
  };
};

export const createTask = async (
  task: { title: string; parentId?: string },
): Promise<Task> => {
  const res = await apiClient.post("/tasks", task);
  const t = res.data;
  return {
    id: t.id,
    title: t.title,
    status: t.frontmatter?.status || "todo",
    description: t.body,
    order: 0,
  };
};

export const updateTaskStatus = async (
  id: string,
  status: TaskStatus,
): Promise<Task> => {
  const res = await apiClient.patch(`/tasks/${id}`, { status });
  const t = res.data;
  return {
    id: t.id,
    title: t.title,
    status: t.frontmatter?.status || "todo",
    description: t.body,
    order: 0,
  };
};

export const updateTaskOrder = async (
  id: string,
  status: TaskStatus,
  _newOrder: number,
): Promise<Task> => {
  return updateTaskStatus(id, status);
};

export const getRuns = async (taskId: string): Promise<Run[]> => {
  const res = await apiClient.get(`/tasks/${taskId}/runs`);
  return res.data.map((r: any) => ({
    id: r.runId,
    taskId,
    status: r.status,
    createdAt: "",
  }));
};

export const getRun = async (taskId: string, runId: string): Promise<Run> => {
  const runs = await getRuns(taskId);
  const run = runs.find((r) => String(r.id) === String(runId));
  if (!run) throw new Error("Run not found");
  return run;
};

export const getFiles = async (
  taskId: string,
  runId: string,
  path: string = "",
): Promise<FileNode[]> => {
  const res = await apiClient.get(`/tasks/${taskId}/runs/${runId}/files`, {
    params: { path },
  });
  if (res.data.type === "dir") {
    return res.data.files.map((f: any) => ({
      name: f.path.split("/").pop(),
      path: f.path,
      type: f.type === "tree" ? "directory" : "file",
    }));
  }
  return [];
};

export const getFileContent = async (
  taskId: string,
  runId: string,
  path: string,
): Promise<string> => {
  const res = await apiClient.get(`/tasks/${taskId}/runs/${runId}/files`, {
    params: { path },
  });
  if (res.data.type === "file") {
    return res.data.content;
  }
  throw new Error("Not a file");
};

export const getLogsWebSocketUrl = (taskId: string, runId: string) => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/api/tasks/${taskId}/runs/${runId}/logs`;
};
