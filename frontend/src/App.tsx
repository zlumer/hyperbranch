import { RouterProvider } from 'react-router-dom';
import { BoardProvider } from './context/board-context';
import { router } from './router';

function App() {
  return (
      <BoardProvider>
        <RouterProvider router={router} />
      </BoardProvider>
  );
}

export default App;
