import { createBrowserRouter, Outlet } from 'react-router-dom';
import { BoardPage } from './pages/board-page';
import { TaskDetailsPage } from './pages/task-details-page';
import { RunWorkspacePage } from './pages/run-workspace-page';

const ProtectedRoute = () => {
  return <Outlet />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <BoardPage />,
      },
      {
        path: '/tasks/:taskId',
        element: <TaskDetailsPage />,
      },
      {
        path: '/tasks/:taskId/runs/:runId',
        element: <RunWorkspacePage />,
      },
    ],
  },
]);
