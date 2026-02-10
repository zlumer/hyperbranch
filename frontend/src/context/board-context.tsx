import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import { type Task, type TaskStatus, getTasks, updateTaskStatus, updateTaskOrder, createTask } from '../api/mock-service';

// Define the shape of our context
interface BoardContextType {
  tasks: Task[];
  columns: TaskStatus[];
  isLoading: boolean;
  moveTask: (taskId: string, newStatus: TaskStatus, newIndex?: number) => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'order'>) => Promise<void>;
  refreshTasks: () => Promise<void>;
}

const BoardContext = createContext<BoardContextType | undefined>(undefined);

export const COLUMNS: TaskStatus[] = ['todo', 'in-progress', 'done'];

export function BoardProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshTasks = async () => {
    setIsLoading(true);
    try {
      const fetchedTasks = await getTasks();
      setTasks(fetchedTasks);
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshTasks();
  }, []);

  const moveTask = async (taskId: string, newStatus: TaskStatus, newIndex?: number) => {
    // Optimistic update
    setTasks((prevTasks) => {
      const task = prevTasks.find(t => t.id === taskId);
      if (!task) return prevTasks;

      const otherTasks = prevTasks.filter(t => t.id !== taskId);
      const updatedTask = { ...task, status: newStatus };

      // If no index provided (simple status change), append to end of new status list
      if (newIndex === undefined) {
          // This logic is simple, but for reordering we need index
          // If we don't have index, we can just update status and let mock backend handle order or keep it simple
           return [...otherTasks, updatedTask]; 
      }

      // If index provided, we need to insert at correct position
      const tasksInTargetColumn = otherTasks.filter(t => t.status === newStatus).sort((a, b) => a.order - b.order);
      const tasksInOtherColumns = otherTasks.filter(t => t.status !== newStatus);

      tasksInTargetColumn.splice(newIndex, 0, updatedTask);
      
      // Re-assign orders
      const reorderedTargetColumn = tasksInTargetColumn.map((t, index) => ({ ...t, order: index }));

      return [...tasksInOtherColumns, ...reorderedTargetColumn];
    });

    try {
      if (newIndex !== undefined) {
          await updateTaskOrder(taskId, newStatus, newIndex);
      } else {
          await updateTaskStatus(taskId, newStatus);
      }
    } catch (error) {
      console.error('Failed to update task status:', error);
      // Revert on failure
      refreshTasks();
    }
  };

  const addTask = async (task: Omit<Task, 'id' | 'order'>) => {
    try {
      const newTask = await createTask(task);
      setTasks((prev) => [...prev, newTask]);
    } catch (error) {
      console.error('Failed to create task:', error);
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
    [tasks, isLoading]
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoardContext() {
  const context = useContext(BoardContext);
  if (context === undefined) {
    throw new Error('useBoardContext must be used within a BoardProvider');
  }
  return context;
}
