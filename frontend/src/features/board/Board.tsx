
import { 
  DndContext, 
  type DragEndEvent, 
  DragOverlay, 
  type DragStartEvent, 
  PointerSensor, 
  useSensor, 
  useSensors,
  useDroppable
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useBoardStore } from '../../store/board-store';
import { type Task, type TaskStatus } from '../../api/mock-service';
import { TaskCard } from './TaskCard';
import { useState } from 'react';
import { cn } from '../../lib/utils';

const COLUMNS: TaskStatus[] = ['todo', 'in-progress', 'done'];

function Column({ status, tasks }: { status: TaskStatus, tasks: Task[] }) {
  const { setNodeRef } = useDroppable({ id: status });
  
  return (
    <div 
      ref={setNodeRef} 
      className={cn(
        "flex-1 min-w-[300px] bg-gray-100 rounded-lg p-4 flex flex-col",
        "border-2 border-transparent transition-colors",
      )}
    >
      <h2 className="font-bold text-lg mb-4 uppercase text-gray-700 flex items-center justify-between">
        {status}
        <span className="bg-gray-200 text-gray-600 text-sm px-2 py-1 rounded-full">{tasks.length}</span>
      </h2>
      <SortableContext 
          id={status}
          items={tasks.map(t => t.id)} 
          strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-3 min-h-[100px]">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function Board() {
  const [model, msgs] = useBoardStore();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  if (model.state === 'loading') {
    return (
        <div className="flex items-center justify-center h-full">
            <div className="text-xl text-gray-500 animate-pulse">Loading board...</div>
        </div>
    );
  }
  
  const tasks = model.state === 'loaded' ? model.tasks : [];
  
  const getTasksByStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    
    if (activeId === overId) return;

    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    let newStatus: TaskStatus | undefined;

    // Check if dropped on a column
    if (COLUMNS.includes(overId as TaskStatus)) {
        newStatus = overId as TaskStatus;
    } else {
        // Dropped on another task
        const overTask = tasks.find((t) => t.id === overId);
        if (overTask) {
            newStatus = overTask.status;
        }
    }

    if (newStatus && newStatus !== activeTask.status) {
        msgs.moveTask(activeId, newStatus);
    }
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <DndContext 
        sensors={sensors} 
        onDragStart={handleDragStart} 
        onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 h-full p-4 overflow-x-auto bg-gray-50 items-start">
        {COLUMNS.map((status) => (
          <Column key={status} status={status} tasks={getTasksByStatus(status)} />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} className="opacity-80 rotate-2 cursor-grabbing" /> : null}
      </DragOverlay>
    </DndContext>
  );
}
