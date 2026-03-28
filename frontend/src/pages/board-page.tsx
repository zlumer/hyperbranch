
import React from 'react';
import { Board } from '../features/board/Board';

export const BoardPage: React.FC = () => {
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm border-b">
        <h1 className="text-xl font-bold text-gray-800">hyperbranch</h1>
      </header>
      <main className="flex-1 p-6 overflow-hidden">
        <Board />
      </main>
    </div>
  );
};
