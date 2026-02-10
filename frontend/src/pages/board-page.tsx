
import React from 'react';
import { useAuth } from '../context/auth-context';
import { useNavigate } from 'react-router-dom';
import { Board } from '../features/board/Board';

export const BoardPage: React.FC = () => {
  const { setApiKey } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    setApiKey('');
    navigate('/login');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm border-b">
        <h1 className="text-xl font-bold text-gray-800">Kanban Board</h1>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          Logout
        </button>
      </header>
      <main className="flex-1 p-6 overflow-hidden">
        <Board />
      </main>
    </div>
  );
};
