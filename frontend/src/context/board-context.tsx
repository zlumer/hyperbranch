import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createTask,
  getTasks,
  type Task,
  type TaskStatus,
  updateTaskStatus,
} from "../api/service";

interface BoardContextType {
  tasks: Task[];
  columns: TaskStatus[];
  isLoading: boolean;
  moveTask: (
    taskId: string,
    newStatus: TaskStatus,
    newIndex?: number,
  ) => Promise<void>;
  addTask: (task: { title: string; parentId?: string }) => Promise<void>;
  refreshTasks: () => Promise<void>;
}

const BoardContext = createContext<BoardContextType | undefined>(undefined);

export const COLUMNS: TaskStatus[] = [
  "todo",
  "plan",
  "build",
  "review",
  "done",
  "cancelled",
];

export function BoardProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshTasks = async () => {
    setIsLoading(true);
    try {
      const fetchedTasks = await getTasks();
      setTasks(fetchedTasks);
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshTasks();
  }, []);

  const moveTask = async (
    taskId: string,
    newStatus: TaskStatus,
    newIndex?: number,
  ) => {
    setTasks((prevTasks) => {
      const taskIndex = prevTasks.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) return prevTasks;

      const task = prevTasks[taskIndex];
      const newTasks = [...prevTasks];
      newTasks.splice(taskIndex, 1);

      const updatedTask = { ...task, status: newStatus };
      newTasks.push(updatedTask);
      return newTasks;
    });

    try {
      await updateTaskStatus(taskId, newStatus);
    } catch (error) {
      console.error("Failed to update task status:", error);
      refreshTasks();
    }
  };

  const addTask = async (task: { title: string; parentId?: string }) => {
    try {
      const newTask = await createTask(task);
      setTasks((prev) => [...prev, newTask]);
    } catch (error) {
      console.error("Failed to create task:", error);
    }
  };

  const value = useMemo(
    () => ({
      tasks,
      columns: COLUMNS,
      isLoading,
      moveTask,
      addTask,
      refreshTasks,
    }),
    [tasks, isLoading],
  );

  return <BoardContext.Provider value={value}>{children}
  </BoardContext.Provider>;
}

export function useBoardContext() {
  const context = useContext(BoardContext);
  if (context === undefined) {
    throw new Error("useBoardContext must be used within a BoardProvider");
  }
  return context;
}
