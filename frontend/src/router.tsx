import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { LoginPage } from './pages/login-page';
import { BoardPage } from './pages/board-page';
import { TaskDetailsPage } from './pages/task-details-page';
import { RunWorkspacePage } from './pages/run-workspace-page';
import { useAuth } from './context/auth-context';

const ProtectedRoute = () => {
  const { apiKey } = useAuth();
  if (!apiKey) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
};

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
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
