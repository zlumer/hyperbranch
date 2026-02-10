
export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  description?: string;
  order: number;
}

export type TaskStatus = Task['status'];

export interface Run {
  id: string;
  taskId: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  createdAt: string;
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'error' | 'warn';
  message: string;
}

const tasks: Task[] = [
  { id: '1', title: 'Implement Login', status: 'done', description: 'Implement user authentication using JWT.', order: 0 },
  { id: '2', title: 'Set up Project', status: 'done', description: 'Initialize the repo and install dependencies.', order: 1 },
  { id: '3', title: 'Design Database', status: 'in-progress', description: 'Create the schema for users and tasks.', order: 0 },
  { id: '4', title: 'Create API Endpoints', status: 'todo', description: 'Build REST APIs for task management.', order: 0 },
  { id: '5', title: 'Frontend UI', status: 'todo', description: 'Develop the React application.', order: 1 },
];

const runs: Run[] = [
  { id: 'r1', taskId: '1', status: 'success', createdAt: '2023-10-26T10:00:00Z' },
  { id: 'r2', taskId: '1', status: 'failed', createdAt: '2023-10-25T14:30:00Z' },
  { id: 'r3', taskId: '3', status: 'running', createdAt: '2023-10-27T09:15:00Z' },
];

const mockFileTree: FileNode[] = [
  {
    name: 'src',
    path: 'src',
    type: 'directory',
    children: [
      { name: 'main.ts', path: 'src/main.ts', type: 'file' },
      { name: 'utils.ts', path: 'src/utils.ts', type: 'file' },
      {
        name: 'components',
        path: 'src/components',
        type: 'directory',
        children: [
          { name: 'Button.tsx', path: 'src/components/Button.tsx', type: 'file' },
          { name: 'Header.tsx', path: 'src/components/Header.tsx', type: 'file' },
        ]
      }
    ]
  },
  { name: 'package.json', path: 'package.json', type: 'file' },
  { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file' },
  { name: 'README.md', path: 'README.md', type: 'file' },
];

const mockFileContents: Record<string, string> = {
  'src/main.ts': `import { setup } from './utils';

console.log('Application starting...');
setup();
console.log('Application started.');`,
  'src/utils.ts': `export function setup() {
  console.log('Setting up environment...');
  // Simulate setup work
}`,
  'src/components/Button.tsx': `import React from 'react';

export const Button = ({ children }) => (
  <button className="px-4 py-2 bg-blue-500 text-white rounded">
    {children}
  </button>
);`,
  'src/components/Header.tsx': `import React from 'react';

export const Header = () => (
  <header className="p-4 border-b">
    <h1>My App</h1>
  </header>
);`,
  'package.json': `{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0"
  }
}`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}`,
  'README.md': `# My App

This is a sample application.
`
};

const mockLogs: LogEntry[] = [
  { timestamp: '2023-10-27T09:15:01Z', level: 'info', message: 'Initializing workspace...' },
  { timestamp: '2023-10-27T09:15:02Z', level: 'info', message: 'Cloning repository...' },
  { timestamp: '2023-10-27T09:15:05Z', level: 'info', message: 'Installing dependencies...' },
  { timestamp: '2023-10-27T09:15:15Z', level: 'info', message: 'Build started...' },
];

export const getTasks = async (): Promise<Task[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([...tasks]);
    }, 500); // Simulate network delay
  });
};

export const getTask = async (id: string): Promise<Task> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        resolve({ ...task });
      } else {
        reject(new Error('Task not found'));
      }
    }, 300);
  });
};

export const getRuns = async (taskId: string): Promise<Run[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(runs.filter((r) => r.taskId === taskId));
    }, 300);
  });
};

export const getRun = async (runId: string): Promise<Run> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const run = runs.find((r) => r.id === runId);
      if (run) {
        resolve({ ...run });
      } else {
        reject(new Error('Run not found'));
      }
    }, 300);
  });
};

export const updateTaskStatus = async (id: string, status: TaskStatus): Promise<Task> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const taskIndex = tasks.findIndex((t) => t.id === id);
      if (taskIndex > -1) {
        tasks[taskIndex].status = status;
        resolve({ ...tasks[taskIndex] });
      } else {
        reject(new Error('Task not found'));
      }
    }, 300);
  });
};

export const updateTaskOrder = async (id: string, status: TaskStatus, newOrder: number): Promise<Task> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const taskIndex = tasks.findIndex((t) => t.id === id);
            if (taskIndex > -1) {
                const task = tasks[taskIndex];
                
                // Remove task from old position/status logic if needed, but here we just update
                task.status = status;
                
                // Shift other items if necessary - simple implementation: just set order
                // In a real app, we'd shift other items' orders
                tasks.forEach(t => {
                    if (t.status === status && t.order >= newOrder && t.id !== id) {
                        t.order++;
                    }
                });
                
                task.order = newOrder;
                resolve({ ...task });
            } else {
                reject(new Error('Task not found'));
            }
        }, 300);
    });
};

export const createTask = async (task: Omit<Task, 'id' | 'order'>): Promise<Task> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const newTask: Task = { 
          ...task, 
          id: Math.random().toString(36).substr(2, 9),
          order: tasks.filter(t => t.status === task.status).length 
      };
      tasks.push(newTask);
      resolve(newTask);
    }, 300);
  });
};

export const getFiles = async (_runId: string, _path?: string): Promise<FileNode[]> => {
  // In a real app, we might fetch specific path, but for mock we return whole tree
  // ignoring path for now or filtering if needed. 
  // Let's just return the root level mockFileTree
  return new Promise((resolve) => {
    setTimeout(() => {
        resolve(mockFileTree);
    }, 300);
  });
};

export const getFileContent = async (_runId: string, path: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const content = mockFileContents[path];
            if (content !== undefined) {
                resolve(content);
            } else {
                reject(new Error('File not found'));
            }
        }, 200);
    });
};

export const getLogs = async (_runId: string): Promise<LogEntry[]> => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([...mockLogs]);
        }, 100);
    });
};
