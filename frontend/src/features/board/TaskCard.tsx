
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type Task } from '../../api/mock-service';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

interface TaskCardProps {
  task: Task;
  className?: string;
}

export function TaskCard({ task, className }: TaskCardProps) {
  const navigate = useNavigate();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleClick = () => {
    if (!isDragging) {
      navigate(`/tasks/${task.id}`);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={cn(
        "bg-white p-4 rounded-lg shadow-sm mb-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow border border-gray-200",
        className
      )}
    >
      <div className="text-xs text-gray-500 font-mono mb-1">#{task.id}</div>
      <h3 className="font-medium text-gray-900">{task.title}</h3>
    </div>
  );
}
