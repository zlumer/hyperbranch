import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/auth-context';
import { BoardProvider } from './context/board-context';
import { router } from './router';

function App() {
  return (
    <AuthProvider>
      <BoardProvider>
        <RouterProvider router={router} />
      </BoardProvider>
    </AuthProvider>
  );
}

export default App;
