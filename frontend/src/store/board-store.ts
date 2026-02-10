
import { machine, st, defineFlow, type XModel, type XCmd } from 'tesm';
import { type Task, type TaskStatus, getTasks, updateTaskStatus, createTask } from '../api/mock-service';
import { useTeaSimple } from 'tesm/react';

export interface BoardData {
  tasks: Task[];
  columns: TaskStatus[];
}

type LoadingContext = Record<string, never>;
type LoadedContext = BoardData;

const m = machine(
  {
    loading: st<LoadingContext>(),
    loaded: st<LoadedContext>(),
  },
  {
    fetchTasksSuccess: (tasks: Task[]) => ({ tasks }),
    moveTask: (taskId: string, newStatus: TaskStatus) => ({ taskId, newStatus }),
    createTaskSuccess: (task: Task) => ({ task }),
    createTask: (task: Omit<Task, 'id'>) => ({ task }),
  },
  {
    fetchTasks: () => ({}),
    updateTaskStatus: (taskId: string, newStatus: TaskStatus) => ({ taskId, newStatus }),
    createTaskApi: (task: Omit<Task, 'id'>) => ({ task }),
  }
);

export const BoardFlow = defineFlow(
  m,
  'Board',
  () => [m.states.loading({}), m.cmds.fetchTasks()],
  {
    loading: {
      fetchTasksSuccess: ({ tasks }) => [
        m.states.loaded({
          tasks,
          columns: ['todo', 'in-progress', 'done']
        })
      ]
    },
    loaded: {
      moveTask: ({ taskId, newStatus }, model) => {
        const newTasks = model.tasks.map(t => 
          t.id === taskId ? { ...t, status: newStatus } : t
        );
        return [
          m.states.loaded({ ...model, tasks: newTasks }),
          m.cmds.updateTaskStatus(taskId, newStatus)
        ];
      },
      createTask: ({ task }, model) => [
        m.states.loaded(model),
        m.cmds.createTaskApi(task)
      ],
      createTaskSuccess: ({ task }, model) => [
        m.states.loaded({ ...model, tasks: [...model.tasks, task] })
      ]
    }
  }
);

export type BoardMsgs = ReturnType<typeof BoardFlow.msgCreator>;
export type BoardModel = XModel<typeof BoardFlow>;
export type BoardCmd = XCmd<typeof BoardFlow>;

export const useBoardStore = () => {
  return useTeaSimple(BoardFlow, {
    fetchTasks: async (_, msgs) => {
      try {
        const tasks = await getTasks();
        return msgs.fetchTasksSuccess(tasks);
      } catch (e) {
        console.error(e);
        return msgs.fetchTasksSuccess([]); 
      }
    },
    updateTaskStatus: async ({ taskId, newStatus }) => {
      try {
        await updateTaskStatus(taskId, newStatus);
        return [];
      } catch (e) {
        console.error(e);
        return []; 
      }
    },
    createTaskApi: async ({ task }, msgs) => {
      try {
        const newTask = await createTask(task);
        return msgs.createTaskSuccess(newTask);
      } catch (e) {
        console.error(e);
        return [];
      }
    }
  });
};
